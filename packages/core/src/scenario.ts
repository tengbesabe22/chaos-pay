/** Exact event-type matching; omit the rule's match field to select all events. */
export interface EventMatch {
  readonly eventType: string;
}

/** Declarative delivery transformations; these do not modify event payloads. */
export type ChaosAction =
  | {
      readonly type: 'duplicate';
      /** Total deliveries per matched entry, including the original; integer >= 1. */
      readonly count: number;
    }
  | {
      readonly type: 'delay';
      /** Additional non-negative delay in milliseconds. */
      readonly milliseconds: number;
    }
  | { readonly type: 'drop' }
  | {
      /** Shuffle matched entries among their existing positions. */
      readonly type: 'reorder';
    };

export interface ChaosRule {
  readonly match?: EventMatch;
  readonly action: ChaosAction;
}

export interface ChaosScenario {
  readonly name: string;
  /** An unsigned 32-bit integer used for reproducible random choices. */
  readonly seed?: number;
  /** Applied sequentially to the current delivery plan in array order. */
  readonly rules: readonly ChaosRule[];
}
