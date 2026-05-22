import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
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

const IMAGE_VERBS_RE =
  /\b(ger(a|e|ar|ando)|cri(a|e|ar|ando|e\-?me)|fa[zç](a|e|er|endo)|desenh(a|e|ar|ando)|imagin(a|e|ar)|pint(a|e|ar)|render(iz)?(a|e|ar)?|design(a|e|ar)?|monta(r|e)?|produz(a|ir)|mostr(a|e|ar)|me\s+(d[êe]|d[áa]|mostr[ae])|quero|preciso|gostaria(\s+de)?)\b/i;
const IMAGE_NOUNS_RE =
  /\b(imagens?|fotos?|figuras?|desenhos?|ilustra[cç][aã]o(es)?|artes?|pinturas?|wallpapers?|capas?|logos?|logotipos?|[íi]cones?|avatares?|retratos?|posters?|p[ôo]steres?|render(s|iza[cç][aã]o)?|thumbs?|miniaturas?|cartazes?|banners?)\b/i;
const IMAGE_STANDALONE_RE =
  /^\s*(uma?|umas?)\s+(imagens?|fotos?|figuras?|desenhos?|ilustra[cç][aã]o(es)?|artes?|pinturas?|wallpapers?|capas?|logos?|logotipos?|[íi]cones?|avatares?|retratos?|posters?|p[ôo]steres?)\s+(de|do|da|dos|das|com|em|sobre)\b/i;

function detectImageIntent(text: string): boolean {
  if (!text) return false;
  if (text.length > 800) return false;
  const t = text.trim();
  if (!t) return false;
  // Verb + image noun anywhere in the message
  if (IMAGE_NOUNS_RE.test(t) && IMAGE_VERBS_RE.test(t)) return true;
  // Or starts with "uma imagem de ..."
  if (IMAGE_STANDALONE_RE.test(t)) return true;
  return false;
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: ChatMsg[] = (dbMessages as ChatMsg[] | undefined) ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function handleSend(
    text: string,
    image: string | null,
    file: ExtractedFile | null,
    reasoning: boolean,
    webSearch: boolean = false,
  ) {
    setSending(true);
    const wantsImage = !image && !file && detectImageIntent(text);
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
        if (res.status === 402) {
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
        const data = (await res.json()) as { url: string };
        await saveMsg({
          data: {
            conversationId: convId,
            role: "assistant",
            content: "Aqui está sua imagem ✨",
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
      setStreaming({ id: "stream", role: "assistant", content: "" });

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
              {streaming && streaming.content && <MessageItem msg={streaming} />}
              {awaitingReply && !streaming?.content && <TypingIndicator mode={inflightMode} />}
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
        <ChatInput onSend={handleSend} disabled={sending} />
      </div>
    </CodeCanvasProvider>
  );
}