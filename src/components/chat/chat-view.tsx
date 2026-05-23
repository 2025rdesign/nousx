import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  createConversation,
  getMessages,
  renameConversation,
  saveMessage,
} from "@/lib/chat.functions";
import { EmptyState } from "./empty-state";
import { ChatInput } from "./chat-input";
import { MessageItem, TypingIndicator, type ChatMsg } from "./message-item";
import { CodeCanvasProvider } from "./code-canvas";
import { notify } from "@/lib/notify";
import type { ExtractedFile } from "@/lib/file-extract";
import { useActivePlan } from "@/hooks/use-active-plan";
import { VoiceModeModal } from "./voice-mode-modal";

const IMAGE_INTENT_RE =
  /\b(ger(?:a|e|ar)|cri(?:a|e|ar)|fa[zç](?:a|er)|desenh(?:a|e|ar)|pint(?:a|e|ar)|mostr(?:a|e|ar)|me\s+(?:d[áa]|d[êe]|manda|mostra|envia)|quero|gostaria(?:\s+de)?|preciso(?:\s+de)?)\b[^\n]{0,30}\b(image(?:m|ns)|fotos?|ilustra[cç](?:[ãa]o|[õo]es)|desenhos?|figuras?|artes?|pinturas?|wallpapers?|retratos?|p[ôo]ster(?:es)?|banners?|capas?)\b([^\n]*)/i;

const MIN_DESCRIPTION_CHARS = 10;

const IMAGE_FOLLOW_UP_RE =
  /\b(a\s+mesma|mesm[ao]s?|igual|parecid[ao]s?|fa[cçz](?:a|er|endo)?|faz|deixe|coloque|troque|mude|ajuste|edite|refa[cç]a|regenere|varia[cç][aã]o|vers[aã]o|mais|menos|sem|com|agora|tamb[eé]m|t[áa]|ela|ele|tirando|usando|vestindo|sentad[ao]|deitad[ao]|em\s+p[eé])\b/i;

const VISUAL_EDIT_CUE_RE =
  /\b(mulher|homem|pessoa|modelo|rosto|corpo|cabelo|olhos?|pele|roupa|biqu[ií]ni|lingerie|pose|fundo|cen[aá]rio|praia|areia|luz|ilumina[cç][aã]o|estilo|realista|sensual|sexy|selfie|vertical|story|stories|9:16|16:9|1:1|quadrado|sorrindo|rindo|olhando|mostrando|segurando)\b/i;

function detectImageIntent(text: string): boolean {
  if (!text) return false;
  if (text.length > 800) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  const match = IMAGE_INTENT_RE.exec(trimmed);
  if (!match) return false;

  const after = (match[3] ?? "")
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\b(pra|para)\s+mim\b/gi, " ")
    .replace(/\bpor\s+favor\b/gi, " ")
    .replace(/\b(agora|aqui|r[áa]pido|nova|legal|bonita|top|massa|incr[íi]vel)\b/gi, " ")
    .trim();

  return after.length >= MIN_DESCRIPTION_CHARS;
}

function getLatestAssistantImage(messages: ChatMsg[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
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

  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    if (!conversationId) return [];
    const cached = queryClient.getQueryData<ChatMsg[]>(["messages", conversationId]);
    return cached ? cached.map((m) => ({ ...m, streaming: false })) : [];
  });
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [inflightMode, setInflightMode] = useState<
    "default" | "web" | "reasoning" | "image"
  >("default");
  const [voiceOpen, setVoiceOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastConversationIdRef = useRef<string | null>(conversationId);
  const pendingNavigationConversationIdRef = useRef<string | null>(null);
  const hydratedConversationIdRef = useRef<string | null>(conversationId);

  const {
    data: dbMessages,
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [] as ChatMsg[];
      console.log("[CHAT-OPEN] abrindo chatId:", conversationId);
      console.log("[CHAT-OPEN] buscando mensagens...");
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10_000),
      );
      try {
        const result = (await Promise.race([
          fetchMessages({ data: { conversationId } }),
          timeout,
        ])) as ChatMsg[];
        console.log("[CHAT-OPEN] mensagens recebidas:", result.length);
        return result;
      } catch (err) {
        console.error("[CHAT-OPEN] erro:", err);
        throw err;
      }
    },
    enabled: !!conversationId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
  });

  useEffect(() => {
    if (conversationId === lastConversationIdRef.current) return;

    const isPendingNavigation =
      !!conversationId && pendingNavigationConversationIdRef.current === conversationId;

    lastConversationIdRef.current = conversationId;
    hydratedConversationIdRef.current = null;

    if (isPendingNavigation) {
      pendingNavigationConversationIdRef.current = null;
      return;
    }

    setMessages([]);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    if (hydratedConversationIdRef.current === conversationId) return;
    if (messages.length > 0) return;
    if (!dbMessages) return;

    setMessages(
      (((dbMessages as ChatMsg[] | undefined) ?? []).map((message) => ({
        ...message,
        streaming: false,
      }))) as ChatMsg[],
    );
    hydratedConversationIdRef.current = conversationId;
  }, [conversationId, dbMessages, messages.length]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, awaitingReply]);

  async function handleSend(
    text: string,
    image: string | null,
    file: ExtractedFile | null,
    reasoning: boolean,
    webSearch: boolean = false,
  ) {
    console.log("[IMG 1] iniciando geracao");

    const baseMessages = messages;
    const latestAssistantImage = getLatestAssistantImage(baseMessages);
    const isImageFollowUp = !image && !file && detectImageFollowUp(text, !!latestAssistantImage);
    const wantsImage = !image && !file && (detectImageIntent(text) || isImageFollowUp);
    const imagePrompt = isImageFollowUp && latestAssistantImage?.content
      ? `${text}\n\nContexto da imagem anterior: ${latestAssistantImage.content}`
      : text;

    console.log("[CHAT] gerar imagem:", wantsImage, "| text:", text.slice(0, 120));
    console.log("[CHAT] follow-up de imagem:", isImageFollowUp);

    const displayText = file ? `📎 ${file.name}\n\n${text}` : text;
    const timestamp = Date.now();
    const userMsg: ChatMsg = {
      id: `user-${timestamp}`,
      role: "user",
      content: displayText,
      image_url: image,
      streaming: false,
    };
    const assistantId = `assistant-${timestamp}`;
    const assistantMsg: ChatMsg = {
      id: assistantId,
      role: "assistant",
      content: "",
      reasoning: null,
      streaming: true,
    };

    setSending(true);
    setInflightMode(
      wantsImage ? "image" : webSearch ? "web" : reasoning ? "reasoning" : "default",
    );
    setAwaitingReply(true);
    setMessages((prev) => (wantsImage ? [...prev, userMsg] : [...prev, userMsg, assistantMsg]));

    try {
      let convId = conversationId;
      let isNew = false;

      if (!convId) {
        const conv = await createConv({ data: { title: text.slice(0, 30) } });
        convId = conv.id;
        isNew = true;
        pendingNavigationConversationIdRef.current = convId;
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }

      void saveMsg({
        data: {
          conversationId: convId,
          role: "user",
          content: displayText,
          imageUrl: image,
        },
      }).catch((error) => {
        console.error("[CHAT-SAVE-USER] falha ao salvar mensagem do usuario:", error);
      });

      if (wantsImage) {
        console.log("[IMG 2] chamando API");
        console.log("[CHAT] chamando /api/generate-image (DeepSeek bypassado)");

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
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

          const upgradeText =
            "Geração de imagem no chat é exclusiva do plano **Plus** ou **Ultra**.\n\n" +
            "Você ainda pode gerar imagens no **Estúdio** usando seus créditos avulsos.\n\n" +
            "[Ver Planos](/configuracoes)";

          const upgradeMessage: ChatMsg = {
            id: `assistant-upgrade-${Date.now()}`,
            role: "assistant",
            content: upgradeText,
            streaming: false,
          };

          setMessages((prev) => [...prev, upgradeMessage]);
          void saveMsg({
            data: {
              conversationId: convId,
              role: "assistant",
              content: upgradeText,
            },
          }).catch((error) => {
            console.error("[CHAT-SAVE-ASSISTANT] falha ao salvar upgrade:", error);
          });

          queryClient.invalidateQueries({ queryKey: ["conversations"] });

          if (isNew) {
            try {
              await rename({ data: { id: convId, title: text.slice(0, 30) } });
            } catch (error) {
              console.warn("rename failed", error);
            }
            navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
          }

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
        const assistantImageMessage: ChatMsg = {
          id: `assistant-image-${Date.now()}`,
          role: "assistant",
          content: caption,
          image_url: data.url,
          streaming: false,
        };

        console.log("[IMG 4] atualizando mensagem");
        setMessages((prev) => [...prev, assistantImageMessage]);
        void saveMsg({
          data: {
            conversationId: convId,
            role: "assistant",
            content: caption,
            imageUrl: data.url,
          },
        }).catch((error) => {
          console.error("[CHAT-SAVE-ASSISTANT] falha ao salvar imagem:", error);
        });

        queryClient.invalidateQueries({ queryKey: ["conversations"] });

        if (isNew) {
          try {
            await rename({ data: { id: convId, title: text.slice(0, 30) } });
          } catch (error) {
            console.warn("rename failed", error);
          }
          queryClient.setQueryData<ChatMsg[]>(
            ["messages", convId],
            [...baseMessages, userMsg, assistantImageMessage].map((m) => ({ ...m, streaming: false })),
          );
          navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
        }

        return;
      }

      const nextMessages = [...baseMessages, userMsg, assistantMsg];
      const history = nextMessages
        .filter((message) => message.role === "user" || message.content)
        .map((message, index, array) => {
          const isLast = index === array.length - 1;

          if (message.role === "user" && message.image_url) {
            return {
              role: "user" as const,
              content: [
                { type: "image_url" as const, image_url: { url: message.image_url } },
                { type: "text" as const, text: message.content },
              ],
            };
          }

          if (isLast && file) {
            return {
              role: message.role,
              content: `Arquivo anexado: ${file.name}\n---\n${file.text}\n---\n\nPergunta do usuário: ${text}`,
            };
          }

          return { role: message.role, content: message.content };
        });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");

      const userId = sessionData.session?.user?.id;
      console.log("[CHAT-SEND] enviando mensagem:", text.slice(0, 200));
      console.log("[CHAT-SEND] usuario:", userId);

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

      console.log("[CHAT-RECV] response status:", res.status);
      console.log("[CHAT-RECV] content-type:", res.headers.get("content-type"));
      console.log("[CHAT-RECV] response.body existe:", !!res.body);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[CHAT-ERROR] response nao ok:", res.status, errText);
        let errMsg = "Falha ao responder.";
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error) errMsg = parsed.error;
        } catch {
          /* ignore */
        }
        throw new Error(errMsg);
      }

      const contentType = res.headers.get("content-type") ?? "";
      setAwaitingReply(false);

      if (contentType.includes("application/json")) {
        const data = (await res.json().catch(() => null)) as
          | { content?: string; message?: string }
          | null;
        const finalContent = data?.content || data?.message || "Desculpe, não consegui responder agora.";

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: finalContent,
                  streaming: false,
                }
              : message,
          ),
        );

        void saveMsg({
          data: { conversationId: convId, role: "assistant", content: finalContent },
        }).catch((error) => {
          console.error("[CHAT-SAVE-ASSISTANT] falha no fallback:", error);
        });

        queryClient.invalidateQueries({ queryKey: ["conversations"] });

        if (isNew) {
          try {
            await rename({ data: { id: convId, title: text.slice(0, 30) } });
          } catch (error) {
            console.warn("rename failed", error);
          }
          queryClient.setQueryData<ChatMsg[]>(
            ["messages", convId],
            [
              ...baseMessages,
              userMsg,
              { ...assistantMsg, content: finalContent, streaming: false },
            ].map((m) => ({ ...m, streaming: false })),
          );
          navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
        }

        return;
      }

      if (!res.body) {
        throw new Error("Falha ao iniciar o streaming da resposta.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accum = "";
      let reasoningAccum = "";
      let buffer = "";
      let gotFirstChunk = false;

      const stallController = new AbortController();
      const stallTimer = setTimeout(() => {
        if (!gotFirstChunk) {
          console.error("[CHAT-ERROR] timeout: nenhum chunk em 15s");
          stallController.abort();
          try {
            reader.cancel();
          } catch {
            /* ignore */
          }
        }
      }, 15000);

      const appendChunk = (chunkText: string, chunkReasoning?: string) => {
        const safeText = chunkText || "";
        const safeReasoning = chunkReasoning || "";

        if (safeText) accum += safeText;
        if (safeReasoning) reasoningAccum += safeReasoning;
        if (!safeText && !safeReasoning) return;

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: accum,
                  reasoning: reasoningAccum || null,
                  streaming: true,
                }
              : message,
          ),
        );
      };

      const processPayload = (payload: string) => {
        if (!payload || payload === "[DONE]") return;

        try {
          const json = JSON.parse(payload);
          const delta = typeof json.choices?.[0]?.delta?.content === "string"
            ? json.choices[0].delta.content
            : "";
          const reasoningDelta = typeof json.choices?.[0]?.delta?.reasoning_content === "string"
            ? json.choices[0].delta.reasoning_content
            : "";
          appendChunk(delta, reasoningDelta);
        } catch {
          appendChunk(payload);
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("[CHAT-DONE] streaming finalizado, total:", accum.length);
            break;
          }

          if (value) {
            gotFirstChunk = true;
            console.log("[CHAT-CHUNK] chunk recebido:", value.length, "bytes");
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            processPayload(trimmed.slice(5).trim());
          }
        }
      } finally {
        clearTimeout(stallTimer);
      }

      if (!gotFirstChunk && stallController.signal.aborted) {
        throw new Error("A resposta demorou muito. Tente novamente.");
      }

      const tail = decoder.decode();
      if (tail) buffer += tail;
      if (buffer.trim().startsWith("data:")) {
        processPayload(buffer.trim().slice(5).trim());
      }

      const finalContent = accum || "Desculpe, não consegui responder agora.";

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: finalContent,
                reasoning: reasoningAccum || null,
                streaming: false,
              }
            : message,
        ),
      );

      void saveMsg({
        data: { conversationId: convId, role: "assistant", content: finalContent },
      }).catch((error) => {
        console.error("[CHAT-SAVE-ASSISTANT] falha ao salvar resposta:", error);
      });

      queryClient.invalidateQueries({ queryKey: ["conversations"] });

      if (isNew) {
        try {
          await rename({ data: { id: convId, title: text.slice(0, 30) } });
        } catch (error) {
          console.warn("rename failed", error);
        }
        queryClient.setQueryData<ChatMsg[]>(
          ["messages", convId],
          [
            ...baseMessages,
            userMsg,
            {
              ...assistantMsg,
              content: finalContent,
              reasoning: reasoningAccum || null,
              streaming: false,
            },
          ].map((m) => ({ ...m, streaming: false })),
        );
        navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
      }
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      console.error(error);

      if (wantsImage) {
        if (!isAbort) {
          notify.error(error instanceof Error ? error.message : "Algo deu errado.");
        }
      } else {
        const fallbackText = isAbort
          ? "A resposta demorou muito. Tente novamente."
          : error instanceof Error
            ? error.message
            : "Algo deu errado.";

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: fallbackText,
                  streaming: false,
                }
              : message,
          ),
        );

        if (!isAbort) {
          notify.error(fallbackText);
        }
      }
    } finally {
      setSending(false);
      setAwaitingReply(false);
    }
  }

  const hasStreamingMessage = messages.some((message) => message.streaming);
  const hasContent = messages.length > 0 || awaitingReply;
  const showSkeleton = !!conversationId && messagesLoading && !hasContent;

  return (
    <CodeCanvasProvider>
      <div className="h-full flex flex-col">
        {showSkeleton ? (
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-3xl mx-auto px-3 md:px-4 py-6 space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={
                    "h-16 rounded-lg bg-muted/50 animate-pulse " +
                    (index % 2 === 0 ? "max-w-[70%]" : "ml-auto max-w-[55%]")
                  }
                />
              ))}
            </div>
          </div>
        ) : hasContent ? (
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="w-full max-w-3xl mx-auto px-3 md:px-4 py-6 space-y-4">
              {messages.map((message) => (
                <MessageItem key={message.id} msg={message} />
              ))}
              {awaitingReply && !hasStreamingMessage && inflightMode === "image" ? (
                <TypingIndicator mode={inflightMode} />
              ) : null}
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