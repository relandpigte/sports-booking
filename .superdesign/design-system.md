# Bunal.club homepage design system

## Product and audience

Bunal.club is the Philippines' court discovery, booking, payment, and venue
operations platform for volleyball, badminton, pickleball, and tennis. The public homepage must
serve two journeys clearly:

1. Players discover a local hub, choose available hours, book, pay through
   PayMongo, and manage their reservation.
2. Venue partners register, get admin-approved, publish hubs and courts,
   connect their own PayMongo account, manage bookings, and understand revenue
   and service-fee settlements. Completed hubs may appear publicly as
   “Coming soon” before PayMongo is connected, but cannot accept bookings.

The homepage is a new marketing route at `/`. `/hubs` remains the dedicated
court directory.

## Brand source of truth

Use the actual transparent Bunal.club logo at
`public/bunal-logo-transparent.png`. The badge combines a near-black
shield/navy wordmark, court green, lime, ocean blue, and Philippine sports culture.
The homepage should feel energetic, local, sunny, and operationally
trustworthy—sports-club energy with payment-product clarity.

Hard palette:

- Navy `#10243a`: headlines, footer, deep surfaces.
- Green `#16803c`: primary actions, success, key interactive accents.
- Green hover `#0f6330`.
- Lime `#a3ce3c`: energetic highlights and small decorative accents.
- Ocean `#2b87b8`: payment/information accents.
- Off-white `#f7faf8`: alternating content surfaces.
- White `#ffffff`: default page and cards.
- Ink `#14202c`: body text.
- Muted gray `#64748b`: supporting copy.
- Border `#dfe7e2`: restrained card and section borders.

Do not introduce purple, pink, orange, or unrelated gradients. Soft tonal
green/navy washes derived from the logo are allowed as low-opacity atmosphere.

## Reference influence

The structure is inspired by PicklePro's conversion-oriented sports SaaS
homepage: an asymmetric left-copy/right-product hero, a compact benefit rail,
alternating player/partner explanations, a strong payments band, feature
cards, and repeated role-specific CTAs. Do not copy PicklePro text, brand,
teal palette, queue/POS/membership features, or unsupported functionality.

## Typography

Use the existing Geist Sans variable font only. Display headlines are bold
800–900 weight, tightly tracked, and left aligned. Body copy is 16–18px with
comfortable line height. Small eyebrow labels are 12px uppercase with
0.18–0.22em tracking. Use weight and scale—not extra font families—to create
hierarchy.

## Layout

- Desktop content max width: 1180–1240px.
- Mobile gutters: 20px; desktop gutters: 24–32px.
- Section vertical spacing: 80–112px desktop, 56–72px mobile.
- Hero: asymmetric two-column composition, left copy and CTAs, right booking
  dashboard/payment preview that can offset toward the viewport edge.
- Card grids: three columns desktop, two tablet, one mobile.
- Use 16–24px card radii to echo the round logo badge and sports medallions.
- Header is sticky and compact. Footer is navy.
- No horizontal overflow at 320px.

## Components

- Primary button: green fill, white label, 12px radius, strong text, 44–48px
  height. Hover darkens to `#0f6330`.
- Secondary button: white or transparent, navy border, navy label.
- Cards: white, 1px border, subtle shadow only when it reinforces hierarchy or
  on hover.
- Icon tiles: simple inline SVG line icons on green/ocean/lime soft surfaces.
- Pills: fully rounded; use for sports, payment methods, and concise trust
  signals.
- Product preview: build from HTML/CSS as a believable booking card showing a
  venue, date, available times, total, and payment methods. Do not invent user
  metrics.

## Homepage content requirements

1. Sticky navigation: logo; How it works, Payments, Features, For partners;
   Browse courts; a session-aware Log in or Dashboard account link.
2. Hero: Philippines/nationwide eyebrow; outcome headline about finding, booking, and
   paying for courts; player CTA to `/hubs`; partner CTA to
   `/register/partner`; visual booking/payment preview.
3. Fast benefit rail: live availability, flexible hour selection, instant
   PayMongo confirmation, player/partner dashboards.
4. Player flow: browse hub, choose court/hours, pay, play.
5. Payment section: a prominent trust section for QR Ph-only PayMongo-hosted
   checkout; participating QR Ph bank and e-wallet apps; 15-minute booking
   hold; automatic confirmation; no payment details stored by Bunal.club; and
   a three-step visual showing player
   payment, PayMongo verification, and proceeds landing in the venue's own
   connected PayMongo account.
6. Feature grid with only existing functionality: venue profiles and maps,
   court/rate/hours management, live availability, booking management,
   rescheduling/cancellation/refund support, player booking dashboard, partner
   reports, payment security, and social links. Do not expose owner/admin
   workflows, approvals, reports, or settlement controls on public pages.
7. Partner section: no plans/subscriptions/monthly charges; proceeds go to the
   venue's own PayMongo account; venue retains advertised court rate; the
   Bunal.club service fee is 3% for automatic checkout and 2.5% for manual
   checkout;
   partners may publish a Coming soon hub before PayMongo setup, while
   connection and webhook setup remain required to verify it and open booking.
8. Final dual CTA and legal/footer links.

## Motion and accessibility

Use 150–250ms color, border, transform, and shadow transitions. Respect
`prefers-reduced-motion`. No scroll-trigger dependency or client-only viewport
branching. Maintain visible focus states, semantic headings, descriptive link
labels, 44px tap targets, sufficient contrast, and server-stable markup.

## Partner-selected player payment mode

- Each partner account uses one payment mode for new bookings: automatic
  PayMongo QR Ph or manual transfer. Players do not choose between automatic
  and manual; they follow the mode selected by the venue partner.
- Automatic mode keeps the existing direct QR Ph checkout, Bunal.club service
  fee, PayMongo processing fee, and automatic confirmation.
- Manual mode shows the partner's active GCash, Maya, bank-transfer, and custom
  networks. Manual payments add a 2.5% non-refundable Bunal.club service fee
  but no PayMongo processing fee.
- Manual checkout uses one focused responsive page: booking/event summary,
  exact amount, 15-minute countdown, payment-network cards with QR/account
  details, optional transaction reference, receipt upload, and one submission
  action. Use the supplied Courtogo screenshot only for information hierarchy;
  retain Bunal.club's own shell, palette, typography, radii, and component
  language.
- Before receipt submission, the copy must say that the slot will be released
  when the 15-minute hold expires. After submission, replace the timer with a
  clear amber “Pending booking” state explaining that the venue must approve
  the proof before confirmation.
- Partner review stays inside existing booking and event detail surfaces. Show
  expected amount, chosen network, reference, receipt preview, submission time,
  and Approve/Decline actions. Decline reason is optional and releases the held
  court or event capacity immediately.
- Do not imply that Bunal.club verifies manual transfers. The venue partner is
  responsible for reviewing proof and confirming or declining the booking.

## Authenticated dashboard architecture

The dashboard must feel like the operational side of the same Bunal.club
brand, with denser spacing and calmer surfaces than the marketing homepage.
Preserve every route and role permission while making the shared shell and
page composition consistent.

- Desktop shell (1024px and wider): a sticky white top bar with the real logo,
  role-aware primary navigation, and an avatar account menu. Show four direct
  destinations at laptop widths and up to six from 1280px, moving the remaining
  permitted destinations into an accessible More menu. Keep the content area
  full-width on the off-white background with a centered work surface.
- Mobile and tablet shell (below 1024px): a compact sticky white header with a
  hamburger that opens the navy navigation drawer. The drawer uses the same
  role and workspace permission rules as desktop, traps focus while open, and
  includes account identity and logout. Avoid horizontal page overflow.
- Page headers: small uppercase role/context eyebrow, 28–32px navy title,
  concise muted description, and actions aligned right when space permits.
- Dashboard cards: white, 1px `#dfe7e2` border, 16–20px radius, restrained
  navy-tinted shadow, and consistent 20–24px padding.
- Stat cards: label first, large value, optional short hint, and a small icon
  tile. Use green for positive/actionable states, ocean for information, lime
  sparingly for emphasis, and amber/red only for real warnings.
- Forms and tables: group related fields into titled card sections. Inputs
  remain 42–46px tall with clear labels and green focus states. Tables use
  compact headers, generous row height, and responsive overflow.
- Empty states: dashed border, soft brand tint, one clear next action.
- Role homepages:
  - Player: next booking and find-a-court action dominate; stats are secondary.
  - Partner: hub setup may start immediately; the Coming soon to Verified
    transition makes the PayMongo requirement for booking explicit.
  - Owner/admin: pending work and financial status dominate; sensitive owner
    capabilities appear only inside authenticated routes.
- Navigation labels and page content must use “Bunal.club”, not `Bunal.ph`.
- Do not expose owner/admin functionality, approval tools, reports, or
  settlement information in the public homepage or other signed-out content.

## Partner team management

- `/dashboard/team` is an owner-only operational page for inviting staff,
  reviewing pending invitations, changing access, removing staff, and auditing
  recent team activity.
- Give the page a clear summary layer before the detailed lists: active staff,
  pending invitations, and recent activity should be understandable at a
  glance without inventing business metrics.
- Invitations and member editing use one consistent permission matrix. Rows are
  Hubs, Bookings, Events, Reports, Messages, and Payments; columns are None,
  View, and Manage. Each row behaves as a radio group with one selected value.
- Use the homepage staff-access example as the interaction reference: large
  calm rows, strong selected circles, selected manage rows may receive a soft
  green tint, and unavailable access levels are visibly disabled. Reports can
  only be None or View; its Manage choice is disabled.
- Keep module descriptions available without making the matrix excessively
  tall. On narrow screens, preserve readable labels and 44px radio targets with
  no horizontal page overflow.
- Editing a staff member should feel contextual and deliberate: retain their
  identity at the top of the editor, show save/cancel actions clearly, and keep
  the destructive remove action visually separate.
- Pending invitations need visible expiry, a concise access summary, and clear
  Resend and Cancel actions. Activity entries should identify the action,
  actor, target type when available, and Manila-local date.

## Trainer tools workspace

- `/dashboard/trainer`, `/dashboard/trainer/schedule`,
  `/dashboard/trainer/sessions`, and `/dashboard/trainer/payments` form one
  connected trainer workspace for player accounts with trainer capability.
- Preserve the authenticated player shell and all existing authorization,
  application-review, scheduling, session, payment, and settlement behavior.
- Give trainers a clear sense of readiness and next action. Profile status,
  missing setup requirements, availability, new session requests, and payment
  blockers should be understandable without scanning several long forms.
- Use one compact shared workspace header and four-route navigation. On desktop,
  the active route and trainer status should remain visible near the page title;
  on mobile, navigation must scroll or wrap without hiding destinations.
- Profile setup should group public identity, coaching credentials, pricing,
  public location, and private meeting instructions into purposeful sections.
  Keep private-versus-public disclosure explicit at the point of entry.
- Schedule should prioritize a readable weekly availability overview, then
  date-specific exceptions. Avoid seven visually identical oversized rows when
  a more scannable control can preserve the same inputs and semantics.
- Sessions should behave like an operational inbox: surface request status,
  player, date/time, amount, and the single primary next action before advanced
  reschedule, decline, receipt review, cancellation, or refund controls.
- Payments should retain automatic/manual checkout configuration and service-fee
  settlement controls, but separate setup, live destination status, and money
  owed into distinct hierarchy levels. Financial warnings must remain factual.
- Prefer compact 16px-radius white work cards on the off-white dashboard,
  understated dividers, 44px controls, and restrained use of green/lime for
  readiness and primary action. Amber and red remain reserved for genuine
  attention and destructive states.
- Use only supported product facts. Do not invent earnings, conversion metrics,
  review counts, response rates, calendar sync, messaging, or analytics.

## Registration success pages

- Successful player registration lands at `/welcome/player`; successful
  partner registration lands at `/welcome/partner`.
- Reuse the authentication layout language: compact navy brand panel, real
  Bunal.club wordmark, subtle green/lime atmosphere, and a centered white
  success card on the off-white surface.
- Use a restrained green check medallion, one clear outcome headline, concise
  next-step copy, one green primary action, and one bordered secondary action.
- Player success prioritizes browsing hubs; partner success clearly states
  that the venue application is still under review and prioritizes the partner
  dashboard. Never imply that partner approval has already happened.
- Keep these pages noindex, authenticated, responsive at 320px, and free of
  confetti, invented metrics, unsupported review timelines, or fake support
  destinations.
- A successful registration may emit a one-time GTM data-layer event with the
  user type, but refreshes and ordinary dashboard visits must not count again.

## Public hub directory

The `/hubs` directory is the practical discovery surface between the marketing
homepage and a venue profile. It should borrow the reference facility
directory's information architecture while remaining unmistakably
Bunal.club.

- Use an off-white page background with a compact title and supporting copy.
- Use a compact, rounded navy discovery banner with restrained green/lime
  atmosphere so the page feels distinctly Bunal.club rather than a clone of
  the facility reference. Float the crisp white search toolbar over its lower
  edge and keep decorative detail minimal.
- Place the primary search, nearest-first action, filter toggle, and sort
  control in one responsive toolbar. Controls stack cleanly on mobile.
- Expanded filters include booking date, sport, court type, start time, and end
  time. Make active filter count and clear-all behavior obvious.
- Nearest-first requests browser location only after the user acts. Show
  distance only for hubs with valid coordinates and explain unavailable or
  denied location access without blocking search.
- Hub cards use a landscape cover photo, venue name, address, sport chips,
  court count, starting hourly rate, distance when available, and a direct
  Google Maps navigation action. The whole card still links to the hub detail.
- A completed hub whose approved partner has not connected PayMongo remains
  discoverable as a non-bookable “Coming soon” venue. Use a crisp diagonal
  navy/lime watermark or ribbon over the cover, replace live availability with
  a calm launch-status panel, and keep the profile link available. Never imply
  that players can reserve or pay before the gateway is connected.
- Use actual availability data for the selected date/time range; never display
  invented slot counts. When no date is selected, query today's availability
  in the Manila timezone and label the card count as today's inventory.
- Desktop uses a three-column card grid within a 1180–1240px work area. Tablet
  uses two columns and mobile uses one.
- Keep the signed-out public top bar and the authenticated app shell behavior.
- Only show supported sports: pickleball, tennis, badminton, and volleyball.
- Preserve white cards, `#dfe7e2` borders, navy headings, green actions, lime
  highlights, Geist typography, and 12–20px radii. Present date-aware
  availability in a calm soft-green status panel and keep shadows restrained.
- Never fill an empty live directory with invented venues. For a genuinely
  empty marketplace, show a polished player message beside a navy partner CTA
  explaining that hub setup can begin before PayMongo while bookings require a
  connected account. When active search or filters have no matches, use a
  smaller no-results state with clear-filter and partner actions instead.

## Public leaderboard

- Rankings live only at the public `/leaderboard` route and must not appear in
  authenticated dashboard navigation. Signed-in visitors still see the public
  page chrome, with a direct way back to their dashboard.
- Use a compact centered navy hero followed by Doubles and Singles pill tabs
  that switch one responsive ranking table.
- Display at most the top ten rated members returned by the Bunal.club DUPR
  club integration. Show rank, player name, rating, and reliability only; do
  not invent age, gender, location, ranking movement, or profile data.
- State clearly that the list represents Bunal.club club members and is not
  DUPR's global standings. Link to `https://www.dupr.com/rankings` for the
  official global ranking page.
- Omit unrated members from the top-player view. Use compact honest states when
  a format has no rated members, the API is unavailable, or the integration is
  not configured.

## Analytics and business intelligence

- `/dashboard/reports` is the venue partner's business-performance workspace;
  `/dashboard/admin/reports` is the Bunal.club owner's platform-intelligence
  workspace. Both use historical records, Manila-local dates, shareable URL
  filters, responsive charts, accessible tables, and CSV export.
- Partners see only their own hubs. Owners see the whole platform and can filter
  by partner, hub, revenue source, payment mode, and reporting period.
- Partner KPIs prioritize venue net revenue, confirmed transactions, court
  utilization, new customers, 30-day retention, and event financial performance.
  Owner KPIs prioritize platform GMV, Bunal.club service fees, venue/trainer
  shares, transactions, customer growth, and 30-day retention.
- Revenue sources are court bookings, event registrations, and, for owners,
  trainer sessions. Preserve gross, refunds, venue or trainer share, processing
  fees, and Bunal.club service fees as distinct ledger values; never infer money
  from booking status when a payment ledger exists.
- Court utilization is confirmed court-hours divided by sellable court-hours.
  Past periods before capacity history exists are explicitly labelled
  “Estimated utilization” and use the current operating schedule. Future
  schedule revisions preserve effective dates so later historical utilization
  is exact. Do not present estimated capacity as audited fact.
- Peak-hour analysis uses confirmed court bookings and shows the busiest
  Manila-local weekday/hour combinations without inventing demand or footfall.
- “Customer growth” means customers making their first confirmed purchase in
  the selected business scope. Retention is the share of those customers who
  make another confirmed purchase within 30 days; keep cohort labels explicit.
- Event financial performance shows registrations, event revenue, Bunal.club
  service fees, and venue net revenue. Do not call revenue-minus-service-fee
  true profit because event expenses are not stored.
- Court sport attribution is based on the court's explicit sport. Existing
  single-sport hubs may be backfilled automatically; courts at multi-sport hubs
  remain “Unspecified” until the partner selects a sport.
- Global controls should support date range, hub, court, sport, revenue source,
  payment mode, comparison with the preceding equal-length period, and CSV
  export. Hide or narrow filters that do not apply to a role or source.
- Dashboard homepages receive only a compact analytics preview: three or four
  high-signal KPIs, a previous-period cue, and one clear link to full reports.
  Keep the detailed analysis on the report routes.
- Use compact professional cards, restrained green/ocean data colors, direct
  chart labels, visible units, semantic tables, honest empty states, and no
  decorative chart junk. Never invent forecasts, membership counts, expenses,
  customer demographics, or unsupported attribution.
