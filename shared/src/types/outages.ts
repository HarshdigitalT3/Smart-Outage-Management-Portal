export const OutageSeverity = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical"
} as const;

export type OutageSeverity = (typeof OutageSeverity)[keyof typeof OutageSeverity];

export const OutageStatus = {
  NEW: "new",
  INVESTIGATING: "investigating",
  IDENTIFIED: "identified",
  MONITORING: "monitoring",
  RESOLVED: "resolved"
} as const;

export type OutageStatus = (typeof OutageStatus)[keyof typeof OutageStatus];

export type Outage = {
  id: string;
  location: string;
  faultType: string;
  severity: OutageSeverity;
  affectedCustomers: number;
  status: OutageStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type OutageAudit = {
  id: string;
  outageId: string;
  action: "created" | "status_updated" | "resolved";
  actorUserId: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type CreateOutageRequest = {
  location: string;
  faultType: string;
  severity: OutageSeverity;
  affectedCustomers: number;
};

export type CreateOutageResponse = {
  outage: Outage;
};

export type ListActiveOutagesResponse = {
  outages: Outage[];
};

export type GetOutageDetailResponse = {
  outage: Outage;
  audits: OutageAudit[];
};

export type UpdateOutageStatusRequest = {
  status: OutageStatus;
};

export type UpdateOutageStatusResponse = {
  outage: Outage;
};

export type ResolveOutageResponse = {
  outage: Outage;
  audit: OutageAudit;
};

export type OutageEvent =
  | { type: "outage_created"; outage: Outage }
  | { type: "outage_status_updated"; outage: Outage }
  | { type: "outage_resolved"; outage: Outage };
