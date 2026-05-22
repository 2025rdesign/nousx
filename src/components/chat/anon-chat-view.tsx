import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { Link } from "@tanstack/react-router";
import TextareaAutosize from "react-textarea-autosize";
import { Send, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageItem, TypingIndicator, type ChatMsg } from "./message-item";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FREE_LIMIT = 10;
const STORAGE_KEY = "auraia_anon_usage_v1";

interface Usage {
  count: number;
}

function loadUsage(): Usage {
  if (typeof window === "undefined") return { count: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0 };
    const v = JSON.parse(raw) as Usage;
    return { count: Math.max(0, Math.min(FREE_LIMIT, Number(v?.count) || 0)) };
  } catch {
    return { count: 0 };
  }
}

function saveUsage(u: Usage) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
}

export function AnonChatView({ onUsageChange }: { onUsageChange?: (n: number) => void }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState<ChatMsg | null>(null);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [usage, setUsage] = useState<Usage>(() => loadUsage());
  const [blockedOpen, setBlockedOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onUsageChange?.(usage.count);
  }, [usage.count, onUsageChange]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const limitReached = usage.count >= FREE_LIMIT;

  async function handleSend() {
    const t = text.trim();
    if (!t || sending) return;
    if (limitReached) {
      setBlockedOpen(true);
      return;
    }
    setSending(true);
    setAwaitingReply(true);
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: t };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setText("");

    try {
      const history = nextMsgs.map((m) => ({ role: m.role, content: m.content }));
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
      setMessages((prev) => [...prev, finalMsg]);
      setStreaming(null);

      const newCount = Math.min(FREE_LIMIT, usage.count + 1);
      const u = { count: newCount };
      setUsage(u);
      saveUsage(u);
      if (newCount >= FREE_LIMIT) setBlockedOpen(true);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Algo deu errado. Tente novamente.",
        },
      ]);
      setStreaming(null);
    } finally {
      setAwaitingReply(false);
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasContent = messages.length > 0 || streaming || awaitingReply;
  const showWarn = usage.count >= 8 && usage.count < FREE_LIMIT;

  return (
    <div className="h-full flex flex-col">
      {showWarn && (
        <div className="shrink-0 border-b border-border bg-accent/10 px-4 py-2 text-xs text-center text-foreground">
          Você usou <strong>{usage.count} de {FREE_LIMIT}</strong> mensagens gratuitas.{" "}
          <Link to="/auth" className="underline font-medium" style={{ color: "#6C47FF" }}>
            Crie sua conta grátis e ganhe 5 créditos para gerar imagens.
          </Link>
        </div>
      )}

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
        <div className="flex-1 overflow-y-auto flex items-center justify-center px-6">
          <div className="text-center space-y-3 max-w-md">
            <div
              className="inline-flex items-center justify-center size-12 rounded-2xl"
              style={{ background: "#6C47FF22", color: "#6C47FF" }}
            >
              <Sparkles className="size-6" />
            </div>
            <h1 className="text-2xl font-semibold">Converse com a AuraIA</h1>
            <p className="text-sm text-muted-foreground">
              IA sem censura, sem julgamentos. Experimente grátis — você tem{" "}
              <strong>{FREE_LIMIT - usage.count} mensagens</strong> para testar.
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-3xl mx-auto px-3 md:px-4 pb-4 pt-2">
        <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-accent transition-colors">
          <TextareaAutosize
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              limitReached
                ? "Limite gratuito atingido. Crie uma conta para continuar."
                : "Pergunte qualquer coisa..."
            }
            minRows={1}
            maxRows={6}
            disabled={limitReached}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-60"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <span className="text-[11px] text-muted-foreground pl-2">
              {usage.count}/{FREE_LIMIT} mensagens grátis ·{" "}
              <Link to="/auth" className="underline" style={{ color: "#6C47FF" }}>
                Criar conta
              </Link>
            </span>
            <div className="flex-1" />
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={!text.trim() || sending || limitReached}
              className="rounded-lg"
              aria-label="Enviar"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Pode cometer erros. Verifique informações importantes.
        </p>
      </div>

      <Dialog
        open={blockedOpen}
        onOpenChange={(open) => {
          if (!limitReached) setBlockedOpen(open);
          // when limit reached, ignore outside click — only close via buttons
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(e) => limitReached && e.preventDefault()}
          onEscapeKeyDown={(e) => limitReached && e.preventDefault()}
          showClose={!limitReached}
        >
          <DialogHeader>
            <DialogTitle>Suas mensagens gratuitas acabaram</DialogTitle>
            <DialogDescription className="pt-2">
              Crie uma conta grátis e continue sem limites. Bônus: ganhe{" "}
              <strong>5 créditos</strong> para gerar imagens sem censura no Estúdio.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-col gap-2 pt-2">
            <Button asChild className="w-full" style={{ background: "#6C47FF" }}>
              <Link to="/auth">
                Criar conta grátis <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/auth">Já tenho conta — fazer login</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}