import type { Metadata } from "next";

import { HomePage } from "@/components/home/HomePage";

export const metadata: Metadata = {
  title: "Bunal.club — Book courts across Bohol",
  description:
    "Find volleyball, badminton, pickleball, and other courts across Bohol. Choose your hours, pay securely with PayMongo, and get confirmed in seconds.",
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return <HomePage />;
}
