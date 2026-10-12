/** A provider-independent event. Delivery mutations preserve its identity. */
export interface ChaosEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** Event occurrence time as an ISO 8601 string, not its delivery time. */
  readonly timestamp?: string;
}

/** A webhook destination. Header names are compared case-insensitively. */
export interface Target {
  /** An absolute HTTP or HTTPS URL. */
  readonly url: string;
  /** These override matching event headers, regardless of casing. */
  readonly headers?: Readonly<Record<string, string>>;
}
