import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Settings,
  Wand2,
  Image as ImageIcon,
  Compass,
  Menu,
  PanelLeft,
  LogIn,
  ArrowRight,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NousxLogo } from "@/components/nousx-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatInput } from "./chat-input";
import { EmptyState } from "./empty-state";
import { MessageItem, TypingIndicator, type ChatMsg } from "./message-item";
import { CodeCanvasProvider } from "./code-canvas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";

const STORAGE_KEY = "auraia_anon_chat_v1";
const MSG_LIMIT = 5;

const IMAGE_INTENT_RE =
  /\b(ger(?:a|e|ar)|cri(?:a|e|ar)|fa[zç](?:a|er)|desenh(?:a|e|ar)|pint(?:a|e|ar)|me\s+(?:d[áa]|d[êe]|manda|envia)|quero|gostaria(?:\s+de)?|preciso(?:\s+de)?|generate|create|make|draw|render|produce|design|build|illustrate)\b[^\n]{0,30}\b(image(?:m|ns|s)?|fotos?|photos?|pictures?|ilustra[cç](?:[ãa]o|[õo]es)|illustrations?|desenhos?|figuras?|artes?|artworks?|pinturas?|wallpapers?|retratos?|portraits?|p[ôo]ster(?:es)?|posters?|banners?|capas?|covers?|vetor(?:es|ial|iais)?|logos?|logotipos?|[íi]cones?|icons?|stickers?|emojis?|avatares?|avatars?|personagens?|characters?|cenas?|scenes?|gifs?|thumbnails?|miniaturas?)\b/i;

const ANON_IMAGE_PLAN_REQUIRED =
  "Para gerar imagens no chat você precisa de uma conta com plano **Plus** ou **Ultra** ativo. " +
  "Crie sua conta gratuitamente e escolha um plano para começar a criar!\n\n[Ver planos](/planos)";

interface AnonState {
  messages: ChatMsg[];
  userMessageCount: number;
  title: string | null;
  updatedAt: number;
}

function loadState(): AnonState {
  if (typeof window === "undefined")
    return { messages: [], userMessageCount: 0, title: null, updatedAt: Date.now() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messages: [], userMessageCount: 0, title: null, updatedAt: Date.now() };
    const v = JSON.parse(raw) as AnonState;
    return {
      messages: Array.isArray(v?.messages) ? v.messages : [],
      userMessageCount: Number(v?.userMessageCount) || 0,
      title: v?.title ?? null,
      updatedAt: Number(v?.updatedAt) || Date.now(),
    };
  } catch {
    return { messages: [], userMessageCount: 0, title: null, updatedAt: Date.now() };
  }
}

function saveState(s: AnonState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function AnonChatView() {
  const navigate = useNavigate();
  const [state, setState] = useState<AnonState>(() => loadState());
  const [streaming, setStreaming] = useState<ChatMsg | null>(null);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [sending, setSending] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [fillText, setFillText] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = state.messages;
  const hasContent = messages.length > 0 || streaming || awaitingReply;
  const limitReached = state.userMessageCount >= MSG_LIMIT;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  function openGate() {
    setGateOpen(true);
  }

  function openLimit() {
    setLimitOpen(true);
  }

  function handleNewChat() {
    if (state.messages.length === 0) {
      setMobileOpen(false);
      return;
    }
    openGate();
  }

  function handleRestrictedNav() {
    openGate();
  }

  function handleInputRestricted() {
    notify.error(
      "Funcionalidade disponível para usuários cadastrados. Crie sua conta grátis!",
    );
  }

  async function handleSend(text: string) {
    if (!text.trim() || sending) return;
    if (limitReached) {
      openLimit();
      return;
    }

    // Pre-gate image-generation intent for anonymous users — never
    // call DeepSeek with image asks; show plan-required bubble instead.
    const trimmed = text.trim();
    const isImageAsk =
      trimmed.length <= 800 &&
      !trimmed.endsWith("?") &&
      IMAGE_INTENT_RE.test(trimmed);
    if (isImageAsk) {
      const userMsg: ChatMsg = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
      };
      const planMsg: ChatMsg = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: ANON_IMAGE_PLAN_REQUIRED,
      };
      const nextMessages = [...messages, userMsg, planMsg];
      const nextCount = state.userMessageCount + 1;
      const finalState: AnonState = {
        messages: nextMessages,
        userMessageCount: nextCount,
        title: state.title ?? text.slice(0, 40),
        updatedAt: Date.now(),
      };
      setState(finalState);
      saveState(finalState);
      return;
    }

    setSending(true);
    setAwaitingReply(true);

    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const nextMessages = [...messages, userMsg];
    const nextCount = state.userMessageCount + 1;
    const nextTitle = state.title ?? text.slice(0, 40);
    const intermediate: AnonState = {
      messages: nextMessages,
      userMessageCount: nextCount,
      title: nextTitle,
      updatedAt: Date.now(),
    };
    setState(intermediate);
    saveState(intermediate);

    try {
      const history = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await fetch("/api/public/chat-anon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error("Falha ao responder.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accum = "";
      let buf = "";
      let started = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              accum += delta;
              if (!started) {
                started = true;
                flushSync(() => setAwaitingReply(false));
              }
              flushSync(() => {
                setStreaming({
                  id: "stream",
                  role: "assistant",
                  content: accum,
                  streaming: true,
                });
              });
            }
          } catch {
            /* ignore */
          }
        }
      }

      const finalMsg: ChatMsg = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: accum || "Desculpe, não consegui responder agora.",
      };
      const finalMessages = [...nextMessages, finalMsg];
      const finalState: AnonState = {
        messages: finalMessages,
        userMessageCount: nextCount,
        title: nextTitle,
        updatedAt: Date.now(),
      };
      setState(finalState);
      saveState(finalState);
      setStreaming(null);

      if (nextCount >= MSG_LIMIT) {
        setTimeout(() => openLimit(), 400);
      }
    } catch (err) {
      console.error(err);
      const errMsg: ChatMsg = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Algo deu errado. Tente novamente.",
      };
      const errState: AnonState = {
        ...intermediate,
        messages: [...nextMessages, errMsg],
      };
      setState(errState);
      saveState(errState);
      setStreaming(null);
    } finally {
      setAwaitingReply(false);
      setSending(false);
    }
  }

  const navItems = useMemo(
    () => [
      { label: "Estúdio", icon: Wand2 },
      { label: "Galeria", icon: ImageIcon },
      { label: "Planos", icon: CreditCard },
    ],
    [],
  );

  const sidebar = (
    <div className="flex flex-col h-full w-full bg-sidebar">
      <div className="p-3 border-b border-border">
        <Link to="/" className="flex items-center justify-center py-2">
          <NousxLogo className="text-xl" />
        </Link>
      </div>

      <div className="p-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={handleNewChat}
        >
          <Plus className="size-4" />
          Nova conversa
        </Button>
      </div>

      <nav className="px-2 pb-2 space-y-0.5">
        <Link
          to="/planos"
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-secondary/60 hover:text-foreground transition-colors"
        >
          <CreditCard className="size-4" />
          Planos
        </Link>
        {navItems.slice(0, 3).map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={handleRestrictedNav}
            className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-secondary/60 hover:text-foreground transition-colors"
          >
            <it.icon className="size-4" />
            {it.label}
          </button>
        ))}
      </nav>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-4 py-2">
          {messages.length > 0 ? (
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Hoje
              </div>
              <ul className="space-y-0.5">
                <li>
                  <div
                    className={cn(
                      "block truncate rounded-md px-2 py-2 text-sm",
                      "bg-secondary text-foreground",
                    )}
                  >
                    {(state.title || "Nova conversa").slice(0, 40)}
                  </div>
                </li>
              </ul>
            </div>
          ) : (
            <p className="px-2 py-6 text-xs text-muted-foreground text-center">
              Sem conversas ainda.
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="p-2 border-t border-border">
        <button
          type="button"
          onClick={handleRestrictedNav}
          className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-secondary/60 hover:text-foreground transition-colors"
        >
          <Settings className="size-4" />
          Configurações
        </button>
      </div>
    </div>
  );

  return (
    <CodeCanvasProvider>
    <div className="h-screen w-full flex bg-background text-foreground overflow-hidden">
      {!collapsed && (
        <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-sidebar">
          {sidebar}
        </aside>
      )}

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
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Mostrar sidebar" : "Esconder sidebar"}
          >
            <PanelLeft className="size-5" />
          </Button>
          <Link to="/" className="md:hidden">
            <NousxLogo className="text-lg" />
          </Link>
          <div className="flex-1" />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/auth" })}
            className="hidden sm:inline-flex"
          >
            <LogIn className="size-4 mr-1" />
            Entrar
          </Button>
          <Button
            size="sm"
            onClick={() => navigate({ to: "/auth" })}
            style={{ background: "#6C47FF" }}
          >
            Criar conta
          </Button>
        </header>

        <main className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full flex flex-col">
            {hasContent ? (
              <div ref={scrollRef} className="flex-1 overflow-y-auto">
                <div className="w-full max-w-3xl mx-auto px-3 md:px-4 py-6 space-y-4">
                  {messages.map((m) => (
                    <MessageItem key={m.id} msg={m} />
                  ))}
                  {streaming && <MessageItem msg={streaming} />}
                  {awaitingReply && !streaming && <TypingIndicator mode="default" />}
                </div>
              </div>
            ) : (
              <EmptyState onSuggest={setFillText} />
            )}
            <ChatInput
              onSend={(t) => handleSend(t)}
              disabled={sending}
              anonMode
              onAnonRestricted={handleInputRestricted}
              fillText={fillText}
              onFillTextConsumed={() => setFillText(undefined)}
            />
          </div>
        </main>

        <footer className="shrink-0 border-t border-border bg-background/80 px-4 py-1.5 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
          <Link to="/termos" className="hover:text-foreground transition-colors">
            Termos
          </Link>
          <span aria-hidden>·</span>
          <Link to="/privacidade" className="hover:text-foreground transition-colors">
            Privacidade
          </Link>
          <span aria-hidden>·</span>
          <span>© AuraIA</span>
        </footer>
      </div>

      {/* Modal: nova conversa / nav restrita */}
      <Dialog open={gateOpen} onOpenChange={setGateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crie sua conta grátis</DialogTitle>
            <DialogDescription className="pt-2">
              Tenha conversas ilimitadas e acesse o Estúdio de Criação para gerar imagens sem censura.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-col gap-2 pt-2">
            <Button
              className="w-full"
              style={{ background: "#6C47FF" }}
              onClick={() => navigate({ to: "/auth" })}
            >
              Criar conta grátis <ArrowRight className="size-4 ml-1" />
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate({ to: "/auth" })}
            >
              Fazer login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal bloqueante: limite atingido */}
      <Dialog
        open={limitOpen}
        onOpenChange={(open) => {
          // Bloqueante: só fecha via navegação
          if (open) setLimitOpen(true);
        }}
      >
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Você chegou ao limite gratuito</DialogTitle>
            <DialogDescription className="pt-2">
              Crie sua conta — é totalmente grátis — para continuar sem limites e acessar o Estúdio de Criação.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-col gap-2 pt-2">
            <Button
              className="w-full"
              style={{ background: "#6C47FF" }}
              onClick={() => navigate({ to: "/auth" })}
            >
              Criar conta grátis <ArrowRight className="size-4 ml-1" />
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate({ to: "/auth" })}
            >
              Já tenho conta — fazer login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </CodeCanvasProvider>
  );
}
