# ChaosPay

Chaos testing for webhook-driven systems.

Your webhook handler works when everything arrives once, in order, and on time.
Production doesn't.

ChaosPay is being built to help backend developers test how their integrations
behave when webhook events are duplicated, delayed, dropped, or delivered out of
order. Its focus is a local-first workflow that can run on a developer's machine
and in CI, without an account or cloud infrastructure.

## Project status

ChaosPay is in early development. This repository currently contains the
TypeScript workspace, core contracts, a single-attempt HTTP webhook sender, and a CLI `send` command. Recording, replay,
and fault injection are not available yet. No npm release is available.

## Develop locally

Requires Node.js 22.13+ (22.x) or 24+, and pnpm 12.11.2.

```sh
git clone https://github.com/tengbesabe22/chaos-pay.git
cd chaos-pay
pnpm install
pnpm check
```

`pnpm check` runs formatting checks, linting, typechecking, the test runner, and
package builds. Tests cover core contracts and HTTP delivery behavior.

To see the available CLI options after building:

```sh
pnpm chaospay --help
```

## Try it locally

After installing dependencies, build the CLI:

```sh
pnpm build
```

In terminal 1, start the included receiver:

```sh
pnpm example:webhook
```

It listens on `127.0.0.1:3000`. In terminal 2, from the same repository, send a webhook:

```sh
pnpm chaospay send \
  --target http://127.0.0.1:3000/webhook \
  --type payment.captured \
  --data '{"paymentId":"pay_123","amount":10000}'
```

The receiver logs the payload, and the CLI reports `200 OK` with elapsed
milliseconds. Stop the receiver with Ctrl+C. If port 3000 is occupied, stop the
process using it before starting the example.

The [example receiver](examples/basic-webhook/server.mjs) accepts JSON bodies up
to 64 KiB. It returns `400` for invalid JSON, `413` for oversized bodies, `404`
for unknown paths, and `405` for methods other than POST on `/webhook`. It is a
local debugging example with no persistence, signature verification, or business
logic. You can also point `--target` at your own webhook endpoint.

## Send options

`--target`, `--type`, and `--data` are required. The request body is the JSON
payload directly; the event type is report metadata and is not added to the body.
Add `--timeout 3000` to change the default 5000ms delivery deadline. Each option
can appear only once. Use `send --help` for usage.

The CLI prints the event type, target, response status or failure, and elapsed
milliseconds. Completed delivery reports go to stdout; argument errors and
unexpected execution errors go to stderr. Exit codes are `0` for a successful
delivery or help, `1` for a delivery failure, and `2` for invalid arguments.
Redirects are reported as HTTP failures. There are no automatic retries.

## Repository structure

| Directory                | Purpose                                      |
| ------------------------ | -------------------------------------------- |
| `packages/core`          | Provider-independent webhook testing library |
| `apps/cli`               | Command-line interface                       |
| `examples/basic-webhook` | Local HTTP receiver for the quick-start      |

## Core API

See the [core contracts](docs/core-contracts.md) for event, target, delivery-result,
and scenario types, with examples and delivery semantics. The core also exports `deliverWebhook` for single-attempt JSON delivery.

## Contributing

GitHub Actions runs the project checks on Node 22 and 24 for pull requests and
pushes to `main`. See the [CI guide](docs/ci.md) for workflow details and how to
investigate failures.

Development commands:

```sh
pnpm build          # Build all packages
pnpm typecheck      # Check TypeScript types
pnpm lint           # Run ESLint
pnpm test           # Run the test suite
pnpm format         # Apply formatting
pnpm format:check   # Check formatting
```

For bugs, questions, or feature proposals, [open an issue](https://github.com/tengbesabe22/chaos-pay/issues).
