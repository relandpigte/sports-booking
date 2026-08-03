import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { consumeLoginGrant } from "@/lib/account-security";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Credentials-based auth requires JWT sessions (the database session
  // strategy is only used by OAuth/email providers).
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        grant: { label: "Single-use login grant", type: "password" },
      },
      authorize: async (credentials) => {
        const grant =
          typeof credentials.grant === "string" ? credentials.grant : "";
        const authenticatedUser = await consumeLoginGrant(grant);
        if (!authenticatedUser) return null;

        // NOTE: do NOT return `image` here. With JWT sessions, NextAuth maps
        // the user's image into the session cookie (token.picture). Profile
        // pictures are data URLs, which would bloat the cookie and trigger
        // HTTP 431 (Request Header Fields Too Large). Avatars are loaded from
        // the database via the DAL for display instead.
        return {
          id: authenticatedUser.id,
          email: authenticatedUser.email,
          name: authenticatedUser.name,
          role: authenticatedUser.role,
          sessionVersion: authenticatedUser.sessionVersion,
          sessionId: authenticatedUser.sessionId,
          mfaVerified: authenticatedUser.mfaVerified,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
        token.sessionId = user.sessionId;
        token.mfaVerified = user.mfaVerified;
      }
      // Keep the cookie small — never persist an avatar in the JWT.
      if (token.picture) token.picture = undefined;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      if (token.role) session.user.role = token.role as Role;
      // Tokens issued before session versioning was introduced are version 0,
      // matching every existing user until their first password reset.
      session.user.sessionVersion =
        typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
      session.user.sessionId =
        typeof token.sessionId === "string" ? token.sessionId : "";
      session.user.mfaVerified = token.mfaVerified === true;
      return session;
    },
  },
});
