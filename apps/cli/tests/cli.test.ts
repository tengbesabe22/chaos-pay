import { expect, it, vi } from 'vitest';
import type { DeliveryResult, deliverWebhook } from '@chaospay/core';
import { runCli } from '../src/cli.js';

const args = [
  'send',
  '--target',
  'http://localhost:3000/webhook',
  '--type',
  'payment.captured',
  '--data',
  '{"amount":10000}',
];
const metadata = {
  eventId: 'evt_1',
  deliveryId: 'del_1',
  attemptId: 'attempt_1',
  attempt: 1,
  attemptedAt: '2026-10-26T00:00:00.000Z',
  latencyMs: 24.2,
};
function harness(
  result: DeliveryResult = {
    ...metadata,
    outcome: 'success',
    status: 200,
    statusText: 'OK',
  },
) {
  const stdout = { write: vi.fn() };
  const stderr = { write: vi.fn() };
  const send = vi.fn<typeof deliverWebhook>().mockResolvedValue(result);
  return { stdout, stderr, send };
}

it('parses a send command, generates event IDs, and reports success', async () => {
  const io = harness();
  expect(await runCli(args, io)).toBe(0);
  expect(io.send).toHaveBeenCalledWith({
    event: {
      id: expect.any(String),
      type: 'payment.captured',
      payload: { amount: 10000 },
    },
    target: { url: 'http://localhost:3000/webhook' },
    timeoutMs: 5000,
  });
  expect(io.stdout.write).toHaveBeenCalledWith(
    'ChaosPay\n\nEvent:\n  payment.captured\n\nTarget:\n  http://localhost:3000/webhook\n\nResult:\n  200 OK\n  24ms\n',
  );
  expect(io.stderr.write).not.toHaveBeenCalled();
  await runCli(args, io);
  expect(io.send.mock.calls[0]![0].event.id).not.toBe(
    io.send.mock.calls[1]![0].event.id,
  );
});

it.each(['null', 'false', '0', '"text"', '[]'])(
  'accepts JSON payload %s and an explicit deadline',
  async (data) => {
    const io = harness();
    expect(
      await runCli([...args.slice(0, -1), data, '--timeout=250'], io),
    ).toBe(0);
    expect(io.send.mock.calls[0]![0]).toMatchObject({
      event: { payload: JSON.parse(data) },
      timeoutMs: 250,
    });
  },
);

it.each([
  {
    ...metadata,
    outcome: 'http-error',
    status: 500,
    statusText: 'Internal Server Error',
  },
  { ...metadata, outcome: 'timeout', error: 'Delivery exceeded 5000ms' },
  { ...metadata, outcome: 'network-error', error: 'Connection refused' },
] satisfies DeliveryResult[])(
  'returns 1 and reports $outcome',
  async (result) => {
    const io = harness(result);
    expect(await runCli(args, io)).toBe(1);
    expect(io.stdout.write).toHaveBeenCalledWith(
      expect.stringContaining(
        result.outcome === 'http-error'
          ? '500 Internal Server Error'
          : `${result.outcome}: ${result.error}`,
      ),
    );
    expect(io.send).toHaveBeenCalledTimes(1);
  },
);

it.each(
  [[], ['--help'], ['-h'], ['send', '--help'], ['send', '-h']].map((input) => ({
    input,
  })),
)('shows help without delivery: %j', async ({ input }) => {
  const io = harness();
  expect(await runCli(input, io)).toBe(0);
  expect(io.stdout.write).toHaveBeenCalledWith(
    expect.stringContaining('Usage:'),
  );
  expect(io.send).not.toHaveBeenCalled();
});

it.each(
  [
    ['unknown'],
    ['send'],
    [...args, '--unknown'],
    [...args, 'extra'],
    [...args, '--type', 'another'],
    [...args, '--timeout=10', '--timeout=20'],
    [...args.slice(0, -1)],
    [...args.slice(0, -1), '{bad'],
    ['send', '--target', 'http://localhost:3000', '--data', '{}'],
    ['send', '--type', 'payment.captured', '--data', '{}'],
    [
      'send',
      '--target',
      'http://localhost:3000',
      '--type',
      '  ',
      '--data',
      '{}',
    ],
    ...['relative', 'file:///tmp/test', 'http://user:pass@localhost'].map(
      (url) => ['send', '--target', url, ...args.slice(3)],
    ),
    ...[
      '0',
      '-1',
      '1.5',
      'NaN',
      'Infinity',
      '2147483648',
      '',
      '1e3',
      '0x10',
    ].map((timeout) => [...args, `--timeout=${timeout}`]),
  ].map((input) => ({ input })),
)('rejects invalid arguments without sending: %j', async ({ input }) => {
  const io = harness();
  expect(await runCli(input, io)).toBe(2);
  expect(io.stderr.write).toHaveBeenCalledWith(
    expect.stringContaining('Run chaospay --help'),
  );
  expect(io.stdout.write).not.toHaveBeenCalled();
  expect(io.send).not.toHaveBeenCalled();
});

it('handles an unexpected sender rejection without printing a stack trace', async () => {
  const io = harness();
  io.send.mockRejectedValue(new Error('Unexpected failure'));
  expect(await runCli(args, io)).toBe(1);
  expect(io.stderr.write).toHaveBeenCalledWith(
    'ChaosPay: delivery failed: Unexpected failure\n',
  );
});

it('removes terminal controls from reported response text', async () => {
  const io = harness({
    ...metadata,
    outcome: 'network-error',
    error: '\u001b[31mfailed\nagain',
  });
  await runCli(args, io);
  expect(io.stdout.write).toHaveBeenCalledWith(
    expect.stringContaining('network-error: failed again'),
  );
});
