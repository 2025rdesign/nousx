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
  /\b(ger(?:a|e|ar)|cri(?:a|e|ar)|fa[zç](?:a|er)|desenh(?:a|e|ar)|pint(?:a|e|ar)|mostr(?:a|e|ar)|transform(?:a|e|ar)|convert(?:a|e|er)|me\s+(?:d[áa]|d[êe]|manda|mostra|envia)|quero|gostaria(?:\s+de)?|preciso(?:\s+de)?)\b[^\n]{0,30}\b(image(?:m|ns)|fotos?|ilustra[cç](?:[ãa]o|[õo]es)|desenhos?|figuras?|artes?|pinturas?|wallpapers?|retratos?|p[ôo]ster(?:es)?|banners?|capas?|vetor(?:es|ial|iais)?|logos?|logotipos?|[íi]cones?|stickers?|emojis?|avatares?|personagens?|cenas?|gifs?)\b([^\n]*)/i;

// Intenção de EDITAR uma imagem existente (não apenas analisar).
const IMAGE_EDIT_INTENT_RE =
  /\b(mude|muda|troque|troca|retire|retira|remova|remove|coloque|coloca|adicione|adiciona|altere|altera|edite|edita|tire|tira|bote|bota|ponha|p[oõ]e|deixe|deixa|torne|torna|transform(?:e|a|ar)|transport(?:e|a|ar)|substitua|substitui|inclua|inclui|apague|apaga|melhore|melhora|ajuste|ajusta|refa[cç]a|regenere|aumente|aumenta|diminua|diminui|deixa\s+mais|deixe\s+mais|sem\s+|com\s+|pinte|pinta|colorize)\b/i;

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

function getLatestImageContext(messages: ChatMsg[]) {
  // Find the most recent message containing an image (user-uploaded or assistant-generated)
  // and its associated description.
  let latestImageIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].image_url) {
      latestImageIdx = i;
      break;
    }
  }
  if (latestImageIdx === -1) return null;
  const imageMsg = messages[latestImageIdx];
  // If user uploaded the image, the description is usually the next assistant reply.
  let description = imageMsg.content || "";
  if (imageMsg.role === "user") {
    for (let j = latestImageIdx + 1; j < messages.length; j += 1) {
      if (messages[j].role === "assistant" && messages[j].content) {
        description = messages[j].content;
        break;
      }
    }
  }
  return { description: description.trim() };
}

function getLatestAssistantImageUrl(messages: ChatMsg[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === "assistant" && m.image_url) return m.image_url;
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

// Phrases DeepSeek emits when it decided to "generate" an image instead of
// just answering — used as a safety net if client-side detection missed.
const DEEPSEEK_IMAGE_CONFIRM_RE =
  /\b(gerando\s+(?:a\s+)?imagem|vou\s+gerar|criando\s+(?:a\s+)?imagem|gerando\s+agora|aqui\s+est[áa]\s+(?:a\s+)?(?:sua\s+)?(?:imagem|foto|ilustra[cç][ãa]o)|criando\s+agora|come[cç]ando\s+a\s+gera[cç][ãa]o)\b/i;

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
    "default" | "web" | "reasoning" | "image" | "edit"
  >("default");
  const [voiceOpen, setVoiceOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastConversationIdRef = useRef<string | null>(conversationId);
  const pendingNavigationConversationIdRef = useRef<string | null>(null);
  const hydratedConversationIdRef = useRef<string | null>(conversationId);

  // Sticky reference image: last image available for edit/visual reference.
  // - Set when user uploads a new image, or when the assistant generates/edits one.
  // - PERSISTS across moderation blocks so a retry can reuse the same reference.
  // - Reset only when the conversation changes (new context).
  const stickyImageRefRef = useRef<string | null>(null);

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
    stickyImageRefRef.current = null;

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

    // If the user just uploaded a new image, that becomes the sticky reference
    // immediately — so later messages (edits, follow-ups) can find it even if
    // the first attempt is blocked by moderation.
    if (image) {
      stickyImageRefRef.current = image;
    }

    const baseMessages = messages;
    const latestImageCtx = getLatestImageContext(baseMessages);
    const latestAssistantImageUrl = getLatestAssistantImageUrl(baseMessages);
    // Follow-up fires for ANY recent image in the conversation
    // (assistant-generated OR user-uploaded that the AI just analyzed).
    const isImageFollowUp =
      !image && !file && detectImageFollowUp(text, !!latestImageCtx);
    // EDIÇÃO DE IMAGEM (Ultra-only):
    // dispara quando há uma imagem disponível (recém anexada, sticky de
    // tentativa anterior, ou última gerada pela IA) E o texto contém
    // intenção explícita de edição.
    const editSourceImage =
      image ?? stickyImageRefRef.current ?? latestAssistantImageUrl ?? null;
    const wantsEdit =
      !file && !!editSourceImage && IMAGE_EDIT_INTENT_RE.test(text);

    // GERAÇÃO: permite imagem anexada (usada como referência visual no prompt,
    // NÃO como âncora de edição pixel-a-pixel).
    const wantsImage =
      !wantsEdit && !file && (detectImageIntent(text) || isImageFollowUp);

    const visualContextHint = image
      ? "\n\n[O usuário anexou uma imagem como referência visual — use estilo, composição, paleta e tema dela como inspiração para uma NOVA imagem.]"
      : "";
    const imagePrompt =
      wantsImage && latestImageCtx?.description
        ? `${text}\n\nContexto visual da conversa anterior: ${latestImageCtx.description.slice(0, 1200)}${visualContextHint}`
        : `${text}${visualContextHint}`;

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
      wantsEdit
        ? "edit"
        : wantsImage
          ? "image"
          : webSearch
            ? "web"
            : reasoning
              ? "reasoning"
              : "default",
    );
    setAwaitingReply(true);
    setMessages((prev) =>
      wantsImage || wantsEdit ? [...prev, userMsg] : [...prev, userMsg, assistantMsg],
    );

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

      // Persist user message FIRST so the chat history is never empty,
      // even if the assistant call fails or moderation blocks it.
      const userSavePromise = (wantsImage || wantsEdit)
        ? saveMsg({
            data: {
              conversationId: convId,
              role: "user",
              content: displayText,
              imageUrl: image,
            },
          }).catch((error) => {
            console.error("[CHAT-SAVE-USER] falha ao salvar mensagem do usuario:", error);
          })
        : (() => {
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
            return Promise.resolve();
          })();
      if (wantsImage || wantsEdit) {
        await userSavePromise;
      }

      if (wantsEdit && editSourceImage) {
        console.log("[EDIT] chamando /api/edit-image", {
          hasUltra,
          source: editSourceImage.startsWith("data:") ? "uploaded" : "previous-generated",
        });

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Sessão expirada.");

        const res = await fetch("/api/edit-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ prompt: text, imageUrl: editSourceImage }),
        });

        if (res.status === 402) {
          const upgradeText =
            "Para editar imagens no chat, você precisa do plano **Ultra**. " +
            "Acesse a página de planos para assinar! 🪄\n\n[Ver Planos](/configuracoes)";
          const upgradeMessage: ChatMsg = {
            id: `assistant-upgrade-${Date.now()}`,
            role: "assistant",
            content: upgradeText,
            streaming: false,
          };
          setMessages((prev) => [...prev, upgradeMessage]);
          void saveMsg({
            data: { conversationId: convId, role: "assistant", content: upgradeText },
          }).catch(() => undefined);
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
          const err = await res.json().catch(() => ({ error: "Falha ao editar imagem." }));
          if (res.status === 422 && (err.code === "moderation" || err.error === "content_moderation")) {
            const modText =
              "✨ Hmm, esse conteúdo não rolou aqui no chat.\n\n" +
              "O chat usa uma IA com filtros de conteúdo que bloqueou essa geração. " +
              "Mas calma — no **Estúdio de Criação** da AuraIA você consegue gerar esse tipo de imagem sem restrições, " +
              "com modelos exclusivos e alta qualidade.\n\n" +
              "[🎨 Ir para o Estúdio](/studio)";
            const modMsg: ChatMsg = {
              id: `assistant-moderation-${Date.now()}`,
              role: "assistant",
              content: modText,
              streaming: false,
            };
            setMessages((prev) => [...prev, modMsg]);
            await saveMsg({
              data: { conversationId: convId, role: "assistant", content: modText },
            }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            if (isNew) {
              try { await rename({ data: { id: convId, title: text.slice(0, 30) } }); } catch {}
              queryClient.setQueryData<ChatMsg[]>(
                ["messages", convId],
                [...baseMessages, userMsg, modMsg].map((m) => ({ ...m, streaming: false })),
              );
              navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
            }
            return;
          }
          throw new Error(err.error || "Falha ao editar imagem.");
        }

        const data = (await res.json()) as { url: string; caption?: string };
        const caption = (data.caption ?? "Aqui está sua imagem editada.").trim();
        const editedMessage: ChatMsg = {
          id: `assistant-edit-${Date.now()}`,
          role: "assistant",
          content: caption,
          image_url: data.url,
          streaming: false,
        };
        setMessages((prev) => [...prev, editedMessage]);
        void saveMsg({
          data: {
            conversationId: convId,
            role: "assistant",
            content: caption,
            imageUrl: data.url,
          },
        }).catch((error) => {
          console.error("[CHAT-SAVE-ASSISTANT] falha ao salvar imagem editada:", error);
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
            [...baseMessages, userMsg, editedMessage].map((m) => ({ ...m, streaming: false })),
          );
          navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
        }
        return;
      }

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
          if (res.status === 422 && (err.code === "moderation" || err.error === "content_moderation")) {
            const modText =
              "✨ Hmm, esse conteúdo não rolou aqui no chat.\n\n" +
              "O chat usa uma IA com filtros de conteúdo que bloqueou essa geração. " +
              "Mas calma — no **Estúdio de Criação** da AuraIA você consegue gerar esse tipo de imagem sem restrições, " +
              "com modelos exclusivos e alta qualidade.\n\n" +
              "[🎨 Ir para o Estúdio](/studio)";
            const modMsg: ChatMsg = {
              id: `assistant-moderation-${Date.now()}`,
              role: "assistant",
              content: modText,
              streaming: false,
            };
            setMessages((prev) => [...prev, modMsg]);
            await saveMsg({
              data: { conversationId: convId, role: "assistant", content: modText },
            }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            if (isNew) {
              try { await rename({ data: { id: convId, title: text.slice(0, 30) } }); } catch {}
              queryClient.setQueryData<ChatMsg[]>(
                ["messages", convId],
                [...baseMessages, userMsg, modMsg].map((m) => ({ ...m, streaming: false })),
              );
              navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
            }
            return;
          }
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

      // FALLBACK: DeepSeek confirmed it would generate an image but no image
      // was produced. Detect the confirmation pattern and trigger image
      // generation transparently. Only fires when the user has an active
      // plan (Plus/Ultra) — otherwise /api/generate-image returns 402.
      const shouldFallbackToImage =
        !wantsImage &&
        hasActive &&
        (planId === "plus" || planId === "ultra") &&
        DEEPSEEK_IMAGE_CONFIRM_RE.test(finalContent);

      if (shouldFallbackToImage) {
        console.log("[CHAT] fallback: DeepSeek confirmou geracao — acionando /api/generate-image");
        // Swap the assistant text bubble back into a loading state.
        setInflightMode("image");
        setAwaitingReply(true);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));

        try {
          const fallbackPrompt = latestImageCtx?.description
            ? `${text}\n\nContexto visual da conversa anterior: ${latestImageCtx.description.slice(0, 1200)}`
            : text;

          const imgRes = await fetch("/api/generate-image", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ prompt: fallbackPrompt }),
          });

          if (!imgRes.ok) {
            const err = await imgRes.json().catch(() => ({ error: "Falha ao gerar imagem." }));
            throw new Error(err.error || "Falha ao gerar imagem.");
          }

          const imgData = (await imgRes.json()) as { url: string; caption?: string };
          const caption = (imgData.caption ?? "Aqui está sua imagem.").trim();
          const imageMsg: ChatMsg = {
            id: `assistant-image-${Date.now()}`,
            role: "assistant",
            content: caption,
            image_url: imgData.url,
            streaming: false,
          };
          setMessages((prev) => [...prev, imageMsg]);
          void saveMsg({
            data: {
              conversationId: convId,
              role: "assistant",
              content: caption,
              imageUrl: imgData.url,
            },
          }).catch((error) => {
            console.error("[CHAT-SAVE-ASSISTANT] falha ao salvar imagem (fallback):", error);
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
              [...baseMessages, userMsg, imageMsg].map((m) => ({ ...m, streaming: false })),
            );
            navigate({ to: "/c/$conversationId", params: { conversationId: convId } });
          }
          return;
        } catch (fallbackErr) {
          console.error("[CHAT] fallback de imagem falhou:", fallbackErr);
          // Restore the original text reply if image generation failed.
          const restored: ChatMsg = {
            id: assistantId,
            role: "assistant",
            content: finalContent,
            reasoning: reasoningAccum || null,
            streaming: false,
          };
          setMessages((prev) => [...prev, restored]);
        }
      }

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

      if (wantsImage || wantsEdit) {
        if (!isAbort) {
          const errText = "Algo deu errado. Tente novamente.";
          const errMsg: ChatMsg = {
            id: `assistant-error-${Date.now()}`,
            role: "assistant",
            content: errText,
            streaming: false,
          };
          setMessages((prev) => [...prev, errMsg]);
          // Best-effort: save to history if we have a conversation id
          const lastConvId = conversationId ?? lastConversationIdRef.current;
          if (lastConvId) {
            void saveMsg({
              data: { conversationId: lastConvId, role: "assistant", content: errText },
            }).catch(() => undefined);
          }
          notify.error(error instanceof Error ? error.message : errText);
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
  const showError = !!conversationId && messagesError && !hasContent;
  const showEmptyChat =
    !!conversationId &&
    !messagesLoading &&
    !messagesError &&
    !hasContent &&
    Array.isArray(dbMessages) &&
    (dbMessages as ChatMsg[]).length === 0;

  return (
    <CodeCanvasProvider>
      <div className="h-full flex flex-col">
        {showError ? (
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-md mx-auto px-4 py-16 text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar este chat. Tente novamente.
              </p>
              <button
                type="button"
                onClick={() => refetchMessages()}
                className="rounded-md bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : showEmptyChat ? (
          <div className="flex-1 overflow-y-auto">
            <div className="w-full max-w-md mx-auto px-4 py-16 text-center text-sm text-muted-foreground">
              Chat sem mensagens. Envie a primeira mensagem abaixo.
            </div>
          </div>
        ) : showSkeleton ? (
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
              {awaitingReply &&
              !hasStreamingMessage &&
              (inflightMode === "image" || inflightMode === "edit") ? (
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