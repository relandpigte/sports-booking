import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MessagesWorkspace } from "@/components/messages/MessagesWorkspace";
import { loadMessagesWorkspace } from "@/lib/messages";
import { messagesRealtimeConfigured } from "@/lib/messages-realtime";

export const metadata: Metadata = { title: "Messages — Bunal.club" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await loadMessagesWorkspace(id);
  if (!workspace) redirect("/dashboard");
  if (!workspace.conversation || !workspace.messages) notFound();

  return (
    <MessagesWorkspace
      viewerId={workspace.viewer.id}
      initialConversations={workspace.conversations}
      conversation={workspace.conversation}
      initialMessages={workspace.messages.messages}
      initialNextCursor={workspace.messages.nextCursor}
      realtime={messagesRealtimeConfigured()}
    />
  );
}
