# ChaosPay

A local-first fault-injection test runner for webhook-driven systems.

Your webhook handler works when everything arrives once, in order, and on time.
Production doesn't. ChaosPay will help developers test duplicate, delayed,
dropped, and out-of-order delivery without an account or cloud infrastructure.

## Current scope

This first PR establishes the workspace and development tooling only. Sending,
recording, replay, and chaos scenarios are not implemented yet.

## Development

Requirements: Node.js 22.13+ (22.x) or 24+ and pnpm 12.11.2.

```sh
pnpm install
pnpm check
node apps/cli/dist/index.js
```

Individual checks are available as `pnpm build`, `pnpm typecheck`, `pnpm lint`,
`pnpm format:check`, and `pnpm test`. Run `pnpm format` to apply formatting.
Vitest currently permits zero tests because this PR introduces no product
behavior. Add behavioral tests and remove `--passWithNoTests` when implementing
core delivery.

TypeScript is kept at 6.0.3 because the latest `typescript-eslint` peer range
requires TypeScript below 6.1. Node typings follow the Node 24 runtime used
for development. Other development tools use the latest stable releases accepted by pnpm’s
default release-age policy as of this update (Vitest 5.0.3; 5.0.4 is still
filtered). The lockfile records exact resolutions.

## Packages

| Directory       | npm package      | Responsibility                                     |
| --------------- | ---------------- | -------------------------------------------------- |
| `packages/core` | `@chaospay/core` | Provider-independent contracts and delivery engine |
| `apps/cli`      | `chaospay`       | Command-line interface wrapping core               |

The workspace root is private. Packages are ESM-only, build independently to
`dist`, and publish only their build output plus npm's standard metadata files.
Core exposes its public API and generated TypeScript declarations through its
package export. CLI exposes a `chaospay` executable. Internal dependencies use
`workspace:^`, which pnpm replaces with a version range during packing.

Names are provisional until npm availability and ownership of the `@chaospay`
scope are verified. Nothing has been published. A license must be selected
before public release. Versioning and release automation are deferred to a
separate reviewed PR.

Inspect publishable artifacts without publishing:

```sh
pnpm --filter @chaospay/core pack --pack-destination /tmp/chaospay-pack
pnpm --filter chaospay pack --pack-destination /tmp/chaospay-pack
```

## Planned PRs

1. Repository foundation (this PR).
2. Core event, target, delivery result, and scenario contracts.
3. HTTP delivery and behavior tests.
4. CLI `send` command, validation, output, and exit codes.
5. Local webhook example and end-to-end quick-start.

Recorder, replay, provider adapters, and hosted infrastructure follow later.
