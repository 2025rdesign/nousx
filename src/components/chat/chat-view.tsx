import { useEffect, useRef, useState } from "react";
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
import { toast } from "sonner";

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

  const { data: dbMessages } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () =>
      conversationId ? fetchMessages({ data: { conversationId } }) : Promise.resolve([]),
    enabled: !!conversationId,
  });

  const [streaming, setStreaming] = useState<ChatMsg | null>(null);
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [optimisticUser, setOptimisticUser] = useState<ChatMsg | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages: ChatMsg[] = (dbMessages as ChatMsg[] | undefined) ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function handleSend(
    text: string,
    image: string | null,
    reasoning: boolean,
    webSearch: boolean = false,
  ) {
    setSending(true);
    const tempUser: ChatMsg = {
      id: `tmp-u-${Date.now()}`,
      role: "user",
      content: text,
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
          content: text,
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

      // Build messages payload
      const history = (
        queryClient.getQueryData<ChatMsg[]>(["messages", convId]) ?? []
      ).map((m) => {
        if (m.role === "user" && m.image_url) {
          return {
            role: "user" as const,
            content: [
              { type: "image_url" as const, image_url: { url: m.image_url } },
              { type: "text" as const, text: m.content },
            ],
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
        body: JSON.stringify({ messages: history, reasoning, webSearch }),
      });
      setAwaitingReply(true);

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
              setStreaming({
                id: "stream",
                role: "assistant",
                content: accum,
                reasoning: reasoningAccum || null,
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
        await rename({ data: { id: convId, title: text.slice(0, 30) } });
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Algo deu errado.");
      setStreaming(null);
      setOptimisticUser(null);
    } finally {
      setSending(false);
      setAwaitingReply(false);
    }
  }

  const hasContent = messages.length > 0 || streaming || optimisticUser;

  return (
    <CodeCanvasProvider>
      <div className="h-full flex flex-col">
        {hasContent ? (
          <div ref={scrollRef as any} className="flex-1 overflow-y-auto">
            <div className="w-full max-w-3xl mx-auto px-3 md:px-4 py-6 space-y-4">
              {messages.map((m) => (
                <MessageItem key={m.id} msg={m} />
              ))}
              {optimisticUser && <MessageItem msg={optimisticUser} />}
              {streaming && streaming.content && <MessageItem msg={streaming} />}
              {awaitingReply && !streaming?.content && <TypingIndicator />}
            </div>
          </div>
        ) : (
          <EmptyState onPick={(s) => handleSend(s, null, false)} />
        )}
        <ChatInput onSend={handleSend} disabled={sending} />
      </div>
    </CodeCanvasProvider>
  );
}