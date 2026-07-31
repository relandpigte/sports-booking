# Shared layouts

## `src/app/layout.tsx` — Root layout

Loads Geist, global styles, metadata, Vercel Analytics, and Speed Insights.

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bunal.club"),
  title: {
    default: "Bunal.club — Play. Compete. Connect.",
    template: "%s",
  },
  description:
    "Book volleyball, badminton and pickleball courts across Bohol. Find a hub, pick your hours, and pay the venue directly.",
  openGraph: {
    title: "Bunal.club — Play. Compete. Connect.",
    description:
      "Book volleyball, badminton and pickleball courts across Bohol.",
    url: "https://bunal.club",
    siteName: "Bunal.club",
    images: ["/bunal-logo-transparent.png"],
    locale: "en_PH",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

## `src/components/hubs/PublicTopBar.tsx` — Public top bar

Sticky signed-out navigation shared by public hub pages.

```tsx
import Link from "next/link";
import { Logo } from "@/components/Logo";

export function PublicTopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Bunal.club home">
          <Logo />
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/hubs"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-navy sm:block"
          >
            Browse hubs
          </Link>
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-navy"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
```

## `src/components/PageShell.tsx` — Public/authenticated shell switch

Public routes use the public top bar for guests and the dashboard shell for
authenticated users.

```tsx
import type { ReactNode } from "react";

import { PublicTopBar } from "@/components/hubs/PublicTopBar";
import { AppShell } from "@/components/dashboard/AppShell";
import { getViewer } from "@/lib/dal";

export async function PageShell({
  children,
  maxWidth = "max-w-5xl",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  const viewer = await getViewer();

  if (viewer) {
    return (
      <AppShell user={viewer} maxWidth={maxWidth}>
        {children}
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicTopBar />
      <main className={`mx-auto w-full ${maxWidth} px-4 pb-16 sm:px-6`}>
        {children}
      </main>
    </div>
  );
}
```

## `src/components/AuthLayout.tsx` — Authentication layout

Responsive navy brand panel paired with the login or registration form.

```tsx
import type { ReactNode } from "react";
import Link from "next/link";

import { Logo } from "@/components/Logo";

const SPORTS = ["Volleyball", "Badminton", "Pickleball"];

export function AuthLayout({
  title,
  subtitle,
  children,
  width = "max-w-md",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  width?: string;
}) {
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative overflow-hidden bg-navy px-6 py-8 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[46%] lg:max-w-xl lg:flex-col lg:justify-between lg:px-12 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-accent/15 blur-3xl"
        />

        <div className="relative">
          <Link href="/" aria-label="Bunal.club home">
            <Logo />
          </Link>

          <div className="mt-10 hidden lg:block">
            <h2 className="text-3xl font-extrabold leading-tight text-white">
              Bohol&apos;s courts,
              <br />
              <span className="text-accent">booked in seconds.</span>
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
              Find a hub near you, pick the hours you want, and pay the venue
              directly.
            </p>

            <ul className="mt-8 flex flex-wrap gap-2">
              {SPORTS.map((sport) => (
                <li
                  key={sport}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80"
                >
                  {sport}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="relative mt-10 hidden text-xs uppercase tracking-[0.2em] text-white/40 lg:block">
          Play · Compete · Connect
        </p>
      </div>

      <div className="flex flex-1 justify-center px-4 py-10 sm:px-8 lg:items-center lg:py-14">
        <div className={`w-full ${width}`}>
          <h1 className="text-2xl font-bold text-navy sm:text-3xl">{title}</h1>
          <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
```
