export const CustomerOutageStatus = {
  OUTAGE: "outage",
  NO_OUTAGE: "no_outage"
} as const;

export type CustomerOutageStatus = (typeof CustomerOutageStatus)[keyof typeof CustomerOutageStatus];

export type CustomerStatusLookupResponse = {
  /**
   * Whether the queried postcode is currently affected by an outage.
   */
  status: CustomerOutageStatus;
  /**
   * Severity of the outage if status === "outage".
   */
  severity: "low" | "medium" | "high" | "critical" | null;
  /**
   * Human-friendly estimated restoration time, or null if unknown / not applicable.
   * Example: "2026-05-28T08:30:00.000Z"
   */
  eta: string | null;
  /**
   * ISO timestamp indicating when this status was last updated.
   * For outage: uses the outage updatedAt timestamp.
   * For no_outage: uses server "now".
   */
  lastUpdated: string;
};
