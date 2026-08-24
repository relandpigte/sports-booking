# Transactional email design system

All outbound Bunal.club email must use `transactionalEmailContent` from
`src/lib/email-html.ts`. One shared renderer keeps account, booking, partner,
trainer, payment, security, invitation, and settlement messages visually and
structurally consistent.

## Brand contract

- Navy `#10243a` header and footer
- Bunal green `#16803c` primary action
- Lime `#a3ce3c` accent rule and tagline separators
- Soft green `#e9f5ec` operational or safety note
- Official `/bunal-logo-v2-wordmark.png` wordmark
- Email-safe Arial/Helvetica typography and table layout
- `Play · Compete · Connect` footer with Bunal.club and Privacy links

## Template anatomy

Every template provides a subject, preview text, category eyebrow, heading,
optional recipient name, plain-language paragraphs, one primary action, an
absolute action URL, and an operational or safety note. The renderer adds the
logo header, greeting, responsive CTA, visible fallback URL, branded note,
footer, HTML escaping, and a matching plain-text version.

## Usage

```ts
return transactionalEmailContent({
  subject: "Your booking is confirmed",
  preheader: "Your payment succeeded and the court is reserved.",
  eyebrow: "Booking confirmed",
  heading: "You're confirmed",
  recipientName: playerName,
  paragraphs: ["Your booking details now appear in your schedule."],
  actionLabel: "View booking",
  actionUrl,
  note: "Keep your receipt for reference.",
});
```

Dynamic values must be passed as plain strings, never pre-rendered HTML. The
renderer escapes all user and business data. Keep one primary action per email
and preserve a meaningful plain-text fallback. Add every new email family to
`checks/email-templates.check.ts`.
