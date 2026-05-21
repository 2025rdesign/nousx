import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_url?: string | null;
}

function MessageItemInner({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn("w-full flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border text-foreground",
        )}
      >
        {msg.image_url && (
          <img
            src={msg.image_url}
            alt=""
            className="rounded-lg mb-2 max-h-72 object-cover"
          />
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-popover prose-pre:text-foreground prose-code:text-accent prose-a:text-accent">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content || "​"}
            </ReactMarkdown>
          </div>
        )}
        {!isUser && msg.content && (
          <button
            type="button"
            onClick={onCopy}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <>
                <Check className="size-3" /> Copiado
              </>
            ) : (
              <>
                <Copy className="size-3" /> Copiar
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export const MessageItem = memo(MessageItemInner);

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-1.5">
        <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
        <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
        <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
      </div>
    </div>
  );
}