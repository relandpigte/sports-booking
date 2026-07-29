import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL("https://bunal.ph"),
  title: {
    default: "Bunal.ph — Play. Compete. Connect.",
    // Every page already sets its own "X — Bunal.ph", so no template here.
    template: "%s",
  },
  description:
    "Book volleyball, badminton and pickleball courts across Bohol. Find a hub, pick your hours, and pay the venue directly.",
  openGraph: {
    title: "Bunal.ph — Play. Compete. Connect.",
    description:
      "Book volleyball, badminton and pickleball courts across Bohol.",
    url: "https://bunal.ph",
    siteName: "Bunal.ph",
    images: ["/bunal-logo.png"],
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
