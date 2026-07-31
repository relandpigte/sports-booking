# Key page dependency trees

## `/` — Marketing homepage

Entry: `src/app/page.tsx`

Dependencies:

- `src/components/home/HomePage.tsx`
  - `src/components/Logo.tsx`
- `src/app/globals.css`

This is the rendered marketing page replacing the previous redirect.

## `/hubs` — Public hub directory

Entry: `src/app/hubs/page.tsx`

Dependencies:

- `src/components/PageShell.tsx`
  - `src/components/hubs/PublicTopBar.tsx`
    - `src/components/Logo.tsx`
  - `src/components/dashboard/AppShell.tsx`
    - `src/components/dashboard/DashboardNav.tsx`
    - `src/components/Logo.tsx`
    - `src/components/ui/Avatar.tsx`
- `src/components/hubs/HubCard.tsx`
  - `src/components/ui/Avatar.tsx`
- `src/lib/hubs.ts`
- `src/lib/constants.ts`

## `/hubs/[id]` — Public venue and booking

Entry: `src/app/hubs/[id]/page.tsx`

Dependencies:

- `src/components/PageShell.tsx`
- `src/components/hubs/BookCourtPanel.tsx`
  - `src/components/hubs/DateStrip.tsx`
  - `src/components/hubs/SlotGrid.tsx`
  - `src/components/ui/RadioCards.tsx`
  - `src/hooks/useAvailabilityStream.ts`
- `src/components/ui/Avatar.tsx`
- `src/lib/hubs.ts`
- `src/lib/bookings.ts`
- `src/lib/time.ts`

## `/login` — Login

Entry: `src/app/login/page.tsx`

Dependencies:

- `src/components/AuthLayout.tsx`
  - `src/components/Logo.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Button.tsx`
- `src/lib/actions.ts`

## `/register` — Player registration

Entry: `src/app/register/page.tsx`

Dependencies:

- `src/components/AuthLayout.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Select.tsx`
- `src/components/ui/Button.tsx`
- `src/lib/actions.ts`

## `/register/partner` — Partner application

Entry: `src/app/register/partner/page.tsx`

Dependencies:

- `src/components/AuthLayout.tsx`
- `src/components/partner/PartnerRegisterForm.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Button.tsx`

## `/dashboard` — Role-aware home

Entry: `src/app/(app)/dashboard/page.tsx`

Dependencies:

- `src/app/(app)/layout.tsx`
  - `src/components/dashboard/AppShell.tsx`
  - `src/components/dashboard/DashboardNav.tsx`
- `src/components/dashboard/home/PlayerHome.tsx`
- `src/components/dashboard/home/PartnerHome.tsx`
- `src/components/dashboard/home/AdminHome.tsx`

## `/dashboard/payments` — Partner payments

Entry: `src/app/(app)/dashboard/payments/page.tsx`

Dependencies:

- `src/components/partner/GatewayPanel.tsx`
- `src/components/partner/ServiceFeePanel.tsx`
  - `src/components/partner/ReceiptUpload.tsx`
- `src/lib/partner-gateway.ts`
- `src/lib/service-fees.ts`

## `/dashboard/reports` — Partner reports

Entry: `src/app/(app)/dashboard/reports/page.tsx`

Dependencies:

- `src/components/reports/RevenueReport.tsx`
  - `src/components/reports/RevenueChart.tsx`
  - `src/components/reports/PeriodPicker.tsx`
  - `src/components/reports/ChartHover.tsx`
- `src/lib/analytics.ts`

## `/dashboard/admin/settlements` — Admin settlement breakdown

Entry: `src/app/(app)/dashboard/admin/settlements/page.tsx`

Dependencies:

- `src/components/admin/PartnerServiceFeeBreakdown.tsx`
- `src/lib/service-fees.ts`
- `src/lib/settlement-actions.ts`
