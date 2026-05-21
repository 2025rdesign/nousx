import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeCanvas } from "./code-canvas";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_url?: string | null;
  reasoning?: string | null;
}

function MessageItemInner({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const { open: openCanvas } = useCodeCanvas();

  const onCopy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn("w-full flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "text-sm",
          isUser
            ? "max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 bg-primary text-primary-foreground"
            : "w-full px-4 text-foreground",
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
          <>
            {msg.reasoning && <ReasoningBlock text={msg.reasoning} />}
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:p-0 prose-pre:bg-transparent">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node: _n, ...props }) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#8B6FFF", textDecoration: "underline" }}
                  />
                ),
                table: ({ node: _n, ...props }) => (
                  <div
                    className="my-3 overflow-x-auto rounded-md border"
                    style={{ background: "#13131A", borderColor: "#2A2A3A" }}
                  >
                    <table {...props} className="w-full text-xs" />
                  </div>
                ),
                code: ({ node: _n, inline, className, children, ...props }: any) => {
                  const match = /language-(\w+)/.exec(className || "");
                  const lang = match?.[1] ?? "";
                  const codeText = String(children).replace(/\n$/, "");
                  if (inline || !codeText.includes("\n")) {
                    return (
                      <code
                        {...props}
                        className="px-1.5 py-0.5 rounded text-[0.85em]"
                        style={{ background: "#13131A", border: "1px solid #2A2A3A" }}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <div
                      className="my-3 rounded-lg overflow-hidden border"
                      style={{ background: "#13131A", borderColor: "#2A2A3A" }}
                    >
                      <div
                        className="flex items-center justify-between px-3 py-1.5 border-b text-[11px] text-muted-foreground"
                        style={{ borderColor: "#2A2A3A" }}
                      >
                        <span className="font-mono">{lang || "code"}</span>
                        <button
                          type="button"
                          onClick={() => openCanvas({ code: codeText, language: lang })}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          <PanelRightOpen className="size-3" />
                          Abrir no Canvas
                        </button>
                      </div>
                      <pre className="m-0 p-3 overflow-x-auto text-xs leading-relaxed">
                        <code className={className}>{codeText}</code>
                      </pre>
                    </div>
                  );
                },
              }}
            >
              {msg.content || "​"}
            </ReactMarkdown>
            </div>
          </>
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