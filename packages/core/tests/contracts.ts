// Compile against the package export and built declarations, as a consumer does.
import type {
  ChaosAction,
  ChaosEvent,
  ChaosRule,
  ChaosScenario,
  DeliveryResult,
  EventMatch,
  Target,
} from '@chaospay/core';

export const event = {
  id: 'evt_123',
  type: 'payment.captured',
  payload: { paymentId: 'pay_123' },
  timestamp: '2026-10-13T00:00:00.000Z',
} satisfies ChaosEvent;

export const target = {
  url: 'http://localhost:3000/webhook',
  headers: { 'Content-Type': 'application/json' },
} satisfies Target;

const match = { eventType: event.type } satisfies EventMatch;
const duplicate = { type: 'duplicate', count: 2 } satisfies ChaosAction;
const rule = { match, action: duplicate } satisfies ChaosRule;

export const scenario = {
  name: 'duplicate-and-reorder',
  seed: 123,
  rules: [
    rule,
    { action: { type: 'delay', milliseconds: 50 } },
    { action: { type: 'reorder' } },
    { match: { eventType: 'ignored.event' }, action: { type: 'drop' } },
  ],
} as const satisfies ChaosScenario;

const attempt = {
  eventId: event.id,
  deliveryId: 'del_123',
  attemptId: 'attempt_123',
  attempt: 1,
  attemptedAt: '2026-10-13T00:00:01.000Z',
  latencyMs: 24,
};

export const results = [
  { ...attempt, outcome: 'success', status: 200, statusText: 'OK' },
  { ...attempt, outcome: 'http-error', status: 500, statusText: '' },
  { ...attempt, outcome: 'timeout', error: 'Deadline exceeded' },
  { ...attempt, outcome: 'network-error', error: 'Connection refused' },
] satisfies DeliveryResult[];

// Consumers can exhaustively classify outcomes and access their specific fields.
export function describe(result: DeliveryResult): string {
  switch (result.outcome) {
    case 'success':
    case 'http-error':
      return result.status.toString();
    case 'timeout':
    case 'network-error':
      return result.error;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

// @ts-expect-error An HTTP result must carry a response status.
export const missingStatus: DeliveryResult = {
  ...attempt,
  outcome: 'success',
  statusText: 'OK',
};

const timeoutWithStatus = {
  ...attempt,
  outcome: 'timeout' as const,
  error: 'Deadline exceeded',
  status: 504,
};
// @ts-expect-error A timeout cannot claim an HTTP response, even via a variable.
export const inventedStatus: DeliveryResult = timeoutWithStatus;

// @ts-expect-error HTTP failure is represented by its response, not a transport error.
export const mixedFailure: DeliveryResult = {
  ...attempt,
  outcome: 'http-error',
  status: 500,
  statusText: '',
  error: 'Network error',
};

// @ts-expect-error Duplicate counts must be supplied explicitly.
export const missingCount: ChaosAction = { type: 'duplicate' };
// @ts-expect-error Delay uses milliseconds, not a configuration-specific duration string.
export const invalidDelay: ChaosAction = { type: 'delay', milliseconds: '5s' };
// @ts-expect-error Reorder has no duplicate count parameter.
export const mixedAction: ChaosAction = { type: 'reorder', count: 2 };
// @ts-expect-error Provider-specific actions are outside the core contract.
export const providerAction: ChaosAction = { type: 'stripe-invalid-signature' };

export function inspectPayload(value: ChaosEvent): void {
  // @ts-expect-error Provider-agnostic payloads require narrowing before field access.
  void value.payload.paymentId;
  // @ts-expect-error Delivery mutations must not overwrite event occurrence time.
  value.timestamp = '2026-10-14T00:00:00.000Z';
}
