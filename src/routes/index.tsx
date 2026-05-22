import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, LogIn, MessageSquarePlus, Settings, LogOut, User as UserIcon, Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { ChatView } from "@/components/chat/chat-view";
import { AnonChatView } from "@/components/chat/anon-chat-view";
import { NousxLogo } from "@/components/nousx-logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent } from "@/components/ui/sheet";

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

  return <AnonShell />;
}

const FREE_LIMIT = 10;

function AnonShell() {
  const navigate = useNavigate();
  const [usage, setUsage] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = localStorage.getItem("auraia_anon_usage_v1");
      return raw ? (JSON.parse(raw)?.count ?? 0) : 0;
    } catch {
      return 0;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="h-full flex flex-col p-4 gap-4">
      <Link to="/" className="px-2">
        <NousxLogo className="text-2xl" />
      </Link>
      <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
        <div className="text-xs text-muted-foreground">Uso gratuito</div>
        <div className="text-sm font-medium">
          {usage} de {FREE_LIMIT} mensagens
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.min(100, (usage / FREE_LIMIT) * 100)}%`,
              background: "#6C47FF",
            }}
          />
        </div>
      </div>
      <Button
        className="w-full font-medium"
        style={{ background: "#6C47FF" }}
        onClick={() => navigate({ to: "/auth" })}
      >
        <MessageSquarePlus className="size-4 mr-1" />
        Criar conta grátis — ganhe 5 créditos
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => navigate({ to: "/auth" })}
      >
        <LogIn className="size-4 mr-1" />
        Fazer login
      </Button>
      <div className="flex-1" />
      <div className="text-[11px] text-muted-foreground text-center space-x-2">
        <Link to="/termos" className="hover:text-foreground">Termos</Link>
        <span>·</span>
        <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-sidebar">
        {sidebar}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar border-border">
          {sidebar}
        </SheetContent>
      </Sheet>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-2 px-3 md:px-4 border-b border-border bg-background/80 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>
          <Link to="/" className="md:hidden">
            <NousxLogo className="text-lg" />
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/auth" })}
          >
            <LogIn className="size-4 mr-1" />
            Entrar
          </Button>
        </header>
        <main className="flex-1 min-h-0 overflow-hidden">
          <AnonChatView onUsageChange={setUsage} />
        </main>
        {/* unused icons to avoid TS warning */}
        <span className="hidden">
          <Settings />
          <LogOut />
          <UserIcon />
        </span>
      </div>
    </div>
  );
}