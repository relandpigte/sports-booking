import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

// Expose the user id and role on the session, user, and JWT.
declare module "next-auth" {
  interface User {
    role?: Role;
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    sessionVersion?: number;
  }
}
