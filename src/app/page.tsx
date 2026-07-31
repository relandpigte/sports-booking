import type { Metadata } from "next";

import { HomePage } from "@/components/home/HomePage";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Bunal.club — Book courts across Bohol",
  description:
    "Find volleyball, badminton, pickleball, and other courts across Bohol. Choose your hours, pay securely with PayMongo, and get confirmed in seconds.",
  alternates: {
    canonical: "/",
  },
};

export default async function Home() {
  const session = await auth();

  return <HomePage isLoggedIn={Boolean(session?.user?.id)} />;
}
