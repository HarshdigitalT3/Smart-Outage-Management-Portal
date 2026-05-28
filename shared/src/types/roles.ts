export const Roles = {
  OPERATOR: "operator",
  CREW: "crew",
  CUSTOMER: "customer"
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];
