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
npm run db:seed                # creates only the admin (ADMIN_EMAIL / ADMIN_PASSWORD)
npm run db:studio              # Prisma Studio
```

CI (`.github/workflows/ci.yml`) uses Node 22 and npm, and runs
`npm audit --audit-level=high`, `prisma migrate deploy`, lint, build, then
`npm run check`.

**Schema changes need a committed migration.** Production deploys run
`prisma migrate deploy` before the build (`scripts/vercel-build.mjs`, via
`build:vercel`), so a change applied only with `db:push` never reaches
production. Existing migration directories are named `YYYYMMDD` plus a
four-digit sequence (`202609100002_snapshot_transaction_environment`).

### Checks

There is no unit test framework — `checks/*.check.ts` are plain `tsx` scripts
that seed fixtures into a real Postgres database, assert, and clean up.

```bash
npm run check                  # every check, in dependency-safe order
npm run check:money            # fastest way to verify a booking/payment change
npm run check:<name>           # one check while iterating (see package.json)
```

- **Database guard.** `assertNotProduction()` in `checks/harness.ts` refuses
  to run unless `CHECK_DATABASE_URL` is set and exactly equals `DATABASE_URL`,
  and refuses `NODE_ENV=production`. Point both at a disposable database.
- **Baseline fixtures.** Several checks look up an existing admin, player, and
  hub with a court and throw "Seed … first" without them. CI creates these
  with `checks/prepare-ci-database.mjs`, which only runs when `CI=true`
  against a local `bunal_check` database; `db:seed` alone is not enough.
- **Request context.** `stubRequestContext()` swaps `next/navigation`,
  `next/cache`, `src/lib/dal.ts`, `src/lib/admin.ts`, and
  `src/lib/impersonation.ts` in the Node require cache so a script can call
  Server Actions. A check must therefore `await import()` the module under
  test *after* stubbing, never import it at the top of the file.
- **PayMongo.** `checks/paymongo-mock.ts` replaces `globalThis.fetch`;
  everything above the wire is production code. Install it before importing
  payment modules.
- **Adding a check.** Name it `feature.check.ts`, add a `check:<name>` script,
  and append it to the `check` chain. Scripts that import `server-only`
  modules need `--conditions=react-server`. Seed fixtures on a far-future date
  (most existing checks use 2099) and restore row counts even on failure.

## Architecture

**Vocabulary.** A *hub* is a venue; a *partner* is the account that owns hubs.
*BunalQ* is the product name for the open-play queue — models are
`OpenPlay*`, routes are `/bunalq`, `/q/[publicId]`, and `/dashboard/bunalq`.
The package is still named `pikoleros.dev`.

**Two-tier auth check.** `src/proxy.ts` (Next.js 16's renamed Middleware) does
an optimistic cookie-presence check to redirect signed-out requests away from
`/dashboard` and `/users`. It is not authoritative. The real check lives in
`src/lib/dal.ts`, which every protected page and Server Action must call
directly: it validates the JWT's `sessionVersion`, the revocable `AuthSession`
row, MFA for roles that require it, and whether a first-time Google sign-in
has finished choosing an account type. Public pages that only render
differently when signed in use `getViewer()`, which returns `null` instead of
redirecting. `requireRecentMfa()` gates sensitive financial controls.

**Roles are coarse; capability comes from status and membership.**
`User.role` is `ADMIN | PLAYER | PARTNER`, but:

- A partner's `partnerStatus` is `DRAFT | PENDING | ACTIVE | DEACTIVATED`.
  `requirePartner()` is only for onboarding pages a draft or pending partner
  should reach; `requireActivePartner()` gates everything else.
- A *trainer* is not a role. It is a `TrainerProfile` with its own
  `TrainerStatus` attached to a `PLAYER` account.
- *Staff* are `PLAYER` accounts with a `PartnerStaffMembership` carrying a
  `NONE | VIEW | MANAGE` level for each of seven modules, active only while
  the staff-workspace cookie is selected.

**Partner-dashboard code authorizes through the workspace, not the role.**
`requirePartnerWorkspace(module, "VIEW" | "MANAGE")` in `src/lib/staffing.ts`
resolves to an `OWNER`, `STAFF`, or `ADMIN_ASSIST` workspace. Scope queries by
`workspace.partnerId`, never the actor's own id — for staff and assisting
admins they differ. `requireActivePartner()` admits only the owner or an
assisting admin, so use it for owner-only operations. Mutations call
`recordPartnerActivity()` (audits staff) and `recordImpersonatedAction()`
(audits admins); each is a no-op for the other kind of actor.

**Admin partner impersonation is a real, audited session, not a role
override.** `src/lib/impersonation.ts` matches a cookie token against a hashed
`PartnerImpersonationSession` row. `getCurrentUser()` returns the impersonated
partner so pages render normally, while `getAuthenticatedUser()` always
returns the real admin. Anything security-sensitive (`requireAdmin()`, role
changes, ending impersonation) must use `getAuthenticatedUser()`. Actions that
change account-level data take their target from
`getWorkspaceMutationTarget()`, never from a client-supplied id.

**Court inventory is one table with one unique index.**
`BookingSlot @@unique([courtId, date, hour])` is the only thing preventing a
double-booking; bookings, events, and court blocks all occupy rows in it.
Rows are *deleted* on cancellation (the parent `Booking` survives as
`CANCELLED`) because Prisma cannot express a partial unique index — never
soft-delete them. `BookingSlot.holdExpiresAt` mirrors `Booking.holdExpiresAt`
so availability reads never join; a `PENDING` booking is a 15-minute hold that
stops blocking the moment it lapses, with or without the sweep.
`src/lib/booking-locks.ts` adds a transaction-scoped advisory lock so one
player cannot claim two courts for the same hour.

**Dates are Manila civil dates, not instants.** A booking's identity is a
`"YYYY-MM-DD"` string plus integer hours (`endHour` may be 24).
`startsAt`/`endsAt` exist only for ordering. `src/lib/time.ts` is the only
module that converts between the two — never parse a bare date string or call
`getHours()`/`toLocaleDateString()` without a time zone elsewhere.

**Bunal.club collects automatic payments and pays venues out.** Every
automatic (QR Ph) court, event, and trainer payment is charged through
Bunal.club's own PayMongo account (`PlatformGateway`). The venue's or
trainer's share is recorded in `PayoutEntry` and sent by manual transfer in a
`Payout` every Monday and Thursday; an admin marks each one paid with a
reference. Manual mode is the opposite direction: the player pays the venue
directly and nothing enters the payout ledger.

| `collectedBy` | Who holds the money | Ledger written on settle |
| --- | --- | --- |
| `PLATFORM` | Bunal.club — owed to the venue or trainer | `PayoutEntry` `EARNING` |
| `DIRECT` | the venue or trainer (manual, or their own keys before the cutover) | `ServiceFeeEntry`, only if a fee was charged |

- **Resolve the PayMongo account through `src/lib/payment-rails.ts`,** never
  by loading credentials yourself. `PLATFORM` rows have `gatewayId: null`;
  `DIRECT` rows with a `gatewayId` are pre-cutover payments that stay on the
  venue's or trainer's stored keys for poll, cancel, refund, and webhook.
- **Write ledgers through `src/lib/payment-ledger.ts`** (venue) or the
  helpers in `trainer-payment-settlement.ts`. The two rails owe money in
  opposite directions; calling the wrong writer charges a fee that was never
  owed or skips a payout that was.
- **Readiness is `src/lib/payment-readiness.ts`.** *Setup ready* (a payout
  account, or a manual method) is what "Verified" means. *Checkout ready* also
  needs the platform account connected. Don't re-derive either inline.
- **One webhook, two kinds of money.** `/api/billing/webhook/paymongo` routes
  payment-intent events to `platform-webhook.ts` (player payments) and
  checkout-session events to `handleServiceFeeProviderEvent` (legacy
  service-fee settlements). The signature is the authorization, verified
  against the raw body; `ProviderEvent` deduplicates deliveries.

The fee is flat and player-paid: ₱25 per court checkout or trainer session,
₱5 per paid event spot, nothing on manual. Bunal.club absorbs PayMongo's
processing cost. Every payment row snapshots `venueAmount`, `platformFee`,
`amount`, and `processingFee`, so history never shifts when rates change. Fee
arithmetic lives in `src/lib/constants.ts` — reuse it rather than recomputing.

`trainer-payment-actions.ts` is a `"use server"` module, so everything it
exports is callable from a browser. Anything that settles a payment from a
provider event belongs in `trainer-payment-settlement.ts` instead.

**Server Actions live in `src/lib/*-actions.ts`,** not beside the routes. They
take an unused `_prev` first argument for `useActionState` and return a state
object of `errors` and `message`. React 19 resets a form after its action, so
forms with free-text fields also echo the submitted `values` back. Many
`src/lib` modules import `server-only`; pieces a client component needs are
split into `*-shared.ts` siblings.

**Route groups.** `src/app/(app)` holds the authenticated dashboard behind one
`layout.tsx`. Everything else under `src/app` is public, including flows that
work without an account — guest court checkout and guest event registration
(authorized by a cookie or a hashed access-token link), guest-run BunalQ
queues, and staff invitations.

**Live updates poll Postgres.** The availability, open-play, and BunalQ
`stream` routes are rate-limited Server-Sent Events endpoints that poll the
database and push on change. Messages are stored in Postgres; Ably carries
only invalidations and is optional, with client polling as the fallback.

**The hourly sweep is the only scheduler.** `/api/bookings/sweep` (Vercel
cron in `vercel.json`, authorized by `CRON_SECRET` or `BOOKING_SWEEP_SECRET`)
reaps expired holds, reconciles in-flight payments and settlement checkouts
against PayMongo, creates the Monday and Thursday payouts, sends reminders,
cleans up security rows, and closes stale BunalQ runs. Availability never
depends on it; payouts and lost-webhook recovery do. Put new periodic work
there.

**Docs worth reading before touching these areas:**
`docs/auth-and-database.md` (roles, sessions, MFA, password reset),
`docs/payments.md` (fees, platform collection, payouts, pre-cutover payments),
`docs/security-operations.md` (deployment secrets, CSP rollout),
`docs/messages.md`, `docs/email-templates.md`, `docs/facebook-messenger.md`,
`docs/seo.md`, `docs/dupr-leaderboard.md`.
