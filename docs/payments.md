# Payments

Money moves in **two independent directions**, through two different PayMongo
accounts. Keeping them straight is most of understanding this system.

| | Who pays whom | Whose PayMongo account | Where the code lives |
| --- | --- | --- | --- |
| **Subscriptions** | Partner → Bunal.ph, monthly | **Yours** — env vars below | `src/lib/billing.ts`, `src/lib/payments/paymongo.ts` |
| **Court bookings** | Player → the venue | **The partner's** — they connect it themselves | `src/lib/booking-payments.ts`, `src/lib/payments/paymongo-venue.ts` |

Bunal.ph takes **no cut** of a court booking. That money never touches the
platform account; it goes straight from the player to the venue.

There is no simulated gateway. A payment either moves real money or fails.

---

## 1. Environment variables

Copy `.env.example` to `.env`. These are the ones payments need:

| Variable | What it is |
| --- | --- |
| `PAYMENT_PROVIDER` | `paymongo`. The only supported value; leave it unset and you get it anyway. |
| `PAYMONGO_SECRET_KEY` | **Your own** `sk_…`. Charges partners for their monthly plan. |
| `PAYMONGO_PUBLIC_KEY` | **Your own** `pk_…`. Must be the same mode (test/live) as the secret key. |
| `BILLING_WEBHOOK_SECRET` | The `whsk_…` from registering the platform webhook — see step 3. |
| `BILLING_SWEEP_SECRET` | Bearer token for `POST /api/billing/sweep`. Anything unguessable. |
| `BOOKING_SWEEP_SECRET` | Bearer token for `POST /api/bookings/sweep`. |
| `ENCRYPTION_KEY` | Encrypts each partner's gateway keys at rest. **Without it, partners cannot connect at all** — connecting refuses rather than storing a secret in plaintext. |
| `APP_URL` | Public origin. Must be **https** and publicly reachable: PayMongo will not deliver a webhook to `localhost`. |

Generate the ones you choose yourself:

```bash
openssl rand -base64 32                                                   # either sweep secret
node -e "console.log('k1:'+require('crypto').randomBytes(32).toString('base64'))"   # ENCRYPTION_KEY
```

Your PayMongo keys come from **dashboard.paymongo.com → Developers → API keys**.
Use the test keys until you are ready to take real money, and make sure both
come from the same mode — a live secret with a test publishable key connects
fine and then fails every payment, which is the worst kind of bug.

> `ENCRYPTION_KEY` can be rotated: put the old value in
> `ENCRYPTION_KEYS_PREVIOUS` (comma-separated, same `id:base64` shape) and rows
> written with it keep decrypting, re-encrypting on their next write. Losing it
> entirely just means partners reconnect.

## 2. Local development

PayMongo cannot reach `localhost`, so a tunnel is required for anything that
involves a webhook:

```bash
cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
```

Put that https URL in `APP_URL`, restart the dev server, then register the
webhook. Without it you can still browse, book at settle-at-venue hubs, record
offline payments and comp periods — everything except taking money online.

## 3. Register the platform webhook

Partners get their webhook registered automatically when they connect. Your own
account has nobody to do that for it, so:

```bash
npm run paymongo:webhook
```

It registers `https://<APP_URL>/api/billing/webhook/paymongo` for
`checkout_session.payment.paid` and prints the signing secret **once**. Put it in
`.env` as `BILLING_WEBHOOK_SECRET` and restart.

If you lose the secret, delete the webhook in PayMongo's dashboard and run the
command again — PayMongo will not show an existing one a second time.

## 4. Collecting from partners

`/dashboard/admin/subscriptions` is the screen for this. Every partner shows
their plan, status, what they owe and when their access ends, with three
actions:

- **Payment link** — creates a PayMongo checkout and gives you a URL to send,
  with a **QR** beside it for a partner who is in front of you or on a call.
  Either way it settles by webhook the moment they pay. Pressing it twice, or the partner
  pressing "Pay now" at the same moment, reuses the same payment — you cannot
  accidentally charge for one month twice.
- **Mark paid** — for a bank transfer, cash, or GCash to your own number. Takes
  a reference note and moves the subscription exactly as a real payment would.
  Refused if they are already covered, so a double-click cannot credit two
  months for one transfer.
- **Comp** — a ₱0 month, recorded as such with who granted it.

All three write to the same ledger the partner sees on their own billing page.

**Nothing renews silently.** A period ends, the subscription goes `PAST_DUE`
with a seven-day grace window, and someone pays a link. That is why partner
signup asks for no card details.

This is not a design preference — it is what the account can do. PayMongo gates
both halves of automatic billing per merchant, and on this account both are off:

```
GET  /v1/subscriptions      403  no subscription payment methods are
                                 configured for this organization
POST /v1/payment_intents    400  On session payments are not yet supported.
     + setup_future_usage   400  Off session payments are not yet supported.
```

So a card cannot be saved and a subscription cannot be created. To turn on
automatic monthly charging, **ask PayMongo support to enable recurring payments
and card vaulting**, then re-run:

```bash
npm run paymongo:probe
```

When that prints objects instead of 403s, the printed JSON is the shape the
subscriptions adapter should be written against. Until then, collection is the
three manual actions above.

The fee rate and the grace window are constants in `src/lib/constants.ts`
(`PLATFORM_FEE_RATE`, `GRACE_DAYS`). Every surface reads them — the booking
grid, the pay page, the ledger and the invoice — so changing the number changes
the product, and the quote a player sees can never disagree with the bill a
venue gets.

There is **no trial**: joining is free, so there is nothing to trial. A new
partner starts ACTIVE with a one-month billing period, and most months that
period closes with ₱0 accrued and no invoice raised at all.

## 5. What a partner has to do

A hub is listed publicly only when **both** are true: the subscription is
entitled, and a payment gateway is connected. A venue that cannot take a payment
does not appear in the directory — the partner is told so on `/dashboard/hubs`,
with a link to fix it.

They connect on **Billing → Getting paid by players** by pasting their own
publishable and secret keys. We verify the keys against PayMongo before storing
anything, register their webhook in their account, and encrypt both secrets.
Their keys are never shown again — only the last few characters.

## 6. Cron

Two endpoints, both bearer-authenticated, both returning 503 if their secret is
unset (closed, not open):

```bash
curl -X POST -H "Authorization: Bearer $BILLING_SWEEP_SECRET" https://bunal.ph/api/billing/sweep
curl -X POST -H "Authorization: Bearer $BOOKING_SWEEP_SECRET" https://bunal.ph/api/bookings/sweep
```

The first closes billing periods and moves lapsed subscriptions through grace,
raising an invoice only when service fees actually accrued. The second
tidies expired booking holds.

Neither is load-bearing for correctness, and that is deliberate: entitlement and
court availability are both **time-based predicates** evaluated inside the
query, so a partner's hubs unlist the moment their grace expires and a lapsed
hold frees its hours on the next availability read — whether or not any cron has
run. The sweeps only pull the writes forward.

## 7. Checking it works

```bash
npm run check        # the venue money path, and the QR renderer
```

PayMongo is mocked at the network boundary (`checks/paymongo-mock.ts`), so the
adapter under test is the real one — real URLs, real auth, real parsing, real
signature verification. The check writes fixtures to the database, so it refuses
to run with `NODE_ENV=production`.

For a manual pass with test keys, PayMongo's test card is
`4343 4343 4343 4345`, any future expiry, any CVC.

## 8. Where the money is recorded

Two tables, both carrying `amount`, `status`, `paidAt`, `refundedAt` and
`refundedAmount`:

- **`Payment`** — subscriptions. `kind` is `SUBSCRIPTION`, `MANUAL` (someone
  pressed pay, or an admin recorded a transfer) or `COMP`.
- **`BookingPayment`** — court bookings. Also carries the 15-minute hold's
  `expiresAt` and the `chargeStartedAt` double-charge guard.

`/dashboard/reports` (partner) and `/dashboard/admin/reports` (you) read these
directly. Revenue is bucketed by **Manila civil day**, and a refund is counted
on the day it was issued rather than backdated into the month of the sale.
