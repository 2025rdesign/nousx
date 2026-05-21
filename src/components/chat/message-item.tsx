import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown, ChevronRight, Copy, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeCanvas } from "./code-canvas";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_url?: string | null;
  reasoning?: string | null;
  streaming?: boolean;
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
            <div
              style={{
                color: "#E0E0F0",
                fontSize: "15px",
                lineHeight: 1.7,
              }}
            >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ node: _n, ...props }) => (
                  <p {...props} style={{ marginBottom: "12px" }} />
                ),
                strong: ({ node: _n, ...props }) => (
                  <strong
                    {...props}
                    style={{ fontWeight: 600, color: "#F0F0FF" }}
                  />
                ),
                h1: ({ node: _n, ...props }) => (
                  <h2
                    {...props}
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      color: "#F0F0FF",
                      margin: "16px 0 6px",
                    }}
                  />
                ),
                h2: ({ node: _n, ...props }) => (
                  <h2
                    {...props}
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "#F0F0FF",
                      margin: "12px 0 4px",
                    }}
                  />
                ),
                h3: ({ node: _n, ...props }) => (
                  <h3
                    {...props}
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#F0F0FF",
                      margin: "10px 0 4px",
                    }}
                  />
                ),
                ul: ({ node: _n, ...props }) => (
                  <ul
                    {...props}
                    style={{
                      listStyle: "disc",
                      paddingLeft: "20px",
                      lineHeight: 1.8,
                      marginBottom: "12px",
                    }}
                  />
                ),
                ol: ({ node: _n, ...props }) => (
                  <ol
                    {...props}
                    style={{
                      listStyle: "decimal",
                      paddingLeft: "20px",
                      lineHeight: 1.8,
                      marginBottom: "12px",
                    }}
                  />
                ),
                li: ({ node: _n, ...props }) => (
                  <li {...props} style={{ marginBottom: "4px" }} />
                ),
                blockquote: ({ node: _n, ...props }) => (
                  <blockquote
                    {...props}
                    style={{
                      borderLeft: "3px solid #2A2A3A",
                      paddingLeft: "12px",
                      color: "#A0A0B8",
                      margin: "12px 0",
                    }}
                  />
                ),
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
            {msg.streaming && (
              <span
                aria-hidden
                className="inline-block w-[2px] h-[1em] align-[-0.15em] ml-[1px] bg-current animate-pulse"
                style={{ background: "#8B6FFF" }}
              />
            )}
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

export function TypingIndicator({ mode = "default" }: { mode?: "default" | "web" | "reasoning" }) {
  if (mode === "web") {
    return (
      <div className="flex justify-start">
        <div
          className="px-4 py-3 text-sm animate-pulse"
          style={{ color: "#6C47FF" }}
        >
          🌐 Buscando na web...
        </div>
      </div>
    );
  }
  if (mode === "reasoning") {
    return (
      <div className="flex justify-start">
        <div
          className="px-4 py-3 text-sm animate-pulse"
          style={{ color: "#6C47FF" }}
        >
          💭 Analisando...
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="px-4 py-3 flex items-center gap-1.5">
        <span className="typing-dot size-2 rounded-full" style={{ background: "#6C47FF" }} />
        <span className="typing-dot size-2 rounded-full" style={{ background: "#6C47FF" }} />
        <span className="typing-dot size-2 rounded-full" style={{ background: "#6C47FF" }} />
      </div>
    </div>
  );
}

function ReasoningBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="my-2 rounded-lg border text-xs"
      style={{ background: "#1C1C26", borderColor: "#2A2A3A", color: "#8888AA" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-2 font-medium"
        style={{ color: "#8888AA", fontSize: "13px" }}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span>💭 Raciocínio</span>
      </button>
      {open && (
        <pre
          className="px-3 pb-3 whitespace-pre-wrap font-sans leading-relaxed italic"
          style={{ color: "#8888AA", fontSize: "13px" }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}