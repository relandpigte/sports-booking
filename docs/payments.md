# Payments

Bunal.club has no partner plans, subscriptions, or monthly charges. Each
partner and trainer selects one collection mode for everything they sell:
automatic PayMongo QR Ph, or a manual transfer they review themselves.

Automatic payments are collected by **Bunal.club's own PayMongo account** and
paid out to the venue or trainer by manual transfer every Monday and Thursday.
A venue never creates a PayMongo account or handles API keys; its only setup
step is saying where its payouts should go.

## Partner activation

Public partner registrations start in `DRAFT`. The partner submits owner and
first-hub details to move into `PENDING`. An admin reviews the application in
`/users`, then activates the partner. After an `ACTIVE` partner's hub has at
least one court it appears in the public directory as Coming soon. Completing
the setup for the selected mode verifies the hub and opens online bookings:

- **Automatic:** a payout account is on file.
- **Manual:** at least one active manual payment destination exists.

`src/lib/payment-readiness.ts` is the single definition of both. It keeps two
questions apart:

- *Setup ready* — the venue or trainer has finished their side. This is what
  **Verified** means.
- *Checkout ready* — a new payment can be taken right now. For automatic mode
  that additionally requires Bunal.club's PayMongo account to be connected.

A verified venue stays listed while the platform account is disconnected; only
booking pauses, and the owner is told it is not something they need to fix.

## Pricing

The fee is always paid by the player, on top of the advertised price.

| Checkout | Automatic QR Ph | Manual |
| --- | --- | --- |
| Court booking | ₱25 per checkout | No fee |
| Trainer session | ₱25 per session | No fee |
| Paid event | ₱5 per paid spot | No fee |

The court fee is charged **once per checkout**, however many courts or hours
the player selected, including selections with gaps that create separate
booking sessions. Fee arithmetic lives in `src/lib/constants.ts`
(`BOOKING_SERVICE_FEE`, `TRAINER_SERVICE_FEE`, `EVENT_PAYMENT_FEE_PER_PLAYER`
and their helpers); reuse it rather than recomputing.

Each `BookingPayment` snapshots:

- `venueAmount` — the advertised court or registration total. This is what the
  venue is paid out.
- `platformFee` — the service fee quoted for this checkout.
- `amount` — what the player pays: `venueAmount + platformFee`.
- `processingFee` — PayMongo's QR Ph fee. Bunal.club absorbs it out of its
  service fee, so it is recorded but never added to the charge.
- `collectedBy` — `PLATFORM` when Bunal.club's account took the money,
  `DIRECT` when the venue received it (a manual transfer, or a payment taken
  through the venue's own PayMongo keys before platform collection).

`TrainerPayment` snapshots the same fields with `trainerAmount`. A trainer's
fee is quoted when the player requests a session and re-snapshotted when the
trainer accepts, because that is when the trainer's collection mode is read.

Because Bunal.club absorbs processing, a large checkout can cost more to
process than the flat fee earns. `PAYMONGO_QRPH_PROCESSING_RATE` is the
VAT-inclusive estimate used until PayMongo reports the exact fee.

For open play and other paid events, the registration fee is per person. A
lead player may include named guests in the first checkout, so a ₱100 event
with two guests has a `₱100 × 3` venue subtotal and a ₱315 automatic total.
The entire group is capacity-checked under one event lock and is held only when
every requested spot is available. Confirmed players can add more named guests
later through an incremental payment; an expired or failed add-on never changes
the already-confirmed registration.

## Payouts

### What is owed

`PayoutEntry` is the ledger of what Bunal.club owes each venue and trainer. It
is written only for platform-collected payments:

- `EARNING` — `+venueAmount` (or `+trainerAmount`) when the payment settles and
  the booking, registration, or session is confirmed.
- `REFUND` — the negative entry written when that share is returned to the
  player, capped at what was earned.

Both writers (`ensurePayoutEarning`, `ensurePayoutRefund` in
`src/lib/payouts.ts`) are idempotent through the unique `(payment, type)` key
and read the amounts from the payment row itself. A payment that lost its hold
and was refunded before confirmation writes nothing.

### The Monday and Thursday run

The hourly sweep calls `createDuePayouts()`. It computes the most recent
Monday or Thursday at 00:00 Asia/Manila and, for each recipient, batches every
unbatched entry effective **before** that instant into one `PENDING` `Payout`.
So each payout covers everything paid up to the end of the previous day,
including bookings that have not been played yet.

- The cutoff is derived from the clock, so a missed cron run self-heals on the
  next one.
- `@@unique([recipientId, recipientKind, cutoffAt])` makes concurrent sweeps
  safe: one creates the payout, the other skips.
- A recipient whose entries sum to zero or less gets no payout. The entries
  stay unbatched and are summed again next run. **This is how a refund issued
  after a payout is deducted from the following one.**
- A recipient with no payout account is skipped and reported; their balance
  waits.

### Sending and recording

Payouts are manual transfers. An admin opens `/dashboard/admin/payouts`, sends
each amount to the snapshotted GCash, Maya, or bank destination, and records
the transfer reference. Marking a payout paid requires recent admin MFA, is a
compare-and-set on `PENDING`, and writes a `SecurityEvent`.

Marking a payout paid also emails the recipient. The email states the exact
amount, the date sent, the destination (network, account name, and the last
four digits only), the transfer reference, the last day the payout covers, and
one line per booking, event, session, or refund, adding up to the amount sent.
The admin can add an optional **message to the recipient**, which is stored in
`Payout.recipientMessage`; the **internal note** is never emailed.

- **Preview.** "Preview email" renders the same email without recording
  anything. Preview, send, and resend all build it through one function in
  `src/lib/payout-actions.ts` from `getPayoutDetail()`, so the preview cannot
  drift from what is sent.
- **Delivery is reported, not assumed.** `Payout.emailedAt` is set only when
  the provider accepts the message. The transfer is recorded either way: a
  failed email never undoes a payout. The Sent list shows "Not emailed" until
  it goes out.
- **Resend.** "Resend email" on a sent payout sends it again with the stored
  reference, message, and sent date.

Venues see their statement under **Dashboard → Payments → Payouts**; trainers
under **Trainer → Payments**.

### The payout account

One `PayoutAccount` per user: network (GCash, Maya, or bank transfer), account
name, and account number. Only the venue owner, or an admin assisting them,
may change it — staff cannot, whatever their payment permission. Saving it
requires recent MFA, is rate-limited, re-points any payout that has not been
sent yet, and emails the owner when an existing account is changed.

## Manual player payments

Partners configure any number of active GCash, Maya, bank-transfer, or custom
destinations under **Dashboard → Payments**. Each destination can contain a
display label, account name/details, instructions, and an optional QR image.
The partner then selects **Manual** as its account-wide checkout mode.

For every manual checkout:

1. The requested court hours or event capacity are held for 15 minutes.
2. The player chooses one of the partner's destinations, transfers the venue
   or event's advertised amount, uploads a receipt image, and may add a
   transaction reference. No Bunal.club fee is added.
3. Before submitting proof, the player may cancel a court or event checkout to
   release the held hours or event spots immediately. An active automatic QR
   intent is cancelled at PayMongo before local capacity is reopened.
4. No upload by the deadline releases the court hours or event capacity.
5. A valid on-time upload freezes the reservation as **Pending booking** with
   no second review deadline.
6. The partner opens the existing booking or event-payment detail, reviews the
   snapshotted payment instructions and receipt, then approves or declines.
7. Approval confirms all linked court bookings or named event spots. Decline
   immediately releases them and may include an optional reason.

Manual refunds happen outside Bunal.club through the original network. After
returning the venue amount, the partner records the refund and optional
reference on the booking or event payment. Manual payments never enter the
payout ledger: the money was never Bunal.club's to send.

Venue partners may also add named complimentary guests from the event player
list. These organizer-managed spots confirm immediately, count against event
capacity, and have no registration or service fee in either collection mode.
Organizers may add players up to the event's remaining capacity in batches of
at most 50 names.

## Bunal.club's PayMongo account

An admin connects the account under `/dashboard/admin/payments`. The action
validates the secret key, registers the signed webhook for every event the
account needs, and stores both credentials encrypted with AES-256-GCM.

- **Automatic checkout is closed across the whole site while this account is
  disconnected.** In production only a dashboard connection counts; the
  environment-key fallback does not enable player checkout, because its
  webhook cannot be upgraded or verified.
- Replacing the key is refused if the new key cannot read payments the account
  already collected, since those could then neither settle nor be refunded.
- Disconnecting is refused while a player is mid-payment. Payments already
  collected can still be polled, cancelled, and refunded afterwards.
- The dashboard checks that `APP_URL` reaches the public webhook route and
  refuses a new connection when it does not.

One webhook route, `/api/billing/webhook/paymongo`, receives two unrelated
kinds of money and tells them apart by the resource the event names:

- a **payment intent** — a player's court, event, or trainer payment, handled
  by `src/lib/platform-webhook.ts`;
- a **checkout session** — a partner's or trainer's legacy service-fee
  settlement, handled by `handleServiceFeeProviderEvent`.

Only an invalid signature is answered with 400. A correctly signed event the
app has nothing to do with gets 200 so PayMongo does not retry it forever.
`ProviderEvent` deduplicates deliveries.

| Variable | Purpose |
| --- | --- |
| `ENCRYPTION_KEY` | Encrypts PayMongo credentials. |
| `ENCRYPTION_KEYS_PREVIOUS` | Optional old keys used during rotation. |
| `APP_URL` | Public HTTPS origin used for redirects and the webhook URL. |
| `BOOKING_SWEEP_SECRET` | Bearer token for manual sweep runs. |
| `CRON_SECRET` | Bearer token Vercel attaches to the hourly cron. |
| `PAYMONGO_QRPH_PROCESSING_RATE` | Optional VAT-inclusive rate for estimating the absorbed processing cost; defaults to `0.015008`. |
| `PAYMONGO_SECRET_KEY`, `BILLING_WEBHOOK_SECRET` | Legacy fallback for service-fee settlements only. Does not enable player checkout in production. |
| `SERVICE_FEE_PAYMENT_INSTRUCTIONS` | Fallback remittance details for legacy service-fee balances. |

PayMongo cannot deliver webhooks to localhost. Use an HTTPS tunnel such as
Cloudflare Tunnel or ngrok for local webhook testing.

## Booking settlement

A paid booking or event group begins as a 15-minute hold. The app creates the
payment ledger before either displaying manual destinations or calling
PayMongo. Automatic payments claim the charge atomically to prevent duplicate
Payment Intents, create a single-use QR Ph Payment Method with the same
expiry, store PayMongo's Base64 QR image, and render it on the payment screen.
A signed `payment.paid` webhook marks the payment successful and confirms the
booking. Five-second polling from the open page is a fallback.

Every money operation resolves its PayMongo account through
`src/lib/payment-rails.ts`: Bunal.club's account for `PLATFORM` rows, the
venue's or trainer's stored keys for a `DIRECT` row that has a gateway.

## Refunds

The service fee is non-refundable. An automatic court or event refund returns
`venueAmount` to the player from Bunal.club's PayMongo account and writes a
payout `REFUND`. Trainer sessions keep their existing rules: a trainer-initiated
cancellation returns the full amount including the fee; a player cancelling at
least 24 hours ahead receives the trainer subtotal; later player cancellations
are non-refundable.

A refund is claimed on the payment row before PayMongo is asked, so two
cancellations landing together request one refund. A refund issued from the
PayMongo dashboard instead is mirrored onto the ledger by the
`payment.refunded` webhook.

## The hourly sweep

Vercel calls `/api/bookings/sweep` hourly at 10 minutes past the hour, as
configured in `vercel.json`, using `CRON_SECRET`. For a manual run:

```bash
curl -X POST \
  -H "Authorization: Bearer $BOOKING_SWEEP_SECRET" \
  https://www.bunal.club/api/bookings/sweep
```

Availability does not depend on the cron: expired holds stop blocking slots
based on the current time. These do depend on it:

- **Payout creation.** No sweep, no Monday or Thursday payouts.
- **In-flight reconciliation.** A QR Ph payment whose webhook was lost and
  whose page was closed is polled here. Without it the player's money would
  sit in Bunal.club's account with no booking. A paid intent settles, or is
  refunded automatically if its hold was lost.
- BunalQ automatic run closure, service-fee reminders, and security cleanup.

Submitted manual proofs are excluded from expiry and continue counting against
court or event capacity until a partner reviews them.

## Payments taken before platform collection

Until the cutover, each venue and trainer connected its own PayMongo account,
received player payments directly, and remitted a 3% service fee to Bunal.club
weekly. That model no longer takes new payments, but its records are live:

- A `DIRECT` payment with a `gatewayId` is still polled, settled by its own
  webhook (`/api/venue-payments/webhook/[token]`,
  `/api/trainer-payments/webhook/[token]`), cancelled, and refunded through the
  venue's or trainer's stored keys, even if that account was disconnected.
- Their fees live in `ServiceFeeEntry` / `TrainerServiceFeeEntry`. Outstanding
  balances are settled through the existing screen, now labelled **Earlier
  service fees**, and are **not** netted against payouts.
- The weekly due date, seven-day grace, three-day enforcement grace, reminder
  emails, and the pause on bookings and directory listing for an overdue
  balance all still apply until the balance is cleared.
- The settlement tab is hidden for an account with no such history.

Platform-collected payments never create service-fee entries: Bunal.club
already holds the fee.

## Verification

Run `npm run check:money`, `npm run check:fee`, `npm run check:payouts`,
`npm run check:platform-collection`, and `npm run check:readiness`. Checks use
a real non-production PostgreSQL database and mock PayMongo only at the network
boundary.
