import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { ChatView } from "@/components/chat/chat-view";
import { AnonChatView } from "@/components/chat/anon-chat-view";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AuraIA — IA livre, sem julgamentos" },
      {
        name: "description",
        content:
          "Converse com a AuraIA sem cadastro. 10 mensagens grátis. Crie uma conta e ganhe 5 créditos para gerar imagens no Estúdio.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, loading } = useAuth();

  // Ao logar, limpa qualquer histórico anônimo (não migra).
  useEffect(() => {
    if (user && typeof window !== "undefined") {
      try {
        localStorage.removeItem("auraia_anon_chat_v1");
        localStorage.removeItem("auraia_anon_usage_v1");
      } catch {
        /* ignore */
      }
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    return (
      <AppLayout>
        <ChatView conversationId={null} />
      </AppLayout>
    );
  }

  return <AnonChatView />;
}
