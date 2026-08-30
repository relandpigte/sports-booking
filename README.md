# Bunal.club

Bunal.club is a Next.js 16 application for discovering sports venues, booking
courts, joining events, hiring trainers, and running live open-play queues in
the Philippines. Venue and trainer payments go directly to each provider
through PayMongo or a reviewed manual-transfer flow; Bunal.club records its
service fees in a separate settlement ledger.

## Main capabilities

- Public venue directory with live court availability and multi-court booking
- Guest and registered-player court checkout
- Paid events, named guests, recurring events, and organizer-managed guests
- Trainer profiles, availability, session requests, and payment collection
- BunalQ open-play queues, court staging, and live public boards
- Booking-scoped messaging with moderation and optional Ably notifications
- Partner teams with granular hub, booking, event, report, and payment access
- Admin approval, MFA, session management, audit events, and assisted setup
- Business analytics, utilization reports, QR sharing, and CSV exports

## Architecture

The application uses the Next.js App Router and favors Server Components.
Routes live in `src/app`, reusable UI in `src/components`, and domain logic,
Server Actions, validation, and payment adapters in `src/lib`. Prisma models
and migrations live in `prisma`; executable integration checks live in
`checks`.

Critical writes are enforced in PostgreSQL transactions. Booking inventory
uses unique slot rows, advisory locks, and row locks to prevent concurrent
double-booking. Payment ledgers snapshot venue amounts, service fees, and
processing fees so historical values do not change with pricing rules.

Authentication uses Auth.js with credentials and Google sign-in. JWTs are
paired with a revocable database session registry, session-version checks,
login throttling, and authenticator MFA.

## Requirements

- Node.js 22
- PostgreSQL 16 or a compatible hosted PostgreSQL service
- PayMongo accounts for automatic payments
- Resend for transactional email
- A Vercel project for the production deployment

Google OAuth, Google Maps, DUPR, Ably, and Facebook Messenger are optional.

## Local setup

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Review `.env.example` before starting. At minimum, local authenticated flows
need `DATABASE_URL` and `AUTH_SECRET`. Payment gateway connection and MFA setup
also require `ENCRYPTION_KEY`.

Use `npm run db:migrate` instead of `db:push` when creating a migration that
will be deployed. Never edit generated Prisma Client files or `.next` output.

## Verification

```bash
npm run lint
npm run build
npm run check
```

The check suite uses real PostgreSQL semantics and creates temporary fixtures.
It must never target production. Before running a database-backed check, set
both variables to the exact same disposable development or test database:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/bunal_check?schema=public"
CHECK_DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/bunal_check?schema=public"
```

Checks refuse to run when `CHECK_DATABASE_URL` is missing or differs from
`DATABASE_URL`. They also refuse when `NODE_ENV=production`.

Focused checks are available while iterating, for example:

```bash
npm run check:money
npm run check:events
npm run check:security
```

## Vercel deployment

Production runs in Vercel's Singapore region. The hourly
`/api/bookings/sweep` cron expires stale records, reconciles settlement
checkouts, sends reminders, and performs security and open-play maintenance.

Configure all production secrets in Vercel and redeploy after changing them.
Important deployment values include:

- `APP_URL` — canonical HTTPS production origin
- `AUTH_SECRET` — Auth.js signing secret
- `ENCRYPTION_KEY` — encryption key for gateway and MFA secrets
- `BOOKING_SWEEP_SECRET` — separate operator token for manual sweeps
- `CRON_SECRET` — token Vercel sends to the scheduled sweep
- `DATABASE_URL` — production PostgreSQL connection string

Do not set `CHECK_DATABASE_URL` in production. Confirm PayMongo webhooks use
the canonical production domain after changing domains or gateway accounts.
The readiness endpoint at `/api/health/security` returns HTTP 503 when an
essential security or cron value is missing.

## Documentation

- [Authentication and database setup](docs/auth-and-database.md)
- [Payments and settlement flows](docs/payments.md)
- [Security operations](docs/security-operations.md)
- [Messages](docs/messages.md)
- [Email templates](docs/email-templates.md)
- [Facebook Messenger](docs/facebook-messenger.md)
- [SEO](docs/seo.md)
- [DUPR leaderboard](docs/dupr-leaderboard.md)

## Repository rules

This project targets the installed Next.js 16 release. Before changing routing,
caching, request APIs, Proxy behavior, or framework configuration, read the
relevant guide under `node_modules/next/dist/docs`. Validate untrusted input
with Zod and enforce authorization inside every Server Action and route
handler.
