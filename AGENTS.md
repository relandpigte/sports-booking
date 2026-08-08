# Repository Guidelines

## Project Structure & Architecture

Bunal.ph is a Next.js 16 App Router application for court booking and PayMongo payments. Routes live in `src/app`; `(app)` contains authenticated dashboards, while `api` contains Auth.js, webhook, and sweep handlers. Reusable UI belongs in `src/components`, hooks in `src/hooks`, and domain logic, DAL functions, Server Actions, validation, and payment adapters in `src/lib`. Database models are in `prisma/schema.prisma`. Keep integration checks in `checks/*.check.ts`, operational scripts in `scripts`, assets in `public`, and setup notes in `docs`.

## Build, Test & Development Commands

- `npm install` — install dependencies and generate Prisma Client.
- `npm run db:push && npm run db:seed` — prepare a development Postgres database.
- `npm run dev` — start the local Turbopack server.
- `npm run lint` — run Next.js Core Web Vitals and TypeScript ESLint rules.
- `npm run build` — perform the production build.
- `npm run check` — run all booking, billing, PayMongo, analytics, QR, and social checks.
- `npm run check:money` — run one focused check while iterating.

Checks use `DATABASE_URL` and write temporary fixtures to the real database. Never use production credentials; the harness rejects `NODE_ENV=production`, and every check must clean up.

## Coding Style & Naming

Use strict TypeScript, two-space indentation, semicolons, double quotes, and the `@/` import alias. Name React components and files in `PascalCase`, functions and variables in `camelCase`, and checks `feature.check.ts`. Prefer Server Components; add `"use client"` only for browser state or effects and `"use server"` for action modules. Validate untrusted input with Zod and enforce authorization inside every Server Action or route handler.

This is Next.js 16, not legacy Next.js. Before changing framework APIs, routing, caching, request data, or proxy behavior, read the relevant guide under `node_modules/next/dist/docs/` and follow deprecation notices. Do not edit `.next` or generated Prisma Client files.

## Payment, Security & Testing

Copy `.env.example` to `.env`; never commit credentials. Preserve money as explicit ledger values and route PayMongo calls through `src/lib/payments`. Mock PayMongo at the network boundary, not with production fake gateways. Tests should cover idempotency, authorization, cleanup, and peso/centavo rounding.

## Commits & Pull Requests

Recent commits use sentence-case, outcome-focused subjects and detailed bodies explaining why, invariants, migrations, and verification. Keep commits focused. Pull requests should summarize behavior, list commands run, call out schema or environment changes, link issues, and include screenshots for visible UI changes. Highlight payment-flow or data-migration risk explicitly.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
