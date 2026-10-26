import { randomUUID } from 'node:crypto';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { deliverWebhook, type DeliverWebhookOptions } from '@chaospay/core';

interface Output {
  write(text: string): unknown;
}

interface CliDependencies {
  stdout: Output;
  stderr: Output;
  send?: typeof deliverWebhook;
}

const help = `ChaosPay

Usage:
  chaospay send --target <url> --type <event-type> --data <json> [--timeout <ms>]

Options:
  --target <url>       HTTP(S) webhook destination (required)
  --type <event-type>  Event type used in the report (required)
  --data <json>        JSON payload sent directly as the request body (required)
  --timeout <ms>       Delivery deadline in milliseconds (default: 5000)
  -h, --help          Show help

Exit codes: 0 success/help, 1 delivery failure, 2 invalid arguments.
`;

// Keep user input and remote response text from injecting terminal controls.
function printable(text: string): string {
  return [...stripVTControlCharacters(text)]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159) ? ' ' : character;
    })
    .join('');
}

function parseSend(args: string[]): DeliverWebhookOptions | undefined {
  const { values, tokens } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    tokens: true,
    options: {
      target: { type: 'string' },
      type: { type: 'string' },
      data: { type: 'string' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== 'option') continue;
    if (seen.has(token.name))
      throw new Error(`Option --${token.name} may only be specified once`);
    seen.add(token.name);
  }
  if (values.help) return undefined;
  for (const name of ['target', 'type', 'data'] as const) {
    if (!values[name]?.trim())
      throw new Error(`Missing required option --${name}`);
  }
  // The loop above checks these values; explicit guards also narrow their types.
  if (
    values.target === undefined ||
    values.type === undefined ||
    values.data === undefined
  ) {
    throw new Error('Required options are missing');
  }
  let url: URL;
  try {
    url = new URL(values.target);
  } catch {
    throw new Error('--target must be an absolute HTTP(S) URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      '--target must be an HTTP(S) URL without embedded credentials',
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(values.data);
  } catch {
    throw new Error('--data must contain valid JSON');
  }
  const timeoutMs =
    values.timeout === undefined ? 5000 : Number(values.timeout);
  if (
    (values.timeout !== undefined && !/^\d+$/.test(values.timeout)) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new Error(
      '--timeout must be an integer between 1 and 2147483647 milliseconds',
    );
  }
  return {
    event: { id: randomUUID(), type: values.type, payload },
    target: { url: values.target },
    timeoutMs,
  };
}

/** Execute a command without owning process arguments or terminating the process. */
export async function runCli(
  args: string[],
  { stdout, stderr, send = deliverWebhook }: CliDependencies,
): Promise<0 | 1 | 2> {
  if (
    args.length === 0 ||
    (args.length === 1 && ['--help', '-h'].includes(args[0]!))
  ) {
    stdout.write(help);
    return 0;
  }
  let options: DeliverWebhookOptions | undefined;
  try {
    if (args[0] !== 'send') throw new Error(`Unknown command: ${args[0]}`);
    options = parseSend(args.slice(1));
  } catch (error) {
    stderr.write(
      `ChaosPay: ${printable(error instanceof Error ? error.message : String(error))}\nRun chaospay --help for usage.\n`,
    );
    return 2;
  }
  if (!options) {
    stdout.write(help);
    return 0;
  }
  try {
    const result = await send(options);
    const status =
      result.outcome === 'success' || result.outcome === 'http-error'
        ? `${result.status} ${result.statusText}`.trimEnd()
        : `${result.outcome}: ${result.error}`;
    stdout.write(
      `ChaosPay\n\nEvent:\n  ${printable(options.event.type)}\n\nTarget:\n  ${printable(options.target.url)}\n\nResult:\n  ${printable(status)}\n  ${Math.round(result.latencyMs)}ms\n`,
    );
    return result.outcome === 'success' ? 0 : 1;
  } catch (error) {
    stderr.write(
      `ChaosPay: delivery failed: ${printable(error instanceof Error ? error.message : String(error))}\n`,
    );
    return 1;
  }
}
