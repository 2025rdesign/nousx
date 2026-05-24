import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Film,
  Loader2,
  PanelRightOpen,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeCanvas } from "./code-canvas";
import { ImageLightbox } from "./image-lightbox";
import { supabase } from "@/integrations/supabase/client";
import { useActivePlan } from "@/hooks/use-active-plan";
import { audioPlayerStore } from "./audio-player-store";
import { notify } from "@/lib/notify";
import { downloadAsset } from "@/lib/download";
import { Link as RouterLink } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCredits } from "@/lib/credits.functions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  image_url?: string | null;
  reasoning?: string | null;
  streaming?: boolean;
}

function getInlineImageUrl(content: string): string | null {
  if (!content) return null;
  const m = content.match(/https?:\/\/[^\s)]+\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s)]*)?/i);
  return m ? m[0] : null;
}

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

function AnimateButton({
  imageUrl: _imageUrl,
  hasUltra,
  credits,
  animating,
  onClick,
}: {
  imageUrl: string;
  hasUltra: boolean;
  credits: number;
  animating: boolean;
  onClick: () => void;
}) {
  const disabled = !hasUltra || credits < 10 || animating;
  const reason = !hasUltra
    ? "Disponível apenas no plano Ultra"
    : credits < 10
      ? `Você precisa de 10 créditos (tem ${credits})`
      : "";
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "ml-3 inline-flex items-center gap-1 text-[11px] transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/50"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {animating ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Film className="size-3" />
      )}
      {animating ? "Animando..." : "Animar — 10 créditos"}
    </button>
  );
  if (!reason) return button;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MessageItemInner({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const { open: openCanvas } = useCodeCanvas();
  const { hasActive, planId } = useActivePlan();
  const hasUltra = hasActive && planId === "ultra";
  const fetchCreditsFn = useServerFn(getCredits);
  const { data: creditsData } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCreditsFn(),
    enabled: !isUser,
    staleTime: 30_000,
  });
  const credits = creditsData?.balance ?? 0;
  const imageUrl = msg.image_url ?? getInlineImageUrl(msg.content);
  const isVideo = isVideoUrl(imageUrl);
  // Quando a mensagem da IA contém uma imagem, descartamos qualquer texto
  // residual gerado pela API (ex.: "Aqui está a imagem de..."). O botão
  // "Baixar imagem" já é exibido abaixo, então a bolha não precisa de legenda.
  const textContent = imageUrl
    ? isUser
      ? msg.content.replace(imageUrl, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim()
      : isVideo
        ? msg.content
        : ""
    : msg.content;

  if (imageUrl && !isUser) {
    console.log("[IMG 5] renderizando", { messageId: msg.id, imageUrl });
  }

  const onCopy = async () => {
    await navigator.clipboard.writeText(textContent || msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onPlayAudio = async () => {
    if (!hasActive || loadingAudio || msg.streaming) return;
    const text = (textContent || msg.content || "").trim();
    if (!text) return;
    setLoadingAudio(true);
    audioPlayerStore.showLoading(msg.id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        notify.error("Sessão expirada. Faça login novamente.");
        return;
      }
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (res.status === 403) {
        notify.error("Disponível no plano Plus ou Ultra.");
        return;
      }
      if (!res.ok) {
        notify.error("Falha ao gerar áudio.");
        return;
      }
      if (res.headers.get("X-Truncated") === "1") {
        notify.error("Áudio gerado para os primeiros 4000 caracteres.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioPlayerStore.open(msg.id, url);
    } catch (err) {
      console.error("[TTS]", err);
      notify.error("Falha ao gerar áudio.");
    } finally {
      setLoadingAudio(false);
    }
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
        {imageUrl && (
          isVideo ? (
            <div className="mb-2">
              <video
                src={imageUrl}
                controls
                autoPlay
                muted
                loop
                playsInline
                className="h-auto w-full max-w-[500px] rounded-xl bg-black"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    downloadAsset(imageUrl, `auraia-video-${Date.now()}.mp4`)
                  }
                  className="inline-flex text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Baixar vídeo
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(imageUrl);
                      notify.success("Link copiado.");
                    } catch {
                      notify.error("Não foi possível copiar o link.");
                    }
                  }}
                  className="inline-flex text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Copiar link
                </button>
              </div>
            </div>
          ) : isUser ? (
            <img
              src={imageUrl}
              alt=""
              onClick={() => setLightboxOpen(true)}
              className="mb-2 h-auto w-full max-w-[500px] rounded-xl object-contain cursor-zoom-in transition-opacity hover:opacity-90"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="mb-2">
              <img
                src={imageUrl}
                alt={textContent || "Imagem gerada no chat"}
                onClick={() => setLightboxOpen(true)}
                className="h-auto w-full max-w-[500px] rounded-xl object-contain cursor-zoom-in transition-opacity hover:opacity-90"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <button
                type="button"
                onClick={() =>
                  downloadAsset(imageUrl, `auraia-chat-${Date.now()}.jpg`)
                }
                className="mt-2 inline-flex text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Baixar imagem
              </button>
              <AnimateButton
                imageUrl={imageUrl}
                hasUltra={hasUltra}
                credits={credits}
                animating={animating}
                onClick={() => {
                  if (!hasUltra || credits < 10 || animating) return;
                  setAnimating(true);
                  window.dispatchEvent(
                    new CustomEvent("aura:animate-image", {
                      detail: { imageUrl },
                    }),
                  );
                  // Re-enable after a few seconds so user can retry if dispatch failed silently.
                  setTimeout(() => setAnimating(false), 8000);
                }}
              />
            </div>
          )
        )}
        {imageUrl && !isVideo && (
          <ImageLightbox
            src={imageUrl}
            alt={textContent || "Imagem"}
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
          />
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{textContent}</p>
        ) : (
          <>
            {msg.reasoning && <ReasoningBlock text={msg.reasoning} />}
            {(textContent || msg.streaming) && (
            <div
              className="text-foreground"
              style={{
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
                    className="text-foreground"
                    style={{ fontWeight: 600 }}
                  />
                ),
                h1: ({ node: _n, ...props }) => (
                  <h2
                    {...props}
                    className="text-foreground"
                    style={{
                      fontSize: "18px",
                      fontWeight: 600,
                      margin: "16px 0 6px",
                    }}
                  />
                ),
                h2: ({ node: _n, ...props }) => (
                  <h2
                    {...props}
                    className="text-foreground"
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      margin: "12px 0 4px",
                    }}
                  />
                ),
                h3: ({ node: _n, ...props }) => (
                  <h3
                    {...props}
                    className="text-foreground"
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
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
                    className="text-muted-foreground border-border"
                    style={{
                      borderLeftWidth: "3px",
                      borderLeftStyle: "solid",
                      paddingLeft: "12px",
                      margin: "12px 0",
                    }}
                  />
                ),
                a: ({ node: _n, href, children, ...props }: any) => {
                  const isInternal =
                    typeof href === "string" && href.startsWith("/");
                  const checkoutMatch =
                    typeof href === "string"
                      ? href.match(/^aura:\/\/checkout\/(plus|ultra)$/)
                      : null;
                  if (checkoutMatch) {
                    const planId = checkoutMatch[1];
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent("aura:open-plan-checkout", {
                              detail: { planId },
                            }),
                          )
                        }
                        className="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-md bg-[#6C47FF] px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#5A38E0] no-underline"
                      >
                        {children}
                      </button>
                    );
                  }
                  const isPlansCta =
                    href === "/planos" ||
                    (Array.isArray(children) &&
                      typeof children[0] === "string" &&
                      /ver\s+planos/i.test(children[0]));
                  if (isInternal && isPlansCta) {
                    return (
                      <RouterLink
                        to="/planos"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#6C47FF] px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#5A38E0] no-underline"
                      >
                        {children}
                      </RouterLink>
                    );
                  }
                  const isSettingsSubscriptionCta =
                    typeof href === "string" &&
                    href.startsWith("/configuracoes") &&
                    /tab=assinatura/.test(href);
                  if (isSettingsSubscriptionCta) {
                    return (
                      <RouterLink
                        to="/configuracoes"
                        search={{ tab: "assinatura" as const }}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#6C47FF] px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#5A38E0] no-underline"
                      >
                        {children}
                      </RouterLink>
                    );
                  }
                  if (isInternal) {
                    return (
                      <RouterLink
                        to={href}
                        className="text-primary underline"
                      >
                        {children}
                      </RouterLink>
                    );
                  }
                  return (
                    <a
                      {...props}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {children}
                    </a>
                  );
                },
                table: ({ node: _n, ...props }) => (
                  <div
                    className="my-3 overflow-x-auto rounded-md border bg-muted/30 border-border"
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
                        className="px-1.5 py-0.5 rounded text-[0.85em] bg-muted border border-border"
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <div
                      className="my-3 rounded-lg overflow-hidden border bg-muted/40 border-border"
                    >
                      <div
                        className="flex items-center justify-between px-3 py-1.5 border-b border-border text-[11px] text-muted-foreground"
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
              {textContent || ""}
            </ReactMarkdown>
            {msg.streaming && (
              <span aria-hidden className="stream-cursor" />
            )}
            </div>
            )}
          </>
        )}
        {!isUser && textContent && (
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
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
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onPlayAudio}
                    disabled={!hasActive || loadingAudio || !!msg.streaming}
                    aria-label="Ouvir resposta"
                    className={cn(
                      "inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors",
                      hasActive
                        ? "hover:text-foreground"
                        : "cursor-not-allowed",
                    )}
                    style={hasActive ? undefined : { opacity: 0.4 }}
                  >
                    {loadingAudio ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Volume2 className="size-3" />
                    )}
                    <span className="hidden sm:inline">Ouvir</span>
                  </button>
                </TooltipTrigger>
                {!hasActive && (
                  <TooltipContent side="top">
                    Disponível no plano Plus ou Ultra
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageItem = memo(
  MessageItemInner,
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.content === next.msg.content &&
    prev.msg.reasoning === next.msg.reasoning &&
    prev.msg.streaming === next.msg.streaming &&
    prev.msg.image_url === next.msg.image_url &&
    prev.msg.role === next.msg.role,
);

export function TypingIndicator({
  mode = "default",
}: {
  mode?: "default" | "web" | "reasoning" | "image" | "edit";
}) {
  if (mode === "edit") {
    return (
      <div className="flex justify-start w-full">
        <div className="px-4 w-full max-w-sm">
          <div
            className="rounded-2xl border border-border animate-pulse"
            style={{
              aspectRatio: "1 / 1",
              background:
                "linear-gradient(135deg, #1C1C26 0%, #2A2A3A 50%, #1C1C26 100%)",
            }}
          />
          <div className="mt-2 text-xs animate-pulse" style={{ color: "#6C47FF" }}>
            🪄 Editando sua imagem...
          </div>
        </div>
      </div>
    );
  }
  if (mode === "image") {
    return (
      <div className="flex justify-start w-full">
        <div className="px-4 w-full max-w-sm">
          <div
            className="rounded-2xl border border-border animate-pulse"
            style={{
              aspectRatio: "1 / 1",
              background:
                "linear-gradient(135deg, #1C1C26 0%, #2A2A3A 50%, #1C1C26 100%)",
            }}
          />
        </div>
      </div>
    );
  }
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