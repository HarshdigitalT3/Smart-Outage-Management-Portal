import type { AuthUser } from "@smartoutage/shared";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
