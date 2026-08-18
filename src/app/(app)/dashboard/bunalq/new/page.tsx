import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { QuickQueueForm } from "@/components/open-play/QuickQueueForm";
import { getOpenPlayWorkspace, listBunalQHubs } from "@/lib/open-play";

export const metadata: Metadata = { title: "Start Quick Queue — Bunal.club" };

export default async function NewQuickQueuePage() {
  const workspace = await getOpenPlayWorkspace("MANAGE");
  if (!workspace) redirect("/dashboard/partner?access=denied");
  const hubs = await listBunalQHubs(workspace.partnerId);
  return <div className="mx-auto w-full max-w-3xl"><Link href="/dashboard/bunalq" className="text-sm font-bold text-primary">← BunalQ</Link><header className="my-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Start now</p><h1 className="mt-1 text-3xl font-black text-navy">New Quick Queue</h1><p className="mt-2 text-sm text-slate-500">No Event, booking slot, registration, or payment is created.</p></header>{hubs.length > 0 ? <QuickQueueForm hubs={hubs} /> : <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Add a hub and court before starting a Quick Queue.</p>}</div>;
}
