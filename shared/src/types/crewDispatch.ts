export const JobStatus = {
  ASSIGNED: "assigned",
  EN_ROUTE: "en_route",
  ON_SITE: "on_site",
  RESOLVED: "resolved"
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export type CrewMember = {
  id: string;
  /** The backing app_users.id for this crew member (role='crew'). */
  userId: string;
  displayName: string;
};

export type JobCard = {
  id: string;
  outageId: string;
  crewUserId: string;
  status: JobStatus;
  safetyNotes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type JobCardWithOutage = JobCard & {
  outage: {
    id: string;
    location: string;
    faultType: string;
    severity: string;
    affectedCustomers: number;
    status: string;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
  };
};

export type ListAvailableCrewResponse = {
  crew: CrewMember[];
};

export type AssignCrewRequest = {
  crewUserId: string;
  safetyNotes?: string;
};

export type AssignCrewResponse = {
  job: JobCard;
};

export type ListMyJobsResponse = {
  jobs: JobCardWithOutage[];
};

export type UpdateJobStatusRequest = {
  status: JobStatus;
};

export type UpdateJobStatusResponse = {
  job: JobCard;
};

export type CrewDispatchEvent =
  | { type: "job_assigned"; job: JobCard }
  | { type: "job_status_updated"; job: JobCard };
