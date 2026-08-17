import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ConversationList,
  MessagesWorkspace,
} from "@/components/messages/MessagesWorkspace";
import { loadMessagesWorkspace } from "@/lib/messages";
import { messagesRealtimeConfigured } from "@/lib/messages-realtime";

export const metadata: Metadata = { title: "Messages — Bunal.club" };

export default async function MessagesPage() {
  const result = await loadMessagesWorkspace();
  if (!result) redirect("/dashboard");
  const partnerView = result.viewer.role === "PARTNER";
  if (result.conversation && result.messages) {
    return (
      <MessagesWorkspace
        viewerId={result.viewer.actorId}
        initialConversations={result.conversations}
        conversation={result.conversation}
        initialMessages={result.messages.messages}
        initialNextCursor={result.messages.nextCursor}
        realtime={messagesRealtimeConfigured()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Booking-scoped</p>
        <h1 className="mt-1 text-3xl font-bold text-navy">Messages</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {partnerView
            ? "Private venue conversations and event discussions appear when players have active confirmed bookings or registrations."
            : "Event discussions and private venue conversations appear while your confirmed booking or registration is active."}
        </p>
      </div>
      {result.conversations.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ConversationList conversations={result.conversations} />
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-3xl">💬</div>
          <h2 className="mt-5 text-xl font-bold text-navy">
            No active conversations yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            {partnerView
              ? "When a player has an active confirmed court booking—or joins one of your events—the conversation will appear here."
              : "Confirmed court bookings create a private venue conversation. Confirmed event registrations add you to that event’s group discussion."}
          </p>
          {!partnerView && (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/hubs" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Find a court</Link>
              <Link href="/events" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-navy hover:bg-slate-50">Browse events</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
