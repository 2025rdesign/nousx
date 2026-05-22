import { useEffect, useRef, useState } from "react";
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
import { useActivePlan } from "@/hooks/use-active-plan";
import { VoiceModeModal } from "./voice-mode-modal";

// Só gera imagem quando o usuário descreve o conteúdo após
// "imagem / foto / ilustração / desenho / arte". Pedidos vagos
// como "gera uma imagem" caem no DeepSeek, que pergunta o que ele quer.
const IMAGE_INTENT_RE =
  /\b(ger(?:a|e|ar)|cri(?:a|e|ar)|fa[zç](?:a|er)|desenh(?:a|e|ar)|pint(?:a|e|ar)|mostr(?:a|e|ar)|me\s+(?:d[áa]|d[êe]|manda|mostra|envia)|quero|gostaria(?:\s+de)?|preciso(?:\s+de)?)\b[^\n]{0,30}\b(image(?:m|ns)|fotos?|ilustra[cç](?:[ãa]o|[õo]es)|desenhos?|figuras?|artes?|pinturas?|wallpapers?|retratos?|p[ôo]ster(?:es)?|banners?|capas?)\b([^\n]*)/i;

const MIN_DESCRIPTION_CHARS = 10;

const IMAGE_FOLLOW_UP_RE =
  /\b(a\s+mesma|mesm[ao]s?|igual|parecid[ao]s?|fa[cçz](?:a|er|endo)?|faz|deixe|coloque|troque|mude|ajuste|edite|refa[cç]a|regenere|varia[cç][aã]o|vers[aã]o|mais|menos|sem|com|agora|tamb[eé]m|t[aá]|ela|ele|tirando|usando|vestindo|sentad[ao]|deitad[ao]|em\s+p[eé])\b/i;

const VISUAL_EDIT_CUE_RE =
  /\b(mulher|homem|pessoa|modelo|rosto|corpo|cabelo|olhos?|pele|roupa|biqu[ií]ni|lingerie|pose|fundo|cen[aá]rio|praia|areia|luz|ilumina[cç][aã]o|estilo|realista|sensual|sexy|selfie|vertical|story|stories|9:16|16:9|1:1|quadrado|sorrindo|rindo|olhando|mostrando|segurando)\b/i;

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

function getLatestAssistantImage(messages: ChatMsg[], optimisticAssistant: ChatMsg | null) {
  if (optimisticAssistant?.role === "assistant" && optimisticAssistant.image_url) {
    return optimisticAssistant;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "assistant" && message.image_url) {
      return message;
    }
  }

  return null;
}

function detectImageFollowUp(text: string, hasPreviousAssistantImage: boolean): boolean {
  if (!hasPreviousAssistantImage) return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 500) return false;
  // Se há imagem anterior do assistente e o usuário envia mensagem curta,
  // tratamos como edit/follow-up de imagem. Mensagens longas/perguntas
  // ainda exigem a palavra-chave de follow-up.
  if (trimmed.length <= 120) return true;
  return IMAGE_FOLLOW_UP_RE.test(trimmed) || VISUAL_EDIT_CUE_RE.test(trimmed);
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
    console.log("[IMG 1] iniciando geracao");
    setSending(true);
    setStreaming(null);
    setOptimisticAssistant(null);
    const latestAssistantImage = getLatestAssistantImage(messages, optimisticAssistant);
    const isImageFollowUp = !image && !file && detectImageFollowUp(text, !!latestAssistantImage);
    const wantsImage = !image && !file && (detectImageIntent(text) || isImageFollowUp);
    const imagePrompt = isImageFollowUp && latestAssistantImage?.content
      ? `${text}\n\nContexto da imagem anterior: ${latestAssistantImage.content}`
      : text;
    console.log("[CHAT] gerar imagem:", wantsImage, "| text:", text.slice(0, 120));
    console.log("[CHAT] follow-up de imagem:", isImageFollowUp);
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
        console.log("[IMG 2] chamando API");
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
          body: JSON.stringify({ prompt: imagePrompt }),
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
        console.log("[IMG 3] URL recebida:", data.url);
        const caption = (data.caption ?? "Aqui está sua imagem.").trim();
        console.log("[IMG 4] atualizando mensagem");
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
      const streamId = `stream-${Date.now()}`;
      let accum = "";
      let reasoningAccum = "";
      let buf = "";

      setAwaitingReply(false);
      setStreaming({
        id: streamId,
        role: "assistant",
        content: "",
        reasoning: null,
        streaming: true,
      });

      const appendChunk = (text: string, reasoningText?: string) => {
        const safeText = text || "";
        const safeReasoning = reasoningText || "";

        if (safeText) accum += safeText;
        if (safeReasoning) reasoningAccum += safeReasoning;
        if (!safeText && !safeReasoning) return;

        setStreaming((prev) => {
          if (!prev || prev.id !== streamId) {
            return {
              id: streamId,
              role: "assistant",
              content: safeText,
              reasoning: safeReasoning || null,
              streaming: true,
            };
          }

          return {
            ...prev,
            content: `${prev.content}${safeText}`,
            reasoning: safeReasoning
              ? `${prev.reasoning ?? ""}${safeReasoning}`
              : (prev.reasoning ?? null),
            streaming: true,
          };
        });
      };

      const processPayload = (payload: string) => {
        if (!payload || payload === "[DONE]") return;

        try {
          const json = JSON.parse(payload);
          const d = json.choices?.[0]?.delta ?? {};
          const delta = typeof d.content === "string" ? d.content : "";
          const rdelta = typeof d.reasoning_content === "string" ? d.reasoning_content : "";
          appendChunk(delta, rdelta);
        } catch {
          appendChunk(payload);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          processPayload(trimmed.slice(5).trim());
        }
      }

      const tail = decoder.decode();
      if (tail) {
        buf += tail;
      }
      if (buf.trim().startsWith("data:")) {
        processPayload(buf.trim().slice(5).trim());
      }

      setStreaming((prev) =>
        prev && prev.id === streamId
          ? {
              ...prev,
              streaming: false,
            }
          : prev,
      );

      const finalContent = accum || "Desculpe, não consegui responder agora.";

      if (finalContent) {
        await saveMsg({
          data: { conversationId: convId, role: "assistant", content: finalContent },
        });
        queryClient.setQueryData<ChatMsg[]>(["messages", convId], (prev) => [
          ...(prev ?? []),
          {
            id: `tmp-a-${Date.now()}`,
            role: "assistant",
            content: finalContent,
            reasoning: reasoningAccum || null,
          },
        ]);
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

  const hasContent =
    messages.length > 0 || streaming || optimisticUser || optimisticAssistant || awaitingReply;
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
          voiceModeActive={voiceOpen}
        />
        <VoiceModeModal open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      </div>
    </CodeCanvasProvider>
  );
}