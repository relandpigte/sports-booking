# Route map

Framework: Next.js 16 App Router. Authenticated routes are grouped under
`src/app/(app)` and protected by the shared authenticated layout/proxy.

| URL | Page file | Layout / purpose |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | New public marketing homepage |
| `/hubs` | `src/app/hubs/page.tsx` | Public searchable court directory |
| `/hubs/[id]` | `src/app/hubs/[id]/page.tsx` | Venue profile, live availability, booking |
| `/login` | `src/app/login/page.tsx` | AuthLayout login |
| `/register` | `src/app/register/page.tsx` | Player registration |
| `/register/partner` | `src/app/register/partner/page.tsx` | Partner application |
| `/terms` | `src/app/terms/page.tsx` | LegalLayout |
| `/privacy` | `src/app/privacy/page.tsx` | LegalLayout |
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | Role-aware dashboard |
| `/dashboard/bookings` | `src/app/(app)/dashboard/bookings/page.tsx` | Player/partner booking management |
| `/dashboard/bookings/pay/[paymentId]` | `src/app/(app)/dashboard/bookings/pay/[paymentId]/page.tsx` | PayMongo booking checkout |
| `/dashboard/hubs` | `src/app/(app)/dashboard/hubs/page.tsx` | Partner venue management |
| `/dashboard/hubs/new` | `src/app/(app)/dashboard/hubs/new/page.tsx` | Create venue |
| `/dashboard/hubs/[id]/edit` | `src/app/(app)/dashboard/hubs/[id]/edit/page.tsx` | Edit venue |
| `/dashboard/hubs/[id]/bookings` | `src/app/(app)/dashboard/hubs/[id]/bookings/page.tsx` | Venue booking operations |
| `/dashboard/payments` | `src/app/(app)/dashboard/payments/page.tsx` | Partner PayMongo and settlements |
| `/dashboard/reports` | `src/app/(app)/dashboard/reports/page.tsx` | Partner reporting |
| `/dashboard/account` | `src/app/(app)/dashboard/account/page.tsx` | Account/profile settings |
| `/dashboard/admin` | `src/app/(app)/dashboard/admin/page.tsx` | Admin overview |
| `/dashboard/admin/payments` | `src/app/(app)/dashboard/admin/payments/page.tsx` | Platform PayMongo connection |
| `/dashboard/admin/settlements` | `src/app/(app)/dashboard/admin/settlements/page.tsx` | Settlement breakdown/review |
| `/dashboard/admin/reports` | `src/app/(app)/dashboard/admin/reports/page.tsx` | Owner/admin reporting |
| `/users` | `src/app/(app)/users/page.tsx` | Admin user and partner approvals |
| `/users/new` | `src/app/(app)/users/new/page.tsx` | Admin create user |
| `/users/[id]/edit` | `src/app/(app)/users/[id]/edit/page.tsx` | Admin edit user |
