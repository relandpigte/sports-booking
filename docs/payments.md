# Payments

Bunal.club has no partner plans, subscriptions, or monthly charges. Partners use
the application for free. Each partner selects one account-wide collection mode
for all new court bookings, paid event registrations, and paid guest add-ons:
automatic PayMongo QR Ph or partner-reviewed manual transfer.

## Partner activation

Public partner registrations start in `DRAFT`. The partner submits owner and
first-hub details to move into `PENDING`. An admin reviews the application in
`/users`, then activates the partner. An `ACTIVE` partner can manage hubs before connecting PayMongo.
After it has at least one court, the hub appears in the public directory as
Coming soon. Completing the selected automatic or manual payment setup verifies
the hub and opens online bookings.

## Pricing

In automatic mode, the player pays the venue's court rate plus one all-inclusive 3% service fee. The fee is
calculated from the complete court total and charged once across the player's
whole selection, including selections that contain gaps and create separate
booking sessions. Each `BookingPayment`
snapshots:

- `venueAmount` — the advertised court total.
- `platformFee` — the service fee quoted for this booking.
- `amount` — the court amount plus the service fee (the booking subtotal).
- `processingFee` — the PayMongo QR Ph fee absorbed from Bunal.club's service fee.

These values and the processing-fee responsibility are stored so historical
reports and refunds do not change when either fee schedule changes. New player
payments use direct PayMongo Payment Intents for exactly the venue amount plus
the applicable court or event payment fee. PayMongo deducts its exact reported
fee from the partner account;
Bunal.club records an equal processing credit against the partner's service-fee
balance. `PAYMONGO_QRPH_PROCESSING_RATE` remains the VAT-inclusive fallback when
PayMongo does not report the exact fee.

The migration marks every pre-existing booking, event, and trainer payment as
`PLAYER` responsibility. That keeps pending checkouts, completed-payment
reports, refunds, and existing settlement balances on their original rules.
Only automatic payments created after deployment use `BUNAL` responsibility.

In manual mode, the player pays only `venueAmount`. Both `platformFee` and
`processingFee` are zero, so neither the player nor the partner owes a
Bunal.club fee for that transaction. The partner reviews the receipt before
the booking or event capacity is confirmed.

For open play and other paid events, the registration fee is per person. A
lead player may include named guests in the first checkout, so a ₱100 event
with two guests has a `₱100 × 3` venue subtotal. Automatic checkout adds a
flat ₱5 payment fee for each paid spot, making that group's total ₱315;
manual checkout adds neither a payment nor processing fee. The entire group is
capacity-checked under one
event lock and is held only when every requested spot is available. Confirmed
players can add more named guests later through an incremental payment; an
expired or failed add-on never changes the already-confirmed registration.

## Manual player payments

Partners configure any number of active GCash, Maya, bank-transfer, or custom
destinations under **Dashboard → Payments**. Each destination can contain a
display label, account name/details, instructions, and an optional QR image.
The partner then selects **Manual** as its account-wide checkout mode.

For every manual checkout:

1. The requested court hours or event capacity are held for 15 minutes.
2. The player chooses one of the partner's destinations, transfers the venue
   or event's advertised amount, uploads a receipt image, and may add a
   transaction reference. No Bunal.club or PayMongo fee is added.
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
reference on the booking or event payment. Because manual payments are
fee-free, the venue amount is the full checkout amount.

Venue partners may also add named complimentary guests from the event player
list. These organizer-managed spots confirm immediately, count against event
capacity, and have no registration or Bunal service fee in either collection
mode. Organizers may add players up to the event's remaining capacity in batches
of at most 50 names. They are labeled separately from player-paid registrations
and can be removed by the organizer to release capacity. Historical organizer-
player service-fee entries remain auditable and reverse normally when an
associated player is removed or the event is cancelled.

## Partner gateway setup

Each venue uses its own PayMongo account so player booking proceeds go directly
to that partner. The admin activates the partner in `/users`; the partner may
then create its hub and courts before connecting an account. Complete hubs are
published as Coming soon, but booking remains unavailable. Connecting an active
gateway changes the public hub to Verified and enables online reservations.

### Partner onboarding steps

1. Create a PayMongo account at
   [dashboard.paymongo.com/signup](https://dashboard.paymongo.com/signup) and
   complete PayMongo's business verification. Test keys are available for
   sandbox setup; the account and required payment channels must be activated
   before accepting real payments.
2. In the PayMongo dashboard, open **Developers → API Keys**. Copy a matching
   pair:
   - Test setup: `pk_test_…` and `sk_test_…`
   - Live payments: `pk_live_…` and `sk_live_…`
3. In Bunal.club, open **Partner dashboard → Payments → Getting paid by
   players**. Paste the public key into **Publishable key**, paste the matching
   secret into **Secret key**, and select **Connect account**.
4. The application verifies the credentials and registers the partner-specific
   `payment.paid`, `payment.failed`, `payment.refunded`, and legacy
   `checkout_session.payment.paid` webhook events automatically.
   Complete a test booking before going live.
5. After PayMongo activates the live account, use **Replace keys** and replace
   both test keys with the live pair. Never mix test and live credentials.

The secret key controls the partner's PayMongo account and must be treated like
a password. Never send it through chat or email, store it in source control, or
place it in client-side code. If it is exposed, regenerate it in PayMongo and
replace it in Bunal.club immediately. See PayMongo's
[official API-key guide](https://docs.paymongo.com/do/docs/account-settings-api-keys).

After the partner submits the form, the application:

1. Verifies the credentials with PayMongo.
2. Registers the partner-specific webhook.
3. Encrypts the secret and webhook signing key with AES-256-GCM.
4. Stores only a safe key hint for display.

The required environment variables are:

| Variable | Purpose |
| --- | --- |
| `ENCRYPTION_KEY` | Encrypts partner gateway credentials. |
| `ENCRYPTION_KEYS_PREVIOUS` | Optional old keys used during rotation. |
| `APP_URL` | Public HTTPS origin used for redirects and webhook URLs. |
| `BOOKING_SWEEP_SECRET` | Bearer token for the expired-hold sweep. |
| `CRON_SECRET` | Random Bearer token automatically attached by Vercel's hourly maintenance cron. |
| `PAYMONGO_QRPH_PROCESSING_RATE` | Optional VAT-inclusive decimal rate for direct QR fee gross-up; defaults to `0.015008`. |
| `PAYMONGO_SECRET_KEY` | Optional legacy fallback for Bunal.club's service-fee PayMongo account. |
| `BILLING_WEBHOOK_SECRET` | Optional webhook secret paired with the environment fallback. |
| `SERVICE_FEE_PAYMENT_INSTRUCTIONS` | Fallback manual remittance details shown to partners. |

PayMongo cannot deliver webhooks to localhost. Use an HTTPS tunnel such as
Cloudflare Tunnel or ngrok for local webhook testing.

## Service-fee remittance

The partner's PayMongo account receives the booking subtotal and PayMongo
deducts its processing fee. After a successful automatic booking is confirmed,
`ServiceFeeEntry` rows record both the snapshotted court or event payment fee
and an equal negative processing credit. The partner therefore remits only
Bunal's net fee and keeps the complete advertised venue amount. Manual partner payments do
not create service-fee entries.
That service fee is non-refundable: an automatic-checkout refund returns the
venue amount, retains the service fee, and does not create a negative ledger
entry. There is no separately charged processing fee to refund.
Partners remit the outstanding balance from `/dashboard/payments`. The primary
flow opens an exact-amount QR Ph-only PayMongo hosted checkout in Bunal.club's
own account. A signed
`checkout_session.payment.paid` webhook marks the settlement paid
automatically. The partner pays exactly the displayed settlement balance and
Bunal.club absorbs that checkout's processing fee; the browser return leg also
checks PayMongo in case it arrives before the webhook. Manual transfer
reference and receipt submission remains available as a fallback, with admins
reviewing those submissions in `/dashboard/admin/settlements`.
The exact fee PayMongo deducts from an automatic partner or trainer settlement
is stored on that settlement for margin auditing and reconciliation.
An already-open hosted settlement keeps the provider settings and amount it was
created with; the no-additional-fee rule applies when a new settlement checkout
is created.

An admin connects Bunal.club's collection account under
`/dashboard/admin/payments`. The action validates the secret key, registers the
signed settlement webhook, and stores both credentials encrypted at rest. Once
that dashboard record exists it is authoritative, including when disconnected;
an old environment key cannot silently reactivate collection. Replacing a key
also verifies that it can still read every active settlement checkout. The
dashboard checks that `APP_URL` reaches the public webhook route and refuses a
new connection when it does not, preventing an expired tunnel URL from looking
healthy.

`PAYMONGO_SECRET_KEY` and `BILLING_WEBHOOK_SECRET` remain as a migration
fallback for deployments that have not connected through the dashboard. The
legacy CLI can register that fallback webhook after setting `APP_URL`:

```bash
npm run paymongo:webhook
```

Paste the returned signing secret into `BILLING_WEBHOOK_SECRET`, then restart
the server or redeploy.

Fees settle weekly with a seven-day payment grace period after each week
closes. When that deadline passes, the balance is overdue but the partner gets
a final three-day enforcement grace before new paid bookings pause and its hubs
leave the public directory. Manual settlement proof is displayed as under
review but does not reduce the balance or bypass an existing restriction until
an admin approves it. Only one manual proof may be under review at a time, and
receipt submissions are rate-limited. The authenticated maintenance sweep
emails an active partner during the 24 hours before a balance is due, again
when it becomes overdue, and at most once every 24 hours afterward until it is
paid or settlement proof is submitted. The same sweep reconciles expired or
abandoned PayMongo settlement sessions. Concurrent sweeps claim each reminder
atomically, and a failed email releases the claim so the next sweep can retry
safely.

## Booking settlement

A paid booking or event group begins as a 15-minute hold. The app creates the payment ledger
before either displaying manual destinations or calling PayMongo. Automatic
payments claim the charge atomically to prevent duplicate
Payment Intents. It creates a single-use QR Ph Payment Method with the same
expiry, stores PayMongo's Base64 QR image, and renders it directly on the court
or event payment screen. A signed `payment.paid` webhook marks the payment
successful and confirms the associated booking. Five-second polling is a
browser fallback, while `ProviderEvent` prevents webhook replay. Existing
hosted Checkout Sessions remain readable and refundable during rollout.

Vercel calls the cleanup endpoint hourly at 10 minutes past the hour, as
configured in `vercel.json`. Set `CRON_SECRET` in the production Vercel project
to a random value of at least 16 characters. For an additional external or
manual run, use `BOOKING_SWEEP_SECRET`:

```bash
curl -X POST \
  -H "Authorization: Bearer $BOOKING_SWEEP_SECRET" \
  https://www.bunal.club/api/bookings/sweep
```

Availability does not depend on the cron: expired holds stop blocking slots
based on the current time. The sweep removes stale rows and closes their ledger
records. BunalQ automatic run closure does depend on the hourly sweep. Submitted
manual proofs are excluded from expiry and continue counting against court or
event capacity until a partner reviews them.

## Verification

Run `npm run check:money`, `npm run check:fee`,
`npm run check:settlement`, and `npm run check:paymongo`.
Checks use a real non-production PostgreSQL database and mock PayMongo only at
the network boundary.
