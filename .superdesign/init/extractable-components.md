# Extractable components

## Logo

- Source: `src/components/Logo.tsx`
- Category: basic
- Description: Shared Bunal.club wordmark in a proportion-preserving 250×60 box.
- Extractable props: none needed for the homepage.
- Hardcoded: `/bunal-logo-transparent.png`, alt text, dimensions, containment
  behavior.

## PublicTopBar

- Source: `src/components/hubs/PublicTopBar.tsx`
- Category: layout
- Description: Sticky signed-out header for the hub directory.
- Extractable props: none; its current destination is directory-specific.
- Hardcoded: logo, Browse hubs, Log in, Sign up labels and routes.

## AppShell

- Source: `src/components/dashboard/AppShell.tsx`
- Category: layout
- Description: Authenticated sidebar shell used by dashboards and signed-in hub pages.
- Extractable props: role, partnerStatus, display name, email, image.
- Hardcoded: dashboard navigation and logout control.

## AuthLayout

- Source: `src/components/AuthLayout.tsx`
- Category: layout
- Description: Split brand/form layout shared by login and registration.
- Extractable props: title, subtitle.
- Hardcoded: sport labels, brand message, logo, decorative background.

## Button

- Source: `src/components/ui/Button.tsx`
- Category: basic
- Description: Primary, soft, or navy full-width action.
- Extractable props: variant, disabled.
- Hardcoded: radius, spacing, focus and hover states.

## Badge

- Source: `src/components/ui/Badge.tsx`
- Category: basic
- Description: Semantic status pill.
- Extractable props: tone.
- Hardcoded: tone palette and shape.
