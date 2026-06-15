import type { Role } from '@idp/shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
        teamId: string | null;
      };
      /** Raw request body, captured for webhook HMAC verification. */
      rawBody?: Buffer;
    }
  }
}

export {};
