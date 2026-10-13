/** Metadata for one HTTP attempt. A retry produces a separate result. */
interface DeliveryAttempt {
  readonly eventId: string;
  /** Unique per planned delivery; duplicates have distinct delivery IDs. */
  readonly deliveryId: string;
  /** Unique per attempt, including retries of the same delivery. */
  readonly attemptId: string;
  /** One-based attempt number within this delivery. */
  readonly attempt: number;
  /** ISO 8601 time at which this attempt started. */
  readonly attemptedAt: string;
  /** Non-negative elapsed time for this attempt, in milliseconds. */
  readonly latencyMs: number;
}

/** One completed attempt, classified independently of injected chaos. */
export type DeliveryResult = DeliveryAttempt &
  (
    | {
        readonly outcome: 'success';
        /** A 2xx HTTP response. */
        readonly status: number;
        readonly statusText: string;
        readonly error?: never;
      }
    | {
        readonly outcome: 'http-error';
        /** An HTTP response outside the 2xx range. */
        readonly status: number;
        readonly statusText: string;
        readonly error?: never;
      }
    | {
        readonly outcome: 'timeout';
        /** Description of the exceeded delivery deadline. */
        readonly error: string;
        readonly status?: never;
        readonly statusText?: never;
      }
    | {
        readonly outcome: 'network-error';
        /** Transport failure description; no completed HTTP response exists. */
        readonly error: string;
        readonly status?: never;
        readonly statusText?: never;
      }
  );
