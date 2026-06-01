import type { Role } from "./roles";

export interface JwtClaims {
  sub: string; // user id
  email: string;
  role: Role;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
