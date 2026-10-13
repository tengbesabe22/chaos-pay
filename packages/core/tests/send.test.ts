import { createServer, type RequestListener, type Server } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { deliverWebhook } from '../src/index.js';

const servers: Server[] = [];
async function endpoint(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  return `http://127.0.0.1:${address.port}/webhook`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});
const event = {
  id: 'evt_123',
  type: 'payment.captured',
  payload: { amount: 10000 },
};

it('posts only the payload, merges headers without mutation, and assigns attempt identities', async () => {
  let received: unknown;
  const url = await endpoint((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      received = {
        method: req.method,
        body,
        contentType: req.headers['content-type'],
        custom: req.headers['x-custom'],
      };
      res.end('ok');
    });
  });
  const input = Object.freeze({
    ...event,
    headers: Object.freeze({ 'X-Custom': 'event' }),
  });
  const target = Object.freeze({
    url,
    headers: Object.freeze({ 'x-custom': 'target' }),
  });
  const first = await deliverWebhook({ event: input, target });
  const second = await deliverWebhook({ event: input, target });
  expect(received).toEqual({
    method: 'POST',
    body: JSON.stringify(event.payload),
    contentType: 'application/json',
    custom: 'target',
  });
  expect(first).toMatchObject({
    outcome: 'success',
    status: 200,
    eventId: event.id,
    attempt: 1,
  });
  expect(first.deliveryId).not.toBe(second.deliveryId);
  expect(first.attemptId).not.toBe(second.attemptId);
  expect(first.latencyMs).toBeGreaterThanOrEqual(0);
  expect(Number.isNaN(Date.parse(first.attemptedAt))).toBe(false);
  expect(input.headers['X-Custom']).toBe('event');
});

it.each([204, 400, 429, 500, 504])('classifies HTTP %i', async (status) => {
  const url = await endpoint((_req, res) => {
    res.writeHead(status);
    res.end();
  });
  const result = await deliverWebhook({ event, target: { url } });
  expect(result).toMatchObject({
    outcome: status < 300 ? 'success' : 'http-error',
    status,
  });
});

it('does not follow redirects', async () => {
  let followed = false;
  const destination = await endpoint((_req, res) => {
    followed = true;
    res.end();
  });
  const url = await endpoint((_req, res) => {
    res.writeHead(302, { location: destination });
    res.end();
  });
  expect(await deliverWebhook({ event, target: { url } })).toMatchObject({
    outcome: 'http-error',
    status: 302,
  });
  expect(followed).toBe(false);
});

it.each([false, true])(
  'times out with partial response=%s',
  async (partial) => {
    const url = await endpoint((_req, res) => {
      if (partial) {
        res.writeHead(200);
        res.write('unfinished');
      }
    });
    const result = await deliverWebhook({
      event,
      target: { url },
      timeoutMs: 100,
    });
    expect(result.outcome).toBe('timeout');
    expect(result).not.toHaveProperty('status');
  },
);

it('reports a connection failure without a fabricated HTTP status', async () => {
  const url = await endpoint((req) => {
    req.socket.destroy();
  });
  const result = await deliverWebhook({ event, target: { url } });
  expect(result.outcome).toBe('network-error');
  expect(result).not.toHaveProperty('status');
});

it('rejects invalid input before contacting the endpoint', async () => {
  let requests = 0;
  const url = await endpoint((_req, res) => {
    requests++;
    res.end();
  });
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const payload of [undefined, 1n, circular]) {
    await expect(
      deliverWebhook({ event: { ...event, payload }, target: { url } }),
    ).rejects.toThrow();
  }
  for (const timeoutMs of [0, -1, Infinity, NaN, 0.5, 2_147_483_648]) {
    await expect(
      deliverWebhook({ event, target: { url }, timeoutMs }),
    ).rejects.toThrow();
  }
  for (const headers of [
    { 'X-A': '1', 'x-a': '2' },
    { 'Bad Header': 'x' },
    { 'X-A': 'bad\r\nvalue' },
    { 'Content-Length': '1' },
  ]) {
    await expect(
      deliverWebhook({ event, target: { url, headers } }),
    ).rejects.toThrow();
  }
  for (const invalidUrl of [
    'relative',
    'file:///tmp/test',
    'http://user:password@localhost',
  ]) {
    await expect(
      deliverWebhook({ event, target: { url: invalidUrl } }),
    ).rejects.toThrow();
  }
  expect(requests).toBe(0);
});
