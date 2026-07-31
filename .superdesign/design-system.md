# Bunal.club homepage design system

## Product and audience

Bunal.club is Bohol's court discovery, booking, payment, and venue operations
platform for volleyball, badminton, and pickleball. The public homepage must
serve two journeys clearly:

1. Players discover a local hub, choose available hours, book, pay through
   PayMongo, and manage their reservation.
2. Venue partners register, get admin-approved, publish hubs and courts,
   connect their own PayMongo account, manage bookings, and understand revenue
   and service-fee settlements.

The homepage is a new marketing route at `/`. `/hubs` remains the dedicated
court directory.

## Brand source of truth

Use the actual transparent Bunal.club logo at
`public/bunal-logo-transparent.png`. The badge combines a near-black
shield/navy wordmark, court green, lime, ocean blue, and the Bohol landscape.
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
2. Hero: Bohol/local eyebrow; outcome headline about finding, booking, and
   paying for courts; player CTA to `/hubs`; partner CTA to
   `/register/partner`; visual booking/payment preview.
3. Fast benefit rail: live availability, flexible hour selection, instant
   PayMongo confirmation, player/partner dashboards.
4. Player flow: browse hub, choose court/hours, pay, play.
5. Payment section: PayMongo-hosted checkout with QR Ph, GCash, Maya, and
   credit/debit cards; 15-minute booking hold; automatic confirmation; no card
   details stored by Bunal.club.
6. Feature grid with only existing functionality: venue profiles and maps,
   court/rate/hours management, live availability, booking management,
   rescheduling/cancellation/refund support, player booking dashboard, partner
   reports, admin partner approvals, admin settlement breakdown, social links.
7. Partner section: no plans/subscriptions/monthly charges; proceeds go to the
   venue's own PayMongo account; venue retains advertised court rate; fixed
   Bunal.club service fee is ₱15 for one hour and ₱25 for more than one hour;
   PayMongo connection and webhook setup is guided in-dashboard.
8. Final dual CTA and legal/footer links.

## Motion and accessibility

Use 150–250ms color, border, transform, and shadow transitions. Respect
`prefers-reduced-motion`. No scroll-trigger dependency or client-only viewport
branching. Maintain visible focus states, semantic headings, descriptive link
labels, 44px tap targets, sufficient contrast, and server-stable markup.
