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
    conversation.kind === "HUB_PLAYER"
      ? conversation.participants.find((member) => member.id !== viewerId)
      : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-navy/5 lg:grid lg:h-[clamp(600px,calc(100vh-5rem),740px)] lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[328px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-slate-100 px-5 py-[18px] xl:px-6">
          <h1 className="text-lg font-bold tracking-tight text-navy">Messages</h1>
          <p className="mt-1 text-xs text-slate-500">
            Booking-scoped conversations
          </p>
        </div>
        <ConversationList conversations={conversations} activeId={conversation.id} />
      </aside>

      <section className="flex min-h-[calc(100dvh-7.5rem)] min-w-0 flex-col bg-white lg:min-h-0">
        <header className="border-b border-slate-100">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
            {conversations.length > 1 && (
              <Link
                href="/dashboard/messages"
                aria-label="Back to conversations"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-navy transition-colors hover:bg-slate-50 lg:hidden"
              >
                ←
              </Link>
            )}
            <Avatar src={conversation.image} name={conversation.title} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate font-bold text-navy">
                  {conversation.title}
                </h2>
                <span className="hidden shrink-0 rounded-md bg-ocean-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ocean sm:inline-flex">
                  {conversation.kind === "EVENT" ? "Event" : "Venue"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">
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
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
              >
                {conversation.blockedByMe
                  ? "Unblock"
                  : conversation.blocked
                    ? "Blocked by member"
                    : "Block"}
              </button>
            )}
          </div>

          <div className="flex items-start gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:items-center sm:px-5">
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
          <details className="border-b border-slate-100 bg-white px-4 py-2 text-xs text-slate-600 sm:px-5">
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
          className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white px-4 py-6 sm:px-6 sm:py-7"
          aria-live="polite"
        >
          <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col">
            {nextCursor && (
              <div className="mb-6 text-center">
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
            <div className="mt-auto space-y-5">
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
                  />
                )
              )}
            </div>
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={sendMessage}
          className="border-t border-slate-100 bg-white px-3 py-3 sm:px-6 sm:py-4"
        >
          <div className="mx-auto w-full max-w-[720px]">
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
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-soft">
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
                  className="max-h-32 min-h-10 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm text-navy placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !body.trim()}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:px-5 sm:text-sm"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            )}
            <p className="mt-2 text-center text-[10px] text-slate-400">
              {conversation.kind === "EVENT"
                ? "Visible only to confirmed participants in this event."
                : "Visible only to you and this venue."}
            </p>
          </div>
        </form>
      </section>
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
      className="min-h-0 flex-1 overflow-y-auto"
      aria-label="Conversations"
    >
      {conversations.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.id === activeId ? "page" : undefined}
          className={`relative flex gap-3 border-b border-slate-100 px-5 py-4 transition-colors xl:px-6 ${
            item.id === activeId ? "bg-primary-soft" : "hover:bg-slate-50"
          }`}
        >
          {item.id === activeId && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[3px] bg-primary"
            />
          )}
          <Avatar src={item.image} name={item.title} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold text-navy">{item.title}</p>
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
              className={`mt-0.5 truncate text-xs font-medium ${
                item.id === activeId ? "text-primary" : "text-slate-500"
              }`}
            >
              {item.subtitle}
            </p>
            <p className="mt-1 truncate text-xs text-slate-400">
              {item.lastMessage ?? "No messages yet"}
            </p>
          </div>
        </Link>
      ))}
    </nav>
  );
}

function SystemMessage({ message }: { message: MessageView }) {
  const content = (
    <div className="mx-auto flex max-w-md flex-col items-center py-1 text-center">
      <div className="mb-2 h-px w-12 bg-slate-100" />
      <p className="text-[11px] font-medium leading-5 text-slate-500">
        {message.body}
      </p>
      <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-300">
        {formatMessageTime(message.createdAt)}
      </p>
      <div className="mt-2 h-px w-12 bg-slate-100" />
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
}: {
  message: MessageView;
  onEdit: (message: MessageView) => void;
  onDelete: (message: MessageView) => void;
  onReport: (message: MessageView) => void;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 ${
        message.mine ? "justify-end" : "justify-start"
      }`}
    >
      {!message.mine && (
        <Avatar
          src={message.sender?.image}
          name={message.sender?.name}
          size={34}
        />
      )}
      <div
        className={`group flex max-w-[86%] flex-col sm:max-w-[72%] ${
          message.mine ? "items-end" : "items-start"
        }`}
      >
        {!message.mine && (
          <p className="mb-1 text-[11px] font-semibold text-navy">
            {message.sender?.name ?? "Deleted account"}
          </p>
        )}
        <div
          className={`rounded-2xl border px-4 py-2.5 text-sm leading-6 ${
            message.mine
              ? "rounded-br-md border-primary bg-primary text-white shadow-sm shadow-primary/10"
              : "rounded-bl-md border-slate-100 bg-slate-50/80 text-navy"
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
