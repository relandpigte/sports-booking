# Auth & Database Setup

This app uses **Auth.js (NextAuth v5)** with **Credentials** and **Google**
providers, and **Prisma** against **Postgres** for storage.

## 1. Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable         | What it is                                                            |
| ---------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`   | Postgres connection string (Neon, Supabase, RDS, or local Postgres).  |
| `AUTH_SECRET`    | Secret used to sign session JWTs. Generate with the command below.   |
| `AUTH_GOOGLE_ID` | Google OAuth Web application client ID.                              |
| `AUTH_GOOGLE_SECRET` | Google OAuth Web application client secret.                      |
| `RESEND_API_KEY` | Resend API key used by the server for transactional account email.    |
| `EMAIL_FROM`     | Sender on the exact verified Resend domain, with an optional name.    |
| `ENCRYPTION_KEY` | AES key for authenticator MFA secrets and payment credentials.        |

```bash
openssl rand -base64 32   # value for AUTH_SECRET
node -e "console.log('k1:'+require('crypto').randomBytes(32).toString('base64'))" # ENCRYPTION_KEY
```

For Resend, install the DNS records shown for your domain and wait until its
status is `Verified`. Use the raw API key as the environment-variable value—do
not include `Bearer`, the variable name, or quotes entered as literal text.
Production environment changes require a new deployment before they take
effect.

In Google Cloud, add the following authorized redirect URIs to the OAuth Web
application (using the actual production origin):

```text
http://localhost:3000/api/auth/callback/google
https://www.bunal.club/api/auth/callback/google
```

> A development `AUTH_SECRET` is already present in `.env`. **Generate a fresh
> one for production.** `.env` is gitignored (`.env*`), so it is never committed.

## 2. Create the database schema

With `DATABASE_URL` pointing at a real Postgres database, push the Prisma schema:

```bash
npm run db:push        # fast, no migration history — good for dev
# or, to track migrations:
npm run db:migrate     # creates a migration under prisma/migrations
```

The Prisma client is generated automatically on `npm install` (via the
`postinstall` script) and after schema changes (`npm run db:generate`).

## 3. Run

```bash
npm run dev
```

- `/register` — create a player account (password is hashed with bcrypt).
- `/register/partner` — apply for a partner account; an admin must activate it.
- `/login` — sign in with email/password or Google.
- `/login/mfa` — complete authenticator or recovery-code verification.
- `/forgot-password` — request an expiring password-reset link.
- `/reset-password?token=…` — choose a new password with a single-use token.
- `/dashboard` — protected; redirects to `/login` when signed out.
- `/dashboard/account?tab=security` — MFA, active sessions, and audit history.

## How it fits together

| File                                   | Role                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| `prisma/schema.prisma`                 | `User` + Auth.js adapter models (`Account`, `Session`, …).       |
| `src/lib/db.ts`                        | Singleton `PrismaClient`.                                        |
| `src/lib/auth.ts`                      | NextAuth config: Credentials/Google providers and JWT callbacks. |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth request handlers (`GET`/`POST`).                      |
| `src/lib/actions.ts`                   | Registration, password login, Google login, and logout actions.  |
| `src/app/api/auth/google/complete/route.ts` | Google redirect and MFA handoff.                         |
| `src/lib/password-reset.ts`            | Hashed reset tokens, throttling, expiry, and password update.     |
| `src/lib/password-reset-actions.ts`    | Server Actions for requesting and completing a reset.             |
| `src/lib/email.ts`                     | Resend adapter for password-reset and welcome email delivery.       |
| `src/lib/welcome-email.ts`             | Role-specific player and partner welcome email content.             |
| `src/lib/validation.ts`                | Zod schemas for login/registration.                              |
| `src/lib/dal.ts`                       | Data Access Layer: `verifySession`, `getCurrentUser`.            |
| `src/proxy.ts`                         | Next.js 16 "Proxy" (formerly Middleware): optimistic route guard. |

### User roles

`User.role` is an enum with three values: **`ADMIN`**, **`PLAYER`**, **`PARTNER`**
(defined in `prisma/schema.prisma`). New registrations default to `PLAYER`.

Partner registrations also carry `User.partnerStatus`. Public signups start as
`PENDING`; admins activate legitimate venues from `/users`. Use
`requireActivePartner()` for every hub, gateway, booking-management, or report
operation. `requirePartner()` is reserved for pages a pending partner may see.

- The role is carried in the session JWT (`session.user.role`) via the callbacks
  in `src/lib/auth.ts`.
- Resetting a password increments `User.sessionVersion`; the DAL compares that
  value with the JWT and rejects sessions issued before the reset.
- Gate a page or server action with `requireRole()` from `src/lib/dal.ts`:

  ```ts
  import { requireRole } from "@/lib/dal";
  // redirects to /login unless the user is an admin or partner
  const user = await requireRole("ADMIN", "PARTNER");
  ```

- Admins can manage roles and partner activation from `/users`.

> **Schema changed?** After editing `prisma/schema.prisma`, re-run
> `npm run db:push` (and `npm run db:generate` is handled for you on install).

### Notes & next steps

- **Sessions are JWT**, which the Credentials provider requires. The Prisma
  adapter persists Google account links, while `AuthSession` keeps both login
  methods revocable from the account security page.
- Google identities are linked to an existing account only after Google reports
  a verified email. First-time Google users are created as players. Google
  sign-ins use the same revocable managed-session registry as password sign-ins;
  admins and users with MFA enabled still complete authenticator verification.
- `src/proxy.ts` does an **optimistic** cookie check only. The authoritative
  check is `verifySession()` in the DAL, which every protected page/server
  action should call.
- Reset tokens expire after 30 minutes, are single-use, and are stored only as
  SHA-256 hashes. Requests return the same account-neutral response and are
  throttled to one email per normalized address per minute.
