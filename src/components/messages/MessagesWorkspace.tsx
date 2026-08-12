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
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-navy/5 lg:grid lg:h-[calc(100vh-5rem)] lg:min-h-[640px] lg:grid-cols-[310px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-r border-slate-200 bg-slate-50/70 lg:flex lg:flex-col">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Booking-scoped</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Messages</h1>
        </div>
        <ConversationList conversations={conversations} activeId={conversation.id} />
      </aside>

      <section className="flex min-h-[70vh] min-w-0 flex-col lg:min-h-0">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          {conversations.length > 1 && (
            <Link
              href="/dashboard/messages"
              aria-label="Back to conversations"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-navy lg:hidden"
            >
              ←
            </Link>
          )}
          <Avatar src={conversation.image} name={conversation.title} size={42} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-bold text-navy">{conversation.title}</h2>
            <p className="truncate text-xs text-slate-500">{conversation.subtitle}</p>
          </div>
          {otherPrivateMember && (
            <button
              type="button"
              disabled={conversation.blocked && !conversation.blockedByMe}
              onClick={() => void blockMember(otherPrivateMember.id, !conversation.blockedByMe)}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-navy disabled:cursor-not-allowed disabled:opacity-50"
            >
              {conversation.blockedByMe
                ? "Unblock"
                : conversation.blocked
                  ? "Blocked by member"
                  : "Block"}
            </button>
          )}
        </header>

        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="flex items-start gap-3 rounded-2xl border border-ocean/15 bg-ocean-soft/70 px-4 py-3">
            <div
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-ocean shadow-sm"
              aria-hidden="true"
            >
              {conversation.kind === "EVENT" ? "🏆" : "📅"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ocean">
                {conversation.context.eyebrow}
              </p>
              <p className="mt-0.5 text-sm font-bold leading-5 text-navy">
                {conversation.context.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {conversation.context.schedule}
                <span aria-hidden="true"> · </span>
                {conversation.context.venue}
              </p>
              {conversation.context.note && (
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  {conversation.context.note}
                </p>
              )}
            </div>
            <Link
              href={conversation.context.href}
              className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-bold text-ocean shadow-sm transition-colors hover:text-navy"
            >
              <span className="hidden sm:inline">
                {conversation.context.hrefLabel}
              </span>
              <span className="sm:hidden">Details</span>
            </Link>
          </div>
        </div>

        {conversation.kind === "EVENT" && (
          <details className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-600 sm:px-5">
            <summary className="cursor-pointer font-semibold text-navy">
              {conversation.participants.length} participants
            </summary>
            <div className="mt-3 flex flex-wrap gap-2 pb-1">
              {conversation.participants.map((member) => (
                <span key={member.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-sm">
                  <Avatar src={member.image} name={member.name} size={22} />
                  {member.name}{member.id === viewerId ? " (you)" : ""}
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

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7faf8] px-4 py-5 sm:px-6" aria-live="polite">
          {nextCursor && (
            <div className="mb-5 text-center">
              <button
                type="button"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:border-primary/30"
              >
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          )}
          {messages.length === 0 && (
            <div className="mx-auto mt-16 max-w-sm text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-2xl">💬</div>
              <h3 className="mt-4 font-bold text-navy">Start the conversation</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Use this space only for this booking or event. Official changes still happen on its details page.</p>
            </div>
          )}
          <div className="space-y-3">
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

        <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-3 sm:p-4">
          {error && <p className="mb-2 text-xs font-medium text-amber-700">{error}</p>}
          {conversation.restricted || conversation.blocked ? (
            <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
              {conversation.blocked
                ? "This conversation is blocked and is currently read-only."
                : "Your account cannot send messages right now."}
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="message-body">Message</label>
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
                className="max-h-32 min-h-11 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-navy placeholder:text-slate-400 focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !body.trim()}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          )}
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
    <nav className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto" aria-label="Conversations">
      {conversations.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.id === activeId ? "page" : undefined}
          className={`flex gap-3 px-4 py-4 transition-colors ${
            item.id === activeId ? "bg-primary-soft" : "hover:bg-white"
          }`}
        >
          <Avatar src={item.image} name={item.title} size={42} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-bold text-navy">{item.title}</p>
              {item.unreadCount > 0 && (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {Math.min(item.unreadCount, 99)}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{item.subtitle}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{item.lastMessage ?? "No messages yet"}</p>
          </div>
        </Link>
      ))}
    </nav>
  );
}

function SystemMessage({ message }: { message: MessageView }) {
  const content = (
    <div className="mx-auto max-w-xl rounded-xl border border-ocean/15 bg-ocean-soft px-4 py-2.5 text-center text-xs leading-5 text-navy">
      <p>{message.body}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">{formatMessageTime(message.createdAt)}</p>
    </div>
  );
  return message.targetPath ? <Link href={message.targetPath}>{content}</Link> : content;
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
    <div className={`flex gap-2 ${message.mine ? "justify-end" : "justify-start"}`}>
      {!message.mine && <Avatar src={message.sender?.image} name={message.sender?.name} size={30} />}
      <div className={`group max-w-[82%] sm:max-w-[70%] ${message.mine ? "items-end" : "items-start"}`}>
        {!message.mine && <p className="mb-1 text-[11px] font-semibold text-slate-500">{message.sender?.name ?? "Deleted account"}</p>}
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-6 ${
          message.mine ? "rounded-br-md bg-primary text-white" : "rounded-bl-md bg-white text-navy shadow-sm"
        }`}>
          {message.deletedAt ? <span className="italic opacity-65">Message deleted</span> : <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        </div>
        <div className={`mt-1 flex items-center gap-2 text-[10px] text-slate-400 ${message.mine ? "justify-end" : "justify-start"}`}>
          <span>{formatMessageTime(message.createdAt)}{message.editedAt ? " · edited" : ""}</span>
          {!message.deletedAt && message.mine && (
            <>
              <button type="button" onClick={() => onEdit(message)} className="font-semibold hover:text-primary">Edit</button>
              <button type="button" onClick={() => onDelete(message)} className="font-semibold hover:text-red-600">Delete</button>
            </>
          )}
          {!message.deletedAt && !message.mine && (
            <button type="button" onClick={() => onReport(message)} className="font-semibold hover:text-red-600">Report</button>
          )}
        </div>
      </div>
    </div>
  );
}
