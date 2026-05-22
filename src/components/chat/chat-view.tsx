import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  createConversation,
  getMessages,
  saveMessage,
  renameConversation,
} from "@/lib/chat.functions";
import { EmptyState } from "./empty-state";
import { ChatInput } from "./chat-input";
import { MessageItem, TypingIndicator, type ChatMsg } from "./message-item";
import { CodeCanvasProvider } from "./code-canvas";
import { notify } from "@/lib/notify";
import type { ExtractedFile } from "@/lib/file-extract";
import { VoiceModeModal } from "./voice-mode-modal";
import { useActivePlan } from "@/hooks/use-active-plan";

// Só gera imagem quando o usuário descreve o conteúdo após
// "imagem / foto / ilustração / desenho / arte". Pedidos vagos
// como "gera uma imagem" caem no DeepSeek, que pergunta o que ele quer.
const IMAGE_INTENT_RE =
  /\b(ger(?:a|e|ar)|cri(?:a|e|ar)|fa[zç](?:a|er)|desenh(?:a|e|ar)|pint(?:a|e|ar)|mostr(?:a|e|ar)|me\s+(?:d[áa]|d[êe]|manda|mostra|envia)|quero|gostaria(?:\s+de)?|preciso(?:\s+de)?)\b[^\n]{0,30}\b(imagens?|fotos?|ilustra[cç][aã]o(?:es)?|desenhos?|figuras?|artes?|pinturas?|wallpapers?|retratos?|p[ôo]steres?|banners?|capas?)\b([^\n]*)/i;

const MIN_DESCRIPTION_CHARS = 10;

function detectImageIntent(text: string): boolean {
  if (!text) return false;
  if (text.length > 800) return false;
  const t = text.trim();
  if (!t) return false;
  const match = IMAGE_INTENT_RE.exec(t);
  if (!match) return false;
  // O grupo 3 é o que vem DEPOIS de "imagem/foto/...".
  // Exige pelo menos MIN_DESCRIPTION_CHARS de descrição real
  // (ignorando pontuação, "pra mim", "por favor", etc.).
  const after = (match[3] ?? "")
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\b(pra|para)\s+mim\b/gi, " ")
    .replace(/\bpor\s+favor\b/gi, " ")
    .replace(/\b(agora|aqui|r[áa]pido|nova|legal|bonita|top|massa|incr[íi]vel)\b/gi, " ")
    .trim();
  return after.length >= MIN_DESCRIPTION_CHARS;
}

interface Props {
  conversationId: string | null;
}

export function ChatView({ conversationId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchMessages = useServerFn(getMessages);
  const createConv = useServerFn(createConversation);
  const saveMsg = useServerFn(saveMessage);
  const rename = useServerFn(renameConversation);
  const { planId, hasActive } = useActivePlan();
  const hasUltra = hasActive && planId === "ultra";
  const [voiceOpen, setVoiceOpen] = useState(false);

  const { data: dbMessages, isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () =>
      conversationId ? fetchMessages({ data: { conversationId } }) : Promise.resolve([]),
    enabled: !!conversationId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const [streaming, setStreaming] = useState<ChatMsg | null>(null);
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [inflightMode, setInflightMode] = useState<
    "default" | "web" | "reasoning" | "image"
  >("default");
  const [optimisticUser, setOptimisticUser] = useState<ChatMsg | null>(null);
  const [optimisticAssistant, setOptimisticAssistant] = useState<ChatMsg | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: ChatMsg[] = (dbMessages as ChatMsg[] | undefined) ?? [];

  useEffect(() => {
    if (!optimisticAssistant?.image_url) return;
    const persisted = messages.some(
      (message) =>
        message.role === "assistant" &&
        message.image_url === optimisticAssistant.image_url &&
        message.content === optimisticAssistant.content,
    );
    if (persisted) {
      setOptimisticAssistant(null);
    }
  }, [messages, optimisticAssistant]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, optimisticAssistant]);

  async function handleSend(
    text: string,
    image: string | null,
    file: ExtractedFile | null,
    reasoning: boolean,
    webSearch: boolean = false,
  ) {
    setSending(true);
    setOptimisticAssistant(null);
    const wantsImage = !image && !file && detectImageIntent(text);
    console.log("[CHAT] gerar imagem:", wantsImage, "| text:", text.slice(0, 120));
    setInflightMode(
      wantsImage ? "image" : webSearch ? "web" : reasoning ? "reasoning" : "default",
    );
    setAwaitingReply(true);
    const displayText = file ? `📎 ${file.name}\n\n${text}` : text;
    const tempUser: ChatMsg = {
      id: `tmp-u-${Date.now()}`,
      role: "user",
      content: displayText,
      image_url: image,
    };
    setOptimisticUser(tempUser);
    try {
      let convId = conversationId;
      let isNew = false;
      if (!convId) {
        const conv = await createConv({ data: { title: text.slice(0, 30) } });
        convId = conv.id;
        isNew = true;
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }

      // Save user message
      await saveMsg({
        data: {
          conversationId: convId,
          role: "user",
          content: displayText,
          imageUrl: image,
        },
      });
      queryClient.setQueryData<ChatMsg[]>(["messages", convId], (prev) => [
        ...(prev ?? []),
        tempUser,
      ]);
      setOptimisticUser(null);

      if (isNew) {
        navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
      }

      // ── Image generation branch ──────────────────────────────────────────
      if (wantsImage) {
        console.log("[CHAT] chamando /api/generate-image (DeepSeek bypassado)");
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Sessão expirada.");
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ prompt: text }),
        });
        console.log("[CHAT] /api/generate-image status:", res.status);
        if (res.status === 402) {
          console.log("[CHAT] plano ativo:", false);
          console.log("[CHAT] plano inativo — exibindo mensagem de upgrade");
          const msg =
            "Geração de imagem no chat é exclusiva do plano **Plus** ou **Ultra**.\n\n" +
            "Você ainda pode gerar imagens no **Estúdio** usando seus créditos avulsos.\n\n" +
            "[Ver Planos](/configuracoes)";
          await saveMsg({
            data: { conversationId: convId, role: "assistant", content: msg },
          });
          queryClient.invalidateQueries({ queryKey: ["messages", convId] });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Falha ao gerar imagem." }));
          throw new Error(err.error || "Falha ao gerar imagem.");
        }
        const data = (await res.json()) as { url: string; caption?: string };
        console.log("[CHAT] plano ativo:", true);
        console.log("[CHAT] imagem gerada:", data.url);
        const caption = (data.caption ?? "Aqui está sua imagem.").trim();
        setOptimisticAssistant({
          id: `tmp-a-${Date.now()}`,
          role: "assistant",
          content: caption,
          image_url: data.url,
        });
        await saveMsg({
          data: {
            conversationId: convId,
            role: "assistant",
            content: caption,
            imageUrl: data.url,
          },
        });
        queryClient.invalidateQueries({ queryKey: ["messages", convId] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        if (isNew) {
          try {
            await rename({ data: { id: convId, title: text.slice(0, 30) } });
          } catch (e) {
            console.warn("rename failed", e);
          }
        }
        return;
      }

      // Build messages payload. For the current turn, if a file was attached,
      // inline its extracted text as context for the model.
      const history = (
        queryClient.getQueryData<ChatMsg[]>(["messages", convId]) ?? []
      ).map((m, idx, arr) => {
        const isLast = idx === arr.length - 1;
        if (m.role === "user" && m.image_url) {
          return {
            role: "user" as const,
            content: [
              { type: "image_url" as const, image_url: { url: m.image_url } },
              { type: "text" as const, text: m.content },
            ],
          };
        }
        if (isLast && file) {
          return {
            role: m.role,
            content: `Arquivo anexado: ${file.name}\n---\n${file.text}\n---\n\nPergunta do usuário: ${text}`,
          };
        }
        return { role: m.role, content: m.content };
      });

      // Get bearer
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: history,
          reasoning,
          webSearch,
          hasFile: !!file,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Falha ao responder." }));
        throw new Error(err.error || "Falha ao responder.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accum = "";
      let reasoningAccum = "";
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
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const d = json.choices?.[0]?.delta ?? {};
            const delta = d.content;
            const rdelta = d.reasoning_content;
            if (typeof rdelta === "string" && rdelta.length > 0) {
              reasoningAccum += rdelta;
            }
            if (typeof delta === "string" && delta.length > 0) {
              accum += delta;
            }
            if (delta || rdelta) {
              if (!started) {
                started = true;
                // First chunk arrived: hide typing indicator before showing text
                flushSync(() => {
                  setAwaitingReply(false);
                });
              }
              flushSync(() => {
                setStreaming({
                  id: "stream",
                  role: "assistant",
                  content: accum,
                  reasoning: reasoningAccum || null,
                  streaming: true,
                });
              });
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (accum) {
        await saveMsg({
          data: { conversationId: convId, role: "assistant", content: accum },
        });
      }
      setStreaming(null);
      queryClient.invalidateQueries({ queryKey: ["messages", convId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });

      if (isNew) {
        try {
          await rename({ data: { id: convId, title: text.slice(0, 30) } });
        } catch (e) {
          console.warn("rename failed", e);
        }
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error(err);
      if (!isAbort) {
        notify.error(err instanceof Error ? err.message : "Algo deu errado.");
      }
      setStreaming(null);
      setOptimisticUser(null);
      setOptimisticAssistant(null);
    } finally {
      setSending(false);
      setAwaitingReply(false);
    }
  }

  const hasContent = messages.length > 0 || streaming || optimisticUser;
  const showSkeleton =
    !!conversationId && messagesLoading && !hasContent;

  return (
    <CodeCanvasProvider>
      <div className="h-full flex flex-col">
        {showSkeleton ? (
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-3xl mx-auto px-3 md:px-4 py-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={
                    "h-16 rounded-lg bg-muted/50 animate-pulse " +
                    (i % 2 === 0 ? "max-w-[70%]" : "ml-auto max-w-[55%]")
                  }
                />
              ))}
            </div>
          </div>
        ) : hasContent ? (
          <div ref={scrollRef as any} className="flex-1 overflow-y-auto">
            <div className="w-full max-w-3xl mx-auto px-3 md:px-4 py-6 space-y-4">
              {messages.map((m) => (
                <MessageItem key={m.id} msg={m} />
              ))}
              {optimisticUser && <MessageItem msg={optimisticUser} />}
              {optimisticAssistant && <MessageItem msg={optimisticAssistant} />}
              {streaming && <MessageItem msg={streaming} />}
              {awaitingReply && !streaming && <TypingIndicator mode={inflightMode} />}
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
        <ChatInput
          onSend={handleSend}
          disabled={sending}
          hasUltra={hasUltra}
          onOpenVoiceMode={() => setVoiceOpen(true)}
        />
        <VoiceModeModal
          open={voiceOpen}
          onClose={async (summary) => {
            setVoiceOpen(false);
            if (!summary) return;
            try {
              let convId = conversationId;
              if (!convId) {
                const conv = await createConv({ data: { title: "Conversa por voz" } });
                convId = conv.id;
                queryClient.invalidateQueries({ queryKey: ["conversations"] });
                navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
              }
              await saveMsg({
                data: { conversationId: convId, role: "assistant", content: summary },
              });
              queryClient.invalidateQueries({ queryKey: ["messages", convId] });
            } catch (e) {
              console.error("[VOICE] save summary error", e);
              notify.error("Não foi possível salvar o resumo.");
            }
          }}
        />
      </div>
    </CodeCanvasProvider>
  );
}