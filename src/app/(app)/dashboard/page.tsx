import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/dal";
import { userCounts } from "@/lib/admin";
import { PlayerHome } from "@/components/dashboard/home/PlayerHome";
import { AdminHome } from "@/components/dashboard/home/AdminHome";
import { PartnerHome } from "@/components/dashboard/home/PartnerHome";

export const metadata: Metadata = {
  title: "Home — Sports 360",
};

export default async function DashboardHome() {
  const user = await getCurrentUser();
  // getCurrentUser redirects to /login when unauthenticated; this guards types.
  if (!user) return null;

  if (user.role === "ADMIN") {
    const counts = await userCounts();
    return <AdminHome name={user.name} counts={counts} />;
  }

  if (user.role === "PARTNER") {
    return <PartnerHome user={user} />;
  }

  return <PlayerHome user={user} />;
}
