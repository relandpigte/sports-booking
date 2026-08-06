# Payments

Bunal.club has no partner plans, subscriptions, or monthly charges. Partners use
the application for free. The only payment flow is a player paying a venue for
a court booking through that partner's own PayMongo account.

## Partner activation

Public partner registrations start in `DRAFT`. The partner submits owner and
first-hub details to move into `PENDING`. An admin reviews the application in
`/users`, then activates the partner. An `ACTIVE` partner can manage hubs before connecting PayMongo.
After it has at least one court, the hub appears in the public directory as
Coming soon. Connecting PayMongo verifies the hub and opens online bookings.

## Pricing

The player pays the venue's court rate plus a 3% service fee. The fee is
calculated from the complete court total and charged once across the player's
whole selection, including selections that contain gaps and create separate
booking sessions. Each `BookingPayment`
snapshots:

- `venueAmount` — the advertised court total.
- `platformFee` — the service fee quoted for this booking.
- `amount` — the court amount plus the service fee sent as the checkout
  subtotal.

All three are stored so historical reports do not change when the fee schedule
changes. Hosted Checkout V2 uses `pass_on_fees`, so PayMongo adds its
method-specific processing fee to the player after they choose how to pay.

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
4. The application verifies the credentials and registers the
   partner-specific `checkout_session.payment.paid` webhook automatically.
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
| `PAYMONGO_SECRET_KEY` | Optional legacy fallback for Bunal.club's service-fee PayMongo account. |
| `BILLING_WEBHOOK_SECRET` | Optional webhook secret paired with the environment fallback. |
| `SERVICE_FEE_PAYMENT_INSTRUCTIONS` | Fallback manual remittance details shown to partners. |

PayMongo cannot deliver webhooks to localhost. Use an HTTPS tunnel such as
Cloudflare Tunnel or ngrok for local webhook testing.

## Service-fee remittance

The partner's PayMongo account initially receives the court subtotal. After a
successful booking is confirmed, an immutable `ServiceFeeEntry` records the
3% fee owed to Bunal.club; a full refund creates an equal negative entry.
Partners remit the outstanding balance from `/dashboard/payments`. The primary
flow opens an exact-amount PayMongo hosted checkout in Bunal.club's own account
with QR Ph, credit/debit card, GCash, and Maya. A signed
`checkout_session.payment.paid` webhook marks the settlement paid
automatically; the browser return leg also checks PayMongo in case it arrives
before the webhook. Manual transfer reference and receipt submission remains
available as a fallback, with admins reviewing those submissions in
`/dashboard/admin/settlements`.

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

Fees settle weekly with a seven-day grace period after each week closes.
Overdue balances pause new paid bookings and remove the partner's hubs from the
public directory. Submitting proof immediately restores booking access while
the admin reviews it; rejection restores the overdue block.

## Booking settlement

A paid booking begins as a 10-minute hold. The app creates the payment ledger
before calling PayMongo and claims the charge atomically to prevent duplicate
checkout sessions. A signed webhook marks the payment successful and confirms
the associated bookings. `ProviderEvent` prevents webhook replay.

Point a cron at the cleanup endpoint:

```bash
curl -X POST \
  -H "Authorization: Bearer $BOOKING_SWEEP_SECRET" \
  https://www.bunal.club/api/bookings/sweep
```

Availability does not depend on the cron: expired holds stop blocking slots
based on the current time. The sweep removes stale rows and closes their ledger
records.

## Verification

Run `npm run check:money`, `npm run check:fee`,
`npm run check:settlement`, and `npm run check:paymongo`.
Checks use a real non-production PostgreSQL database and mock PayMongo only at
the network boundary.
