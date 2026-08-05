# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev                    # Turbopack dev server
npm run lint                   # Next.js Core Web Vitals + TypeScript ESLint
npm run build                  # production build (also type-checks)
npm run db:push                # sync prisma/schema.prisma to DATABASE_URL, no migration history
npm run db:migrate             # same, but records a migration under prisma/migrations
npm run db:seed                # seed dev data (prisma/seed.mjs)
npm run db:studio              # Prisma Studio
```

There is no unit test framework — `checks/*.check.ts` are plain scripts that
seed fixtures into the real (non-production) database, assert, and clean up
after themselves. `checks/harness.ts` provides `ok()`/`run()`/`report()` and
`stubRequestContext()`, which swaps `next/navigation`, `src/lib/dal.ts`, and
`src/lib/admin.ts` in the Node require cache so a script can exercise Server
Actions without a request context.

```bash
npm run check                  # every check, in dependency-safe order
npm run check:money            # fastest way to verify a single booking/payment change
npm run check:<name>           # run one check while iterating (see package.json for the full list)
```

Checks read `DATABASE_URL` from `.env` and refuse to run when
`NODE_ENV=production` (enforced by `assertNotProduction()` in the harness).
When adding a check, follow the existing naming (`feature.check.ts`), seed
fixtures on a far-future date so they can't collide with real data, and
restore row counts to their starting point even on failure.

## Architecture

**Two-tier auth check.** `src/proxy.ts` (Next.js 16's renamed Middleware) does
a cheap, optimistic cookie-presence check at the edge to redirect signed-out
requests away from `/dashboard` and `/users`. It is not authoritative. The
real check is `verifySession()` / `requireRole()` / `requirePartner()` /
`requireActivePartner()` in `src/lib/dal.ts`, which every protected page and
Server Action must call directly — session version, MFA status for admins,
and the managed-session table are all validated there, not in the proxy.

**Roles gate capability, `partnerStatus` gates payments.** `User.role` is
`ADMIN | PLAYER | PARTNER`. A partner's `partnerStatus` (`PENDING | ACTIVE`)
is separate: pending partners can sign in and see their dashboard, but
`requireActivePartner()` is the gate for anything that publishes a hub,
manages courts/bookings, or touches money. `requirePartner()` alone is only
for pages a pending partner should still reach.

**Admin partner impersonation is a real, audited session, not a role
override.** `src/lib/impersonation.ts` reads a signed cookie
(`PARTNER_IMPERSONATION_COOKIE`) to let an admin act as a partner during
onboarding. `getCurrentUser()` in the DAL returns the impersonated partner so
pages render normally, while `getAuthenticatedUser()` always returns the real
admin — anything security-sensitive (role changes, admin-only actions, ending
impersonation) must use `getAuthenticatedUser()`, never `getCurrentUser()`.

**Two independent payment rails, both PayMongo, deliberately not shared
code.** `src/lib/payments/venue.ts` (+ `paymongo-venue.ts`) charges the
*player*, through the *partner's own* connected PayMongo account, for a court
booking — the money never touches the platform. `src/lib/payments/venue.ts`'s
platform counterpart, `platform-gateway.ts` / `paymongo-platform.ts`, charges
the *partner* through Bunal.club's own PayMongo account to collect the weekly
3% service-fee settlement. Each `BookingPayment` snapshots `venueAmount`,
`platformFee`, and `amount` at charge time so historical reports don't shift
when the fee schedule later changes. `ProviderEvent` deduplicates webhook
deliveries for both rails.

**Route groups.** `src/app/(app)` holds every authenticated
dashboard/admin/partner page behind one `layout.tsx`; everything else under
`src/app` (`/`, `/hubs`, `/events`, `/login`, `/register`, `/leaderboard`,
legal pages) is public. `src/app/api` holds Auth.js handlers, PayMongo/DUPR
webhooks, and the booking-hold sweep (`/api/bookings/sweep`, cron-driven —
see `docs/payments.md`). Availability does not depend on the sweep running;
expired holds already stop blocking slots based on current time, the sweep
just reaps the stale rows.

**Docs worth reading before touching these areas:** `docs/auth-and-database.md`
(roles, sessions, MFA, password reset), `docs/payments.md` (both payment
rails, partner onboarding, settlement), `docs/seo.md`, `docs/dupr-leaderboard.md`.
