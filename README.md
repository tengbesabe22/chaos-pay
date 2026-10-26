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

## Send a webhook

With your webhook endpoint running, send a JSON payload from the local build:

```sh
pnpm chaospay send \
  --target http://localhost:3000/webhook \
  --type payment.captured \
  --data '{"paymentId":"pay_123","amount":10000}'
```

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

| Directory       | Purpose                                      |
| --------------- | -------------------------------------------- |
| `packages/core` | Provider-independent webhook testing library |
| `apps/cli`      | Command-line interface                       |

## Core API

See the [core contracts](docs/core-contracts.md) for event, target, delivery-result,
and scenario types, with examples and delivery semantics. The core also exports `deliverWebhook` for single-attempt JSON delivery.

## Contributing

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
