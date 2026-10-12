# Core contracts

`@chaospay/core` provides provider-independent TypeScript contracts for webhook
fault-injection testing. These are type-only exports. Delivery and scenario
execution are not implemented yet.

```ts
import type {
  ChaosEvent,
  Target,
  DeliveryResult,
  ChaosScenario,
} from '@chaospay/core';
```

## Events and targets

```ts
const event: ChaosEvent = {
  id: 'evt_123',
  type: 'payment.captured',
  payload: { paymentId: 'pay_123', amount: 10000 },
  timestamp: '2026-10-13T00:00:00.000Z',
  headers: { 'Content-Type': 'application/json' },
};

const target: Target = {
  url: 'http://localhost:3000/webhook',
  headers: { 'X-Test-Run': 'local' },
};
```

`payload` is `unknown`: consumers must narrow it before reading provider-specific
fields. This model does not define a wire envelope or JSON serialization format.
Recorded raw request bodies will need a separate contract when recording is
introduced.

`timestamp` represents when the event occurred. It is optional; absence means the
occurrence time is unknown. It must not be replaced with delivery time. Duplicates
preserve the ID, type, payload, and occurrence timestamp of their source event.

Target URLs must be absolute HTTP or HTTPS URLs. Header names are compared
case-insensitively; target headers take precedence over event headers. For example,
target `content-type` overrides event `Content-Type`. Multiple spellings of the
same header within a single header map are invalid input. Header values are
strings; multi-value header handling is outside this initial contract.

The contracts expose readonly properties and collections to discourage mutation.
They do not freeze objects or recursively make the unknown payload immutable.

## Delivery results

A `DeliveryResult` describes one completed HTTP attempt:

| Field         | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `eventId`     | Original event identity, shared by duplicates                                    |
| `deliveryId`  | Identity of a planned delivery, distinct for each duplicate                      |
| `attemptId`   | Unique attempt identity, including across retries                                |
| `attempt`     | One-based attempt number within the delivery                                     |
| `attemptedAt` | ISO 8601 timestamp when the attempt started                                      |
| `latencyMs`   | Non-negative elapsed attempt duration, excluding planned delay and retry backoff |

A retry retains `eventId` and `deliveryId`, receives a new `attemptId`, and
increments `attempt`. This describes the identity model; it does not introduce a
retry policy or executor.

The `outcome` field determines which additional fields are available:

| Outcome         | Fields                 | Meaning                                                 |
| --------------- | ---------------------- | ------------------------------------------------------- |
| `success`       | `status`, `statusText` | HTTP response in the 200–299 range                      |
| `http-error`    | `status`, `statusText` | HTTP response outside the 200–299 range                 |
| `timeout`       | `error`                | Delivery deadline exceeded without a completed response |
| `network-error` | `error`                | Transport failure without a completed response          |

`statusText` may be empty. HTTP failures include their actual response status.
Transport failures carry a descriptive error string and cannot carry an HTTP
status. An endpoint returning HTTP 504 is an `http-error`; a sender's own deadline
expiring is a `timeout`. Error messages are diagnostic text, not stable identifiers.

```ts
function summarize(result: DeliveryResult): string {
  switch (result.outcome) {
    case 'success':
    case 'http-error':
      return `${result.status} in ${result.latencyMs}ms`;
    case 'timeout':
    case 'network-error':
      return result.error;
  }
}
```

Injected actions and target outcomes are separate concepts. A dropped event has
no HTTP attempt and therefore no `DeliveryResult`; a future run report will track
injected drops separately. A successful HTTP response alone does not establish
that the application's business state is correct.

## Scenarios

```ts
const scenario: ChaosScenario = {
  name: 'duplicate-and-reorder',
  seed: 123,
  rules: [
    {
      match: { eventType: 'payment.captured' },
      action: { type: 'duplicate', count: 2 },
    },
    {
      match: { eventType: 'payment.authorized' },
      action: { type: 'delay', milliseconds: 5000 },
    },
    { action: { type: 'reorder' } },
  ],
};
```

`ChaosRule`, `ChaosAction`, and `EventMatch` are also public type exports.
`match.eventType` is an exact, case-sensitive match. Omit `match` to select all
events; strings such as `*` have no special wildcard meaning.

Rules transform a delivery plan sequentially in array order:

- **Duplicate:** `count` is the total number of deliveries per matched entry,
  including the original. It must be an integer of at least one. Copies are
  adjacent and retain any delay already attached to the entry. Two successive
  duplicate rules with count two produce four deliveries per initial entry.
- **Delay:** `milliseconds` adds a finite, non-negative delay to each matched
  entry. Repeated delays accumulate. Scheduling and concurrency policy belong
  to the future executor.
- **Drop:** removes all matched entries from the current plan. Subsequent rules
  cannot restore them.
- **Reorder:** shuffles matched entries among their existing positions; unmatched
  entries keep their positions. Empty and single-entry selections are unchanged.
  A shuffle may produce the original order. Delay metadata travels with an entry.

An empty rules array preserves the input plan. None of these actions modifies
semantic event timestamps or payloads.

When provided, `seed` must be an unsigned 32-bit integer (0 through 4294967295).
The same input event order, ordered rules, and seed must produce the same planned
transformations for the same engine version. Wall-clock times, target responses,
latencies, and generated delivery identifiers are outside that guarantee.
Without a seed, reproducibility is not guaranteed. The PRNG and scheduling
implementation will be introduced with the chaos engine.

## Validation boundary

TypeScript catches missing fields and incompatible union members. These contracts
do not perform runtime validation: numeric ranges, ISO timestamps, URL validity,
and header collisions must be checked by future public entry points. In
particular, `status: number` does not statically enforce the HTTP status ranges
associated with each outcome.

Run `pnpm test` to compile consumer examples against the built package exports.
The contract checks include valid variants and expected compilation failures for
invalid combinations. They do not implement or test HTTP delivery behavior.
