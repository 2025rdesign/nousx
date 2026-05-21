import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "@/components/chat/chat-view";

export const Route = createFileRoute("/_authenticated/c/$conversationId")({
  component: ChatRoute,
});

function ChatRoute() {
  const { conversationId } = Route.useParams();
  return <ChatView key={conversationId} conversationId={conversationId} />;
}