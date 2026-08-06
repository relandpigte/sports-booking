import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  consumeLoginGrant,
  createGoogleLoginSession,
} from "@/lib/account-security";
import { getSecurityRequestContext } from "@/lib/security-context";

const prismaAdapter = PrismaAdapter(prisma);
const createAdapterUser = prismaAdapter.createUser;

if (!createAdapterUser) {
  throw new Error("The Prisma Auth.js adapter must support user creation");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: {
    ...prismaAdapter,
    async createUser(user) {
      const created = await createAdapterUser(user);
      await prisma.user.update({
        where: { id: created.id },
        data: { registrationCompletedAt: null },
      });
      return created;
    },
  },
  // Credentials auth requires JWT sessions. Google shares that strategy so
  // both providers can use the app's managed, revocable session registry.
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      // Google only returns verified email identities to the callback below,
      // so matching an existing password account by email is safe here.
      allowDangerousEmailAccountLinking: true,
    }),
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
    signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      return profile?.email_verified === true && Boolean(profile.email);
    },
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          const userId = user.id ?? token.sub;
          if (!userId) return null;
          const googleLogin = await createGoogleLoginSession({
            userId,
            context: await getSecurityRequestContext(),
          });
          if (!googleLogin) return null;
          token.id = googleLogin.id;
          token.role = googleLogin.role;
          token.sessionVersion = googleLogin.sessionVersion;
          token.sessionId = googleLogin.sessionId;
          token.mfaVerified = googleLogin.mfaVerified;
        } else {
          token.id = user.id;
          token.role = user.role;
          token.sessionVersion = user.sessionVersion;
          token.sessionId = user.sessionId;
          token.mfaVerified = user.mfaVerified;
        }
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
