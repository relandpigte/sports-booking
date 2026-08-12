# Booking-scoped Messages

Messages has two room types:

- one `EVENT` discussion shared by the active hub partner and confirmed event
  registrations;
- one reusable `HUB_PLAYER` conversation for each hub/player pair with a
  confirmed court booking.

Access is evaluated against the live booking data on every request. A room is
available until 24 hours after the relevant booking or event ends. Pending
holds, waitlists, cancelled records, inactive partners, admins, and partner
impersonation do not receive participant access. There is no arbitrary member
directory or player-to-player direct messaging.

Conversation summaries batch access, latest-message, read-state, and unread
lookups. Normal reads never update conversation rows; a read performs a
one-time repair only if valid booking data exists without its expected room.
The supporting booking, event, and registration indexes live in the
`202608120002_messages_performance` migration.

Postgres stores the messages. Ably carries only conversation invalidations and
is optional: the UI polls active conversations every 15 seconds and the list
every 60 seconds when `ABLY_API_KEY` is absent or temporarily unavailable.
Browser tokens last ten minutes, allow only `subscribe`, and list only the
conversation channels currently available to that user.

## Development

Apply the schema to a non-production database and regenerate Prisma Client:

```bash
npm run db:push
npm run db:generate
```

Set `ABLY_API_KEY` to exercise realtime behavior. Never expose it through a
`NEXT_PUBLIC_*` variable. Run `npm run check:messages` for the focused data and
authorization checks.

## Production migration

This repository predates committed Prisma migration history. Before deploying
Messages to the populated database:

1. Verify the production schema matches the pre-Messages Prisma schema and
   take a tested backup.
2. Baseline that existing schema as `0_init` and mark it applied with
   `prisma migrate resolve --applied 0_init`.
3. Apply the additive Messages migration with `prisma migrate deploy` before
   deploying application code.

The migration backfills `Booking.confirmedAt`, creates event and hub/player
conversation identities, and does not copy booking membership into chat rows.
