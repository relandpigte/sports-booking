"use client";

import * as Ably from "ably";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import type {
  ConversationDetails,
  MessageConversationSummary,
  MessageView,
} from "@/lib/messages";

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatConversationTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) ===
    now.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    ...(sameDay
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" }),
  }).format(date);
}

export function MessagesWorkspace({
  viewerId,
  initialConversations,
  conversation,
  initialMessages,
  initialNextCursor,
  realtime,
}: {
  viewerId: string;
  initialConversations: MessageConversationSummary[];
  conversation: ConversationDetails;
  initialMessages: MessageView[];
  initialNextCursor: string | null;
  realtime: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const markedReadRef = useRef<string | null>(null);

  const refreshMessages = useCallback(async () => {
    const response = await fetch(
      `/api/messages/conversations/${conversation.id}/messages`,
      { cache: "no-store" }
    );
    if (!response.ok) return;
    const data = (await response.json()) as {
      messages: MessageView[];
      nextCursor: string | null;
    };
    setMessages(data.messages);
    setNextCursor(data.nextCursor);
    void fetch(`/api/messages/conversations/${conversation.id}/read`, {
      method: "POST",
    });
  }, [conversation.id]);

  const refreshConversations = useCallback(async () => {
    const response = await fetch("/api/messages/bootstrap", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as {
      conversations: MessageConversationSummary[];
    };
    setConversations(data.conversations);
  }, []);

  useEffect(() => {
    if (markedReadRef.current !== conversation.id) {
      markedReadRef.current = conversation.id;
      setConversations((current) =>
        current.map((item) =>
          item.id === conversation.id ? { ...item, unreadCount: 0 } : item
        )
      );
      void fetch(`/api/messages/conversations/${conversation.id}/read`, {
        method: "POST",
      });
    }
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.id]);

  useEffect(() => {
    const messageTimer = window.setInterval(
      refreshMessages,
      realtime ? 5 * 60_000 : 15_000
    );
    const listTimer = window.setInterval(
      refreshConversations,
      realtime ? 5 * 60_000 : 60_000
    );
    const onFocus = () => {
      void refreshMessages();
      void refreshConversations();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(messageTimer);
      window.clearInterval(listTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [realtime, refreshConversations, refreshMessages]);

  useEffect(() => {
    if (!realtime) return;
    const client = new Ably.Realtime({
      authUrl: "/api/messages/realtime/token",
      authMethod: "POST",
      clientId: viewerId,
    });
    const channel = client.channels.get(`messages:${conversation.id}`);
    const listener = () => {
      void refreshMessages();
      void refreshConversations();
    };
    void channel.subscribe(listener);
    return () => {
      channel.unsubscribe(listener);
      client.close();
    };
  }, [conversation.id, realtime, refreshConversations, refreshMessages, viewerId]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    const clientNonce = crypto.randomUUID().replaceAll("-", "");
    const response = await fetch(
      `/api/messages/conversations/${conversation.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed, clientNonce }),
      }
    );
    const data = (await response.json()) as { message?: MessageView; error?: string };
    if (!response.ok || !data.message) {
      setError(data.error ?? "Message could not be sent.");
      setSending(false);
      return;
    }
    setMessages((current) =>
      current.some((item) => item.id === data.message!.id)
        ? current
        : [...current, data.message!]
    );
    setBody("");
    setSending(false);
    setConversations((current) => {
      const updated = current.map((item) =>
        item.id === conversation.id
          ? {
              ...item,
              lastMessage: data.message!.body,
              lastMessageAt: data.message!.createdAt,
            }
          : item
      );
      return updated.sort((a, b) =>
        (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")
      );
    });
    window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
  }

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const response = await fetch(
      `/api/messages/conversations/${conversation.id}/messages?cursor=${encodeURIComponent(nextCursor)}`,
      { cache: "no-store" }
    );
    if (response.ok) {
      const data = (await response.json()) as {
        messages: MessageView[];
        nextCursor: string | null;
      };
      setMessages((current) => [...data.messages, ...current]);
      setNextCursor(data.nextCursor);
    }
    setLoadingOlder(false);
  }

  async function editMessage(message: MessageView) {
    const next = window.prompt("Edit message", message.body ?? "");
    if (next == null || next.trim() === message.body) return;
    const response = await fetch(`/api/messages/messages/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: next }),
    });
    if (!response.ok) return;
    await refreshMessages();
  }

  async function deleteMessage(message: MessageView) {
    if (!window.confirm("Delete this message?")) return;
    const response = await fetch(`/api/messages/messages/${message.id}`, {
      method: "DELETE",
    });
    if (response.ok) await refreshMessages();
  }

  async function reportMessage(message: MessageView) {
    const details = window.prompt(
      "Briefly tell us what is wrong with this message (optional).",
      ""
    );
    if (details == null) return;
    const response = await fetch("/api/messages/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: message.id,
        category: "OTHER",
        details,
      }),
    });
    setError(response.ok ? "Report sent to the moderation team." : "Report could not be sent.");
  }

  async function blockMember(targetUserId: string, blocked: boolean) {
    const response = await fetch("/api/messages/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        targetUserId,
        blocked,
      }),
    });
    if (response.ok) window.location.reload();
  }

  const otherPrivateMember =
    conversation.kind === "HUB_PLAYER" || conversation.kind === "TRAINER_SESSION"
      ? conversation.participants.find((member) => member.id !== viewerId)
      : null;

  return (
    <div
      data-dashboard-width="wide"
      className="overflow-hidden rounded-[20px] border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5 lg:grid lg:h-[calc(100dvh-5rem)] lg:min-h-[640px] lg:grid-cols-[268px_minmax(0,1fr)] xl:grid-cols-[268px_minmax(0,1fr)_260px]"
    >
      <aside className="hidden min-h-0 border-r border-[#dfe7e2] bg-white lg:flex lg:flex-col">
        <div className="flex min-h-[60px] items-center border-b border-[#dfe7e2] px-4">
          <h1 className="text-[15px] font-bold tracking-tight text-navy">
            Messages
          </h1>
        </div>
        <ConversationList conversations={conversations} activeId={conversation.id} />
      </aside>

      <section className="flex min-h-[calc(100dvh-7.5rem)] min-w-0 flex-col bg-white lg:min-h-0">
        <header className="border-b border-[#dfe7e2]">
          <div className="flex min-h-[60px] items-center gap-3 px-4 sm:px-6">
            {conversations.length > 1 && (
              <Link
                href="/dashboard/messages"
                aria-label="Back to conversations"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-navy transition-colors hover:bg-slate-50 lg:hidden"
              >
                ←
              </Link>
            )}
            <Avatar src={conversation.image} name={conversation.title} size={32} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold text-navy">
                {conversation.title}
              </h2>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">
                {conversation.subtitle}
              </p>
            </div>
            {otherPrivateMember && (
              <button
                type="button"
                disabled={conversation.blocked && !conversation.blockedByMe}
                onClick={() =>
                  void blockMember(
                    otherPrivateMember.id,
                    !conversation.blockedByMe
                  )
                }
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
              >
                {conversation.blockedByMe
                  ? "Unblock"
                  : conversation.blocked
                    ? "Blocked by member"
                    : "Block"}
              </button>
            )}
          </div>

          <div className="flex items-start gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:items-center sm:px-6 xl:hidden">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sm text-ocean ring-1 ring-slate-200/80"
              aria-hidden="true"
            >
              {conversation.kind === "EVENT" ? "🏆" : "📅"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-navy">
                {conversation.context.title}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500 sm:truncate">
                {conversation.context.schedule}
                <span aria-hidden="true"> · </span>
                {conversation.context.venue}
              </p>
              {conversation.context.note && (
                <p className="mt-0.5 hidden truncate text-[10px] text-slate-400 xl:block">
                  {conversation.context.note}
                </p>
              )}
            </div>
            <Link
              href={conversation.context.href}
              className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-navy transition-colors hover:border-ocean/30 hover:text-ocean"
            >
              <span className="hidden sm:inline">
                {conversation.context.hrefLabel}
              </span>
              <span className="sm:hidden">Details</span>
            </Link>
          </div>
        </header>

        {conversation.kind === "EVENT" && (
          <details className="border-b border-slate-100 bg-white px-4 py-2 text-xs text-slate-600 sm:px-5 xl:hidden">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-600 transition-colors hover:text-navy">
              {conversation.participants.length} participants
            </summary>
            <div className="mt-2 flex flex-wrap gap-2 pb-1">
              {conversation.participants.map((member) => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5"
                >
                  <Avatar src={member.image} name={member.name} size={22} />
                  {member.name}
                  {member.id === viewerId ? " (you)" : ""}
                  {member.id !== viewerId && (
                    <button
                      type="button"
                      onClick={() => void blockMember(member.id, !member.blockedByMe)}
                      className="font-semibold text-slate-400 hover:text-red-600"
                    >
                      {member.blockedByMe ? "Unblock" : "Block"}
                    </button>
                  )}
                </span>
              ))}
            </div>
          </details>
        )}

        <div
          className="messages-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-4 py-5 sm:px-6 sm:py-6"
          aria-live="polite"
        >
          <div className="flex w-full flex-1 flex-col">
            {nextCursor && (
              <div className="mb-4 text-center">
                <button
                  type="button"
                  disabled={loadingOlder}
                  onClick={() => void loadOlder()}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-primary/30 hover:text-navy"
                >
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </button>
              </div>
            )}
            {messages.length === 0 && (
              <div className="mx-auto mt-12 max-w-sm text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
                  💬
                </div>
                <h3 className="mt-4 font-bold text-navy">
                  Start the conversation
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Use this space only for this booking or event. Official
                  changes still happen on its details page.
                </p>
              </div>
            )}
            <div className="space-y-6">
              {messages.map((message) =>
                message.kind === "SYSTEM" ? (
                  <SystemMessage key={message.id} message={message} />
                ) : (
                  <UserMessage
                    key={message.id}
                    message={message}
                    onEdit={editMessage}
                    onDelete={deleteMessage}
                    onReport={reportMessage}
                    showSenderName={conversation.kind === "EVENT"}
                  />
                )
              )}
            </div>
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={sendMessage}
          className="border-t border-[#dfe7e2] bg-white px-3 py-3 sm:px-6 sm:py-4"
        >
          <div className="w-full">
            {error && (
              <p className="mb-2 text-xs font-medium text-amber-700">
                {error}
              </p>
            )}
            {conversation.restricted || conversation.blocked ? (
              <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                {conversation.blocked
                  ? "This conversation is blocked and is currently read-only."
                  : "Your account cannot send messages right now."}
              </p>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-[#dfe7e2] bg-slate-50 p-1.5 shadow-sm transition focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary-soft">
                <label className="sr-only" htmlFor="message-body">
                  Message
                </label>
                <textarea
                  id="message-body"
                  value={body}
                  maxLength={2000}
                  rows={1}
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Write a message…"
                  className="message-composer-input max-h-28 min-h-8 flex-1 resize-y border-0 bg-transparent px-2 py-1.5 text-[13px] text-navy placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !body.trim()}
                  aria-label={sending ? "Sending message" : "Send message"}
                  title={sending ? "Sending…" : "Send message"}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                >
                  <SendIcon />
                </button>
              </div>
            )}
            <p className="mt-1.5 text-center text-[10px] text-slate-400">
              {conversation.kind === "EVENT"
                ? "Visible only to confirmed participants in this event."
                : conversation.kind === "TRAINER_SESSION"
                  ? "Visible only to the player and trainer."
                  : "Visible only to you and this venue."}
            </p>
          </div>
        </form>
      </section>

      <ConversationContextRail
        conversation={conversation}
        viewerId={viewerId}
        onBlockMember={blockMember}
      />
    </div>
  );
}

export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: MessageConversationSummary[];
  activeId?: string;
}) {
  return (
    <nav
      className="messages-scrollbar min-h-0 flex-1 overflow-y-auto"
      aria-label="Conversations"
    >
      {conversations.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.id === activeId ? "page" : undefined}
          className={`relative flex h-[72px] items-center gap-3 border-b border-slate-100 px-4 transition-colors ${
            item.id === activeId ? "bg-primary-soft" : "hover:bg-slate-50"
          }`}
        >
          {item.id === activeId && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[3px] bg-primary"
            />
          )}
          <Avatar src={item.image} name={item.title} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-bold text-navy">
                {item.title}
              </p>
              {item.unreadCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {Math.min(item.unreadCount, 99)}
                </span>
              ) : (
                <span className="shrink-0 text-[10px] font-medium text-slate-400">
                  {formatConversationTime(item.lastMessageAt)}
                </span>
              )}
            </div>
            <p
              className={`truncate text-[11px] font-medium ${
                item.id === activeId ? "text-primary" : "text-slate-500"
              }`}
            >
              {item.subtitle}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {item.lastMessage ?? "No messages yet"}
            </p>
          </div>
        </Link>
      ))}
    </nav>
  );
}

function ConversationContextRail({
  conversation,
  viewerId,
  onBlockMember,
}: {
  conversation: ConversationDetails;
  viewerId: string;
  onBlockMember: (targetUserId: string, blocked: boolean) => Promise<void>;
}) {
  return (
    <aside className="hidden min-h-0 flex-col border-l border-[#dfe7e2] bg-[#fcfdfc] xl:flex">
      <div className="flex min-h-[60px] items-center border-b border-[#dfe7e2] px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
          {conversation.kind === "EVENT" ? "Event context" : "Booking context"}
        </p>
      </div>

      <div className="messages-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto p-5">
        <div>
          <div className="flex size-12 items-center justify-center rounded-xl bg-white text-ocean shadow-sm ring-1 ring-[#dfe7e2]">
            <ContextIcon kind={conversation.kind} />
          </div>

          <h3 className="mt-4 text-sm font-bold leading-5 text-navy">
            {conversation.context.title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {conversation.context.eyebrow}
          </p>
        </div>

        <dl className="space-y-4">
          <div className="flex items-start gap-3">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-slate-400"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <div>
              <dt className="text-[11px] font-bold text-navy">Schedule</dt>
              <dd className="mt-0.5 text-xs leading-5 text-slate-500">
                {conversation.context.schedule}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-slate-400"
              aria-hidden="true"
            >
              <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z" />
              <circle cx="12" cy="10" r="2" />
            </svg>
            <div>
              <dt className="text-[11px] font-bold text-navy">Venue</dt>
              <dd className="mt-0.5 text-xs leading-5 text-slate-500">
                {conversation.context.venue}
              </dd>
            </div>
          </div>
        </dl>

        {conversation.context.note && (
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Note
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              {conversation.context.note}
            </p>
          </div>
        )}

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Participants · {conversation.participants.length}
          </p>
          <div className="mt-3 space-y-2.5">
            {conversation.participants.map((member) => (
              <div key={member.id} className="flex min-w-0 items-center gap-2">
                <Avatar src={member.image} name={member.name} size={28} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600">
                  {member.name}
                  {member.id === viewerId ? " (you)" : ""}
                </span>
                {conversation.kind === "EVENT" && member.id !== viewerId && (
                  <button
                    type="button"
                    onClick={() =>
                      void onBlockMember(member.id, !member.blockedByMe)
                    }
                    className="text-[10px] font-semibold text-slate-400 hover:text-red-600"
                  >
                    {member.blockedByMe ? "Unblock" : "Block"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[#dfe7e2] p-4">
        <Link
          href={conversation.context.href}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#dfe7e2] bg-white px-3 text-xs font-bold text-navy transition-colors hover:border-ocean/30 hover:text-ocean"
        >
          {conversation.context.hrefLabel}
          <span aria-hidden="true" className="ml-1.5">
            →
          </span>
        </Link>
      </div>
    </aside>
  );
}

function ContextIcon({ kind }: { kind: ConversationDetails["kind"] }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "EVENT" ? (
        <>
          <path d="M6 4h12v3a6 6 0 0 1-12 0z" />
          <path d="M9 18h6M10 14v4M14 14v4M8 21h8" />
        </>
      ) : (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </>
      )}
    </svg>
  );
}

function SystemMessage({ message }: { message: MessageView }) {
  const content = (
    <div className="mx-auto flex max-w-lg flex-col items-center py-2 text-center">
      <div className="mb-3 h-px w-24 bg-slate-100" />
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {formatMessageTime(message.createdAt)}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        {message.body}
      </p>
    </div>
  );
  return message.targetPath ? (
    <Link href={message.targetPath} className="block rounded-xl hover:bg-slate-50">
      {content}
    </Link>
  ) : (
    content
  );
}

function UserMessage({
  message,
  onEdit,
  onDelete,
  onReport,
  showSenderName,
}: {
  message: MessageView;
  onEdit: (message: MessageView) => void;
  onDelete: (message: MessageView) => void;
  onReport: (message: MessageView) => void;
  showSenderName: boolean;
}) {
  return (
    <div
      className={`flex items-end gap-3 ${
        message.mine ? "justify-end" : "justify-start"
      }`}
    >
      {!message.mine && (
        <Avatar
          src={message.sender?.image}
          name={message.sender?.name}
          size={28}
        />
      )}
      <div
        className={`group flex max-w-[86%] flex-col sm:max-w-[80%] ${
          message.mine ? "items-end" : "items-start"
        }`}
      >
        {!message.mine && showSenderName && (
          <p className="mb-1 text-[11px] font-semibold text-navy">
            {message.sender?.name ?? "Deleted account"}
          </p>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 text-[13px] leading-[1.6] ${
            message.mine
              ? "rounded-br-sm bg-primary text-white shadow-sm shadow-primary/10"
              : "rounded-bl-sm border border-slate-100 bg-slate-50 text-navy"
          }`}
        >
          {message.deletedAt ? (
            <span className="italic opacity-65">Message deleted</span>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )}
        </div>
        <div
          className={`mt-1 flex items-center gap-2 text-[10px] text-slate-400 ${
            message.mine ? "justify-end" : "justify-start"
          }`}
        >
          <span>
            {formatMessageTime(message.createdAt)}
            {message.editedAt ? " · edited" : ""}
          </span>
          {!message.deletedAt && message.mine && (
            <>
              <button
                type="button"
                onClick={() => onEdit(message)}
                className="font-semibold hover:text-primary"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(message)}
                className="font-semibold hover:text-red-600"
              >
                Delete
              </button>
            </>
          )}
          {!message.deletedAt && !message.mine && (
            <button
              type="button"
              onClick={() => onReport(message)}
              className="font-semibold hover:text-red-600"
            >
              Report
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
