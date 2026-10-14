import { randomUUID } from 'node:crypto';
import type { DeliveryResult } from './delivery.js';
import type { ChaosEvent, Target } from './event.js';

export interface DeliverWebhookOptions {
  readonly event: ChaosEvent;
  readonly target: Target;
  /** Deadline through response completion; defaults to 5000 milliseconds. */
  readonly timeoutMs?: number;
}

function mergeHeaders(event: ChaosEvent, target: Target): Headers {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const map of [event.headers, target.headers]) {
    const seen = new Set<string>();
    for (const [name, value] of Object.entries(map ?? {})) {
      const key = name.toLowerCase();
      if (seen.has(key)) throw new TypeError(`Duplicate header: ${name}`);
      seen.add(key);
      if (typeof value !== 'string')
        throw new TypeError(`Invalid header: ${name}`);
      // Transport framing and routing must be controlled by the HTTP client.
      if (
        [
          'host',
          'content-length',
          'transfer-encoding',
          'connection',
          'upgrade',
          'expect',
          'trailer',
          'keep-alive',
        ].includes(key)
      ) {
        throw new TypeError(`Transport-managed header: ${name}`);
      }
      headers.set(name, value);
    }
  }
  return headers;
}

/** POST one JSON payload. Invalid input rejects; delivery failures return results. */
export async function deliverWebhook({
  event,
  target,
  timeoutMs = 5000,
}: DeliverWebhookOptions): Promise<DeliveryResult> {
  if (
    !event ||
    typeof event.id !== 'string' ||
    !event.id.trim() ||
    typeof event.type !== 'string' ||
    !event.type.trim()
  ) {
    throw new TypeError('Event id and type must be non-empty strings');
  }
  const url = new URL(target.url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new TypeError(
      'Target must be an HTTP(S) URL without embedded credentials',
    );
  }
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new TypeError(
      'timeoutMs must be an integer between 1 and 2147483647',
    );
  }
  const headers = mergeHeaders(event, target);
  const body = JSON.stringify(event.payload);
  if (body === undefined) throw new TypeError('Payload must serialize to JSON');

  const metadata = {
    eventId: event.id,
    deliveryId: randomUUID(),
    attemptId: randomUUID(),
    attempt: 1,
    attemptedAt: new Date().toISOString(),
  };
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    // Drain incrementally: include response completion in the deadline without
    // retaining arbitrarily large response bodies in memory.
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (!(await reader.read()).done) {
          /* discard */
        }
      } finally {
        reader.releaseLock();
      }
    }
    return {
      ...metadata,
      latencyMs: performance.now() - start,
      outcome: response.ok ? 'success' : 'http-error',
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      ...metadata,
      latencyMs: performance.now() - start,
      outcome: controller.signal.aborted ? 'timeout' : 'network-error',
      error: controller.signal.aborted
        ? `Delivery exceeded ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
