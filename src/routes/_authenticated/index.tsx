import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "@/components/chat/chat-view";

export const Route = createFileRoute("/_authenticated/")({
  component: () => <ChatView conversationId={null} />,
});