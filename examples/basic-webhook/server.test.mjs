import { Buffer } from 'node:buffer';
import { request } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWebhookServer } from './server.mjs';

const { fetch } = globalThis;

let server;
let url;
let log;
beforeEach(async () => {
  log = vi.fn();
  server = createWebhookServer(log);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}/webhook`;
});
afterEach(async () => {
  const closed = new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  server.closeAllConnections();
  await closed;
});

it('accepts and logs a JSON payload', async () => {
  const payload = { paymentId: 'pay_123', amount: 10000 };
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true });
  expect(log).toHaveBeenCalledWith(
    `Received webhook:\n${JSON.stringify(payload, null, 2)}`,
  );
});

it.each(['', '{broken'])('rejects invalid JSON: %j', async (body) => {
  const response = await fetch(url, { method: 'POST', body });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: 'Request body must contain valid JSON.',
  });
  expect(log).not.toHaveBeenCalled();
});

it('reports unsupported routes and methods', async () => {
  const missing = await fetch(`${url}/missing`);
  expect(missing.status).toBe(404);
  await missing.arrayBuffer();
  const wrongMethod = await fetch(url);
  expect(wrongMethod.status).toBe(405);
  expect(wrongMethod.headers.get('allow')).toBe('POST');
  await wrongMethod.arrayBuffer();
});

it('accepts exactly 64 KiB and rejects larger bodies by byte length', async () => {
  const body = JSON.stringify('a'.repeat(65534));
  expect(Buffer.byteLength(body)).toBe(65536);
  const accepted = await fetch(url, { method: 'POST', body });
  expect(accepted.status).toBe(200);
  await accepted.arrayBuffer();
  log.mockClear();
  const rejected = await fetch(url, {
    method: 'POST',
    body: JSON.stringify('é'.repeat(32768)),
  });
  expect(rejected.status).toBe(413);
  expect(await rejected.json()).toEqual({
    error: 'Request body exceeds 65536 bytes.',
  });
  expect(log).not.toHaveBeenCalled();
});

it('enforces the limit on chunked requests without Content-Length', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write('a'.repeat(32768));
    req.end('b'.repeat(32769));
  });
  expect(status).toBe(413);
  expect(log).not.toHaveBeenCalled();
});
