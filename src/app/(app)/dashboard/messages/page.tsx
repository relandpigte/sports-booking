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
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            Booking-scoped
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-navy">
            Messages
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
            {partnerView
              ? "Keep player questions and event updates organized beside the booking that started them."
              : "Keep venue questions and event updates organized beside the booking that started them."}
          </p>
        </div>
        {result.conversations.length > 0 && (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#dfe7e2] bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm shadow-navy/5">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            {result.conversations.length}{" "}
            {result.conversations.length === 1 ? "conversation" : "conversations"}
          </div>
        )}
      </div>
      {result.conversations.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5 lg:grid lg:min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-h-0 border-slate-200 lg:border-r">
            <div className="hidden border-b border-slate-100 px-4 py-3.5 lg:block">
              <h2 className="text-sm font-bold text-navy">Conversations</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Players and event participants
              </p>
            </div>
            <ConversationList conversations={result.conversations} />
          </aside>

          <div className="hidden items-center justify-center bg-[#fcfdfc] px-8 text-center lg:flex">
            <div className="max-w-sm">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary ring-1 ring-primary/10">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                  <path d="M8 9h8M8 13h5" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-bold text-navy">
                Select a conversation
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Open a player or event thread to review its messages and the
                related booking details together.
              </p>
              <p className="mt-4 text-[11px] font-medium text-slate-400">
                Only confirmed participants can access each conversation.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm shadow-navy/5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
            💬
          </div>
          <h2 className="mt-4 text-lg font-bold text-navy">
            No active conversations yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-slate-500">
            {partnerView
              ? "Private venue conversations and event discussions appear when players have active confirmed bookings or registrations."
              : "Confirmed court bookings create a private venue conversation. Confirmed event registrations add you to that event’s group discussion."}
          </p>
          {!partnerView && (
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/hubs"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover"
              >
                Find a court
              </Link>
              <Link
                href="/events"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-navy hover:bg-slate-50"
              >
                Browse events
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
