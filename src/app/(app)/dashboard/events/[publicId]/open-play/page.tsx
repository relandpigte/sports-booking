import { redirect } from "next/navigation";

export default async function LegacyEventOpenPlayPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  redirect(`/dashboard/events/${publicId}/bunalq`);
}
