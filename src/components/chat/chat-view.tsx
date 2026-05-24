import { useCallback, useEffect, useRef, useState } from "react";
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
import { useAuth } from "@/hooks/use-auth";
import { getMySubscription } from "@/lib/payments.functions";
import { VoiceModeModal } from "./voice-mode-modal";
import { PlanCheckoutDialog } from "@/components/payments/subscription-tab";
import { getCredits } from "@/lib/credits.functions";
import type { PlanId } from "@/lib/payments-config";
import { getMyVideoJobs } from "@/lib/video-jobs.functions";
import { toast } from "sonner";

const IMAGE_INTENT_RE =
  /\b(ger(?:a|e|ar)|cri(?:a|e|ar)|fa[zç](?:a|er)|desenh(?:a|e|ar)|pint(?:a|e|ar)|me\s+(?:d[áa]|d[êe]|manda|envia)|quero|gostaria(?:\s+de)?|preciso(?:\s+de)?|generate|create|make|draw|render|produce|design|build|illustrate)\b[^\n]{0,30}\b(image(?:m|ns|s)?|fotos?|photos?|pictures?|ilustra[cç](?:[ãa]o|[õo]es)|illustrations?|desenhos?|figuras?|artes?|artworks?|pinturas?|wallpapers?|retratos?|portraits?|p[ôo]ster(?:es)?|posters?|banners?|capas?|covers?|vetor(?:es|ial|iais)?|logos?|logotipos?|[íi]cones?|icons?|stickers?|emojis?|avatares?|avatars?|personagens?|characters?|cenas?|scenes?|gifs?|thumbnails?|miniaturas?)\b([^\n]*)/i;

// Detecta descrições visuais explícitas mesmo sem verbo de geração
// (ex.: "YouTube thumbnail, 1280x720px, minimalist design...").
const VISUAL_DESC_RE =
  /(minimalist|cinematic|photorealistic|hyperrealistic|minimalista|cinematogr[áa]fico|realista|fotorrealista|fundo\s+escuro|dark\s+background|aspect\s+ratio|propor[cç][ãa]o|resolu[cç][ãa]o|resolution|ilumina[cç][ãa]o|lighting|composi[cç][ãa]o|composition|16:9|9:16|1:1|1280\s*[x×]\s*720|1920\s*[x×]\s*1080|thumbnail|wallpaper|poster|banner)/i;

// Intenção de animar/criar vídeo a partir de uma imagem.
const VIDEO_INTENT_RE =
  /(anima(?:r|ç[ãa]o|te|tion)?|faz(?:er)?\s+(?:um\s+)?v[ií]deo|make\s+(?:a\s+)?video|transforma(?:r)?\s+(?:em|pra|para)\s+v[ií]deo|turn\s+(?:into|to)\s+video|dar\s+vida|bring\s+to\s+life|v[ií]deo\s+da\s+(?:imagem|foto)|video\s+(?:of|from)\s+(?:the\s+)?(?:image|photo)|movimento|moving|gif\s+animado|animated)/i;

// Perguntas de STATUS sobre animação em andamento — nunca devem disparar
// nem geração de imagem nem nova animação.
const ANIMATION_STATUS_QUESTION_RE =
  /(terminou|ficou\s+pronto|cad[êe]\s+o\s+v[ií]deo|quanto\s+tempo(?:\s+falta)?|gerou\s+o\s+v[ií]deo|t[áa]\s+pronto|ta\s+pronto|j[áa]\s+(?:ficou|acabou|terminou))/i;

// Intenção de EDITAR uma imagem existente (não apenas analisar).
const IMAGE_EDIT_INTENT_RE =
  /\b(mude|muda|troque|troca|retire|retira|remova|remove|coloque|coloca|adicione|adiciona|altere|altera|edite|edita|tire|tira|bote|bota|ponha|p[oõ]e|deixe|deixa|torne|torna|transform(?:e|a|ar)|transport(?:e|a|ar)|substitua|substitui|inclua|inclui|apague|apaga|melhore|melhora|ajuste|ajusta|refa[cç]a|regenere|aumente|aumenta|diminua|diminui|deixa\s+mais|deixe\s+mais|sem\s+|com\s+|pinte|pinta|colorize)\b/i;

const MIN_DESCRIPTION_CHARS = 15;

// Padrões de PERGUNTA sobre o serviço — nunca devem disparar geração.
const SERVICE_QUESTION_RE =
  /(voc[êe]\s+(gera|cria|faz|consegue|pode|sabe|tem|[ée])|tem\s+(gera[cç][aã]o|gerador)|como\s+(gera|funciona|cria|crio|fa[cç]o)|[ée]\s+(poss[ií]vel|gr[áa]tis|gratuito|pago|pra|para)|qual.*(plano|pre[cç]o|custo|valor)|quanto.*(custa|sai|fica)|o\s+que\s+voc[êe]\s+(faz|[ée]|consegue|pode)|me\s+(conta|explica|fala|diz)\s+(sobre|mais|como)|funciona\s+(como|assim))/i;

const QUESTION_STARTERS_RE =
  /^(voc[êe]|como|o\s+que|qual|quais|quando|onde|por\s+que|porque|consegue|pode|d[áa]\s+pra|tem\s+como|[ée]\s+poss[ií]vel|funciona)\b/i;

const IMAGE_FOLLOW_UP_RE =
  /\b(a\s+mesma|mesm[ao]s?|igual|parecid[ao]s?|fa[cçz](?:a|er|endo)?|faz|deixe|coloque|troque|mude|ajuste|edite|refa[cç]a|regenere|varia[cç][aã]o|vers[aã]o|mais|menos|sem|com|agora|tamb[eé]m|t[áa]|ela|ele|tirando|usando|vestindo|sentad[ao]|deitad[ao]|em\s+p[eé])\b/i;

const VISUAL_EDIT_CUE_RE =
  /\b(mulher|homem|pessoa|modelo|rosto|corpo|cabelo|olhos?|pele|roupa|biqu[ií]ni|lingerie|pose|fundo|cen[aá]rio|praia|areia|luz|ilumina[cç][aã]o|estilo|realista|sensual|sexy|selfie|vertical|story|stories|9:16|16:9|1:1|quadrado|sorrindo|rindo|olhando|mostrando|segurando)\b/i;

function detectImageIntent(text: string): boolean {
  if (!text) return false;
  if (text.length > 800) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1) Não dispara em perguntas (terminam com "?" ou começam interrogativo)
  if (trimmed.endsWith("?")) return false;
  if (QUESTION_STARTERS_RE.test(trimmed)) return false;

  // 2) Não dispara em perguntas sobre o serviço
  if (SERVICE_QUESTION_RE.test(trimmed)) return false;

  // 3) Não dispara em perguntas sobre status de animação em andamento
  if (ANIMATION_STATUS_QUESTION_RE.test(trimmed)) return false;

  const match = IMAGE_INTENT_RE.exec(trimmed);
  if (!match) {
    // Fallback: descrição visual rica sem verbo (ex.: brief de thumbnail).
    if (trimmed.length >= 20 && VISUAL_DESC_RE.test(trimmed)) {
      const visualHits = trimmed.match(/\b\w+\b/g)?.length ?? 0;
      if (visualHits >= 5) return true;
    }
    return false;
  }

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

type ActivePlanSubscription = {
  plan_id?: string | null;
  status?: string | null;
  expires_at?: string | null;
} | null;

type ActivePlanSnapshot = {
  subscription: ActivePlanSubscription;
  hasActive: boolean;
  planId: string | null;
  hasPlusOrUltra: boolean;
  isLoading: boolean;
};

function buildActivePlanSnapshot(
  subscription: ActivePlanSubscription,
  isLoading: boolean,
): ActivePlanSnapshot {
  const hasActive =
    !!subscription &&
    subscription.status === "active" &&
    (!subscription.expires_at || new Date(subscription.expires_at).getTime() > Date.now());
  const planId = subscription?.plan_id ?? null;

  return {
    subscription,
    hasActive,
    planId,
    hasPlusOrUltra: hasActive && (planId === "plus" || planId === "ultra"),
    isLoading,
  };
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
  const { planId, hasActive, subscription, isLoading: planLoading } = useActivePlan();
  const hasUltra = hasActive && planId === "ultra";
  const { user } = useAuth();
  const fetchSubServerFn = useServerFn(getMySubscription);
  const fetchCreditsFn = useServerFn(getCredits);
  const fetchVideoJobs = useServerFn(getMyVideoJobs);

  // Background polling for video-animation jobs. While any job is pending or
  // processing, the query refetches every 5s — each refetch advances the job
  // server-side (see advancePendingVideoJobsForUser). On completion we refresh
  // the chat messages and show a toast.
  const seenCompletedJobsRef = useRef<Set<string>>(new Set());
  const videoJobsQuery = useQuery({
    queryKey: ["video-jobs", "active"],
    queryFn: () => fetchVideoJobs({ data: { statuses: ["pending", "processing"] } }),
    refetchInterval: (q) => {
      const data = q.state.data as { status: string }[] | undefined;
      const hasActive = (data ?? []).some(
        (j) => j.status === "pending" || j.status === "processing",
      );
      return hasActive ? 5000 : false;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
    enabled: false,
  });

  // Animation feature temporarily disabled — no toasts, no polling.
  void videoJobsQuery;
  void seenCompletedJobsRef;

  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    if (!conversationId) return [];
    const cached = queryClient.getQueryData<ChatMsg[]>(["messages", conversationId]);
    return cached ? cached.map((m) => ({ ...m, streaming: false })) : [];
  });
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [inflightMode, setInflightMode] = useState<
    "default" | "web" | "reasoning" | "image" | "edit" | "video" | "plan"
  >("default");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [fillText, setFillText] = useState<string | undefined>();
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);
  const [planRefreshPending, setPlanRefreshPending] = useState(false);
  const latestPlanRef = useRef<ActivePlanSnapshot>(
    buildActivePlanSnapshot(subscription, planLoading),
  );
  const planRefreshPromiseRef = useRef<Promise<ActivePlanSnapshot> | null>(null);

  const refreshActivePlanSnapshot = useCallback(async () => {
    if (!user) {
      const emptySnapshot = buildActivePlanSnapshot(null, false);
      latestPlanRef.current = emptySnapshot;
      return emptySnapshot;
    }

    if (planRefreshPromiseRef.current) return planRefreshPromiseRef.current;

    const pendingSnapshot = buildActivePlanSnapshot(
      latestPlanRef.current.subscription,
      true,
    );
    latestPlanRef.current = pendingSnapshot;
    setPlanRefreshPending(true);

    const refreshPromise = queryClient
      .fetchQuery({
        queryKey: ["my-subscription"],
        queryFn: () => fetchSubServerFn(),
        staleTime: 0,
      })
      .then((fresh) => {
        const snapshot = buildActivePlanSnapshot(fresh ?? null, false);
        latestPlanRef.current = snapshot;
        return snapshot;
      })
      .catch((error) => {
        console.warn("[PLAN CHECK] failed to refetch subscription", error);
        const fallbackSnapshot = buildActivePlanSnapshot(subscription, planLoading);
        latestPlanRef.current = fallbackSnapshot;
        return fallbackSnapshot;
      })
      .finally(() => {
        setPlanRefreshPending(false);
        planRefreshPromiseRef.current = null;
      });

    planRefreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, [fetchSubServerFn, planLoading, queryClient, subscription, user]);

  useEffect(() => {
    latestPlanRef.current = buildActivePlanSnapshot(subscription, planLoading);
  }, [subscription, planLoading]);

  useEffect(() => {
    void refreshActivePlanSnapshot();
  }, [refreshActivePlanSnapshot]);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ planId?: PlanId }>).detail;
      if (detail?.planId === "plus" || detail?.planId === "ultra") {
        setCheckoutPlan(detail.planId);
      }
    }
    window.addEventListener("aura:open-plan-checkout", onOpen as EventListener);
    return () =>
      window.removeEventListener(
        "aura:open-plan-checkout",
        onOpen as EventListener,
      );
  }, []);

  // Listen for "Animar" button clicks on individual chat images.
  // The button lives in MessageItem; it dispatches the image URL it owns
  // so we animate THAT image, not the most recent one.
  useEffect(() => {
    function onAnimate(e: Event) {
      const detail = (e as CustomEvent<{ imageUrl?: string; reset?: () => void }>).detail;
      const url = detail?.imageUrl;
      if (!url) return;
      // Reuse the same flow as the VIDEO_INTENT_RE detection.
      void handleVideoIntent("Animar essa imagem", url, messages, detail?.reset);
    }
    window.addEventListener("aura:animate-image", onAnimate as EventListener);
    return () =>
      window.removeEventListener(
        "aura:animate-image",
        onAnimate as EventListener,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, conversationId, subscription, planId, hasActive]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastConversationIdRef = useRef<string | null>(conversationId);
  const pendingNavigationConversationIdRef = useRef<string | null>(null);
  const hydratedConversationIdRef = useRef<string | null>(conversationId);

  // Sticky reference image: last image available for edit/visual reference.
  // - Set when user uploads a new image, or when the assistant generates/edits one.
  // - PERSISTS across moderation blocks so a retry can reuse the same reference.
  // - Reset only when the conversation changes (new context).
  const stickyImageRefRef = useRef<string | null>(null);

  // ============================================================
  // Centralized error / moderation message helpers.
  // Rules:
  //  - Loading/typing indicator is ALWAYS cleared before the message
  //    appears (resets sending + awaitingReply + inflightMode + 50ms tick).
  //  - Message is persisted to history so the chat is never empty.
  //  - User message is assumed to have been saved by the caller.
  // ============================================================
  async function appendAssistantMessage(opts: {
    convId: string;
    text: string;
    isNew: boolean;
    titleSeed: string;
    baseMessages: ChatMsg[];
    userMsg: ChatMsg;
  }) {
    setSending(false);
    setAwaitingReply(false);
    setInflightMode("default");
    // Micro-delay so React paints the loading-off state before the
    // assistant bubble appears — prevents the "text overlapping skeleton" flash.
    await new Promise((r) => setTimeout(r, 50));
    const msg: ChatMsg = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: opts.text,
      streaming: false,
    };
    setMessages((prev) => [...prev, msg]);
    await saveMsg({
      data: { conversationId: opts.convId, role: "assistant", content: opts.text },
    }).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    if (opts.isNew) {
      try {
        await rename({ data: { id: opts.convId, title: opts.titleSeed.slice(0, 30) } });
      } catch {
        /* ignore */
      }
      queryClient.setQueryData<ChatMsg[]>(
        ["messages", opts.convId],
        [...opts.baseMessages, opts.userMsg, msg].map((m) => ({ ...m, streaming: false })),
      );
      navigate({ to: "/c/$conversationId", params: { conversationId: opts.convId } });
    }
  }

  const MOD_BLOCK_TEXT =
    "✨ Esse conteúdo não passou pelos filtros do chat. " +
    "No **Estúdio AuraIA** você cria sem restrições.\n\n" +
    "[🎨 Ir para o Estúdio](/studio)";
  const ANALYSIS_BLOCK_TEXT =
    "🔍 Não consegui analisar essa imagem pelos filtros de conteúdo. " +
    "Descreva o que quer saber e tento ajudar de outra forma.";
  const PLAN_PLUS_REQUIRED_TEXT =
    "A geração de imagens no chat é exclusiva para assinantes **Plus** e **Ultra**.\n\n" +
    "Para assinar é simples: acesse **Configurações → Assinatura** e escolha o plano **Plus (R$29,90/mês)** ou **Ultra (R$57,90/mês)**. O pagamento é via PIX e a ativação é imediata após o pagamento.\n\n" +
    "[Ir para Assinaturas](/configuracoes?tab=assinatura)";
  const PLAN_ULTRA_REQUIRED_TEXT =
    "A edição de imagens no chat é exclusiva para assinantes **Ultra**. " +
    "Faça upgrade para desbloquear essa função!\n\n[Ver planos](/planos)";
  const NETWORK_ERROR_TEXT =
    "⚡ Algo deu errado na conexão. Tente enviar novamente.";
  const GENERIC_ERROR_TEXT =
    "😕 Algo inesperado aconteceu. Tente novamente.";
  const GENERIC_IMG_ERROR_TEXT =
    "⚡ Algo deu errado na geração. Tente novamente.";
  const VIDEO_NEED_ULTRA_TEXT =
    "🎬 A **animação de imagens** é exclusiva do plano **Ultra**.\n\n" +
    "Com o Ultra (R$57,90/mês) você anima qualquer imagem gerada no chat — 10 segundos de vídeo por apenas 10 créditos.\n\n" +
    "[Assinar Ultra](/configuracoes?tab=assinatura)";
  const VIDEO_NEED_CREDITS_TEXT = (have: number) =>
    `🎬 Você precisa de **10 créditos** para animar uma imagem. Você tem ${have} crédito(s) disponíveis.\n\n[Comprar créditos](/creditos)`;
  const VIDEO_NEED_IMAGE_TEXT =
    "🎬 Para animar, primeiro gere ou edite uma imagem aqui no chat. Depois é só pedir a animação!";
  const VIDEO_GENERIC_ERROR_TEXT =
    "🎬 Não consegui animar a imagem. Seus créditos foram devolvidos. Tente novamente.";

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

  async function handleVideoIntent(
    text: string,
    sourceImageUrl: string | null,
    baseMessages: ChatMsg[],
    resetButton?: () => void,
  ) {
    // ============================================================
    // Animation feature TEMPORARILY DISABLED.
    // Replies with a "coming soon" assistant message — no API call,
    // no credit deduction, no video_jobs row.
    // ============================================================
    void sourceImageUrl;
    resetButton?.();
    setSending(true);
    setAwaitingReply(true);
    setInflightMode("default");

    const timestamp = Date.now();
    const userMsg: ChatMsg = {
      id: `user-${timestamp}`,
      role: "user",
      content: text,
      streaming: false,
    };
    setMessages((prev) => [...prev, userMsg]);

    let convId = conversationId;
    let isNew = false;
    try {
      if (!convId) {
        const conv = await createConv({ data: { title: text.slice(0, 30) } });
        convId = conv.id;
        isNew = true;
        pendingNavigationConversationIdRef.current = convId;
      }
      await saveMsg({
        data: { conversationId: convId, role: "user", content: text },
      }).catch(() => undefined);

      await appendAssistantMessage({
        convId,
        text:
          "A animação de imagens está chegando em breve! Em breve você poderá animar qualquer imagem gerada no chat. Fique ligado nas novidades. 🎬",
        isNew,
        titleSeed: text,
        baseMessages,
        userMsg,
      });
    } catch (e) {
      console.error("[VIDEO disabled] failed", e);
    } finally {
      setSending(false);
      setAwaitingReply(false);
      setInflightMode("default");
    }
  }

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

    // ============================================================
    // VIDEO ANIMATION GATE (Ultra-only, 10 credits, image required)
    // Runs before any other intent detection. Hard-returns on each
    // branch so DeepSeek / image generation never fires for "anime
    // essa imagem" type requests.
    // ============================================================
    if (!file && VIDEO_INTENT_RE.test(text)) {
      // Ignore status questions like "terminou?" — the chat AI will answer them
      // instead of firing a new animation.
      if (ANIMATION_STATUS_QUESTION_RE.test(text)) {
        // fall through to normal chat handling
      } else {
      await handleVideoIntent(text, null, baseMessages);
      return;
      }
    }

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
          await appendAssistantMessage({
            convId,
            text: PLAN_ULTRA_REQUIRED_TEXT,
            isNew,
            titleSeed: text,
            baseMessages,
            userMsg,
          });
          return;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Falha ao editar imagem." }));
          if (res.status === 422 && (err.code === "moderation" || err.error === "content_moderation")) {
            await appendAssistantMessage({
              convId,
              text: MOD_BLOCK_TEXT,
              isNew,
              titleSeed: text,
              baseMessages,
              userMsg,
            });
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
        stickyImageRefRef.current = data.url;
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

        let gateSnapshot = latestPlanRef.current;
        if (gateSnapshot.isLoading || !gateSnapshot.subscription) {
          setInflightMode("plan");
          gateSnapshot = await refreshActivePlanSnapshot();
          setInflightMode("image");
        }

        const hasPlusOrUltra = gateSnapshot.hasPlusOrUltra;

        console.log("[GATE DEBUG]", {
          hasPlusOrUltra,
          subscriptionLoading: gateSnapshot.isLoading,
          effectiveHasActive: gateSnapshot.hasActive,
          effectivePlanId: gateSnapshot.planId,
          subscriptionData: JSON.stringify(gateSnapshot.subscription),
          rawHasActive: hasActive,
          rawPlanId: planId,
          userId: user?.id,
        });
        console.log("[GATE FINAL]", {
          hasPlusOrUltra,
          isLoading: gateSnapshot.isLoading,
          planId: gateSnapshot.subscription?.plan_id ?? null,
          wantsImage,
        });

        if (!hasPlusOrUltra) {
          await appendAssistantMessage({
            convId,
            text: PLAN_PLUS_REQUIRED_TEXT,
            isNew,
            titleSeed: text,
            baseMessages,
            userMsg,
          });
          return;
        }

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
          await appendAssistantMessage({
            convId,
            text: PLAN_PLUS_REQUIRED_TEXT,
            isNew,
            titleSeed: text,
            baseMessages,
            userMsg,
          });
          return;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Falha ao gerar imagem." }));
          if (res.status === 422 && (err.code === "moderation" || err.error === "content_moderation")) {
            // Reset image-intent context completely: a próxima mensagem
            // do usuário deve ser avaliada do zero, sem herdar nada.
            stickyImageRefRef.current = null;
            await appendAssistantMessage({
              convId,
              text: MOD_BLOCK_TEXT,
              isNew,
              titleSeed: text,
              baseMessages,
              userMsg,
            });
            return;
          }
          stickyImageRefRef.current = null;
          throw new Error("__IMG_GENERIC__");
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
        stickyImageRefRef.current = data.url;
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

      const chatPayload = JSON.stringify({
        messages: history,
        reasoning,
        webSearch,
        hasFile: !!file,
      });
      const doChatFetch = () =>
        fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: chatPayload,
        });
      let res: Response;
      try {
        res = await doChatFetch();
        // Retry once on transient 5xx (excluding 502 moderation/upstream errors with details)
        if (!res.ok && res.status >= 500) {
          console.warn("[CHAT-RETRY] status", res.status, "— tentando novamente");
          await new Promise((r) => setTimeout(r, 500));
          res = await doChatFetch();
        }
      } catch (netErr) {
        console.warn("[CHAT-RETRY] erro de rede, tentando novamente:", netErr);
        await new Promise((r) => setTimeout(r, 500));
        res = await doChatFetch();
      }

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
      let analysisBlocked = false;

      const stallController = new AbortController();
      const stallTimer = setTimeout(() => {
        if (!gotFirstChunk) {
          console.error("[CHAT-ERROR] timeout: nenhum chunk em 30s");
          stallController.abort();
          try {
            reader.cancel();
          } catch {
            /* ignore */
          }
        }
      }, 30000);

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
          if (json?.lovable_block === "analysis") {
            analysisBlocked = true;
            return;
          }
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

      // Stream may have closed early. If we received nothing at all, treat as failure.
      // If we got partial content, keep what we have instead of discarding.
      if (!gotFirstChunk && stallController.signal.aborted) {
        throw new Error("A resposta demorou muito. Tente novamente.");
      }

      const tail = decoder.decode();
      if (tail) buffer += tail;
      if (buffer.trim().startsWith("data:")) {
        processPayload(buffer.trim().slice(5).trim());
      }

      const finalContent = accum || GENERIC_ERROR_TEXT;

      // Gemini blocked image/file analysis by safety filters — show the
      // friendly analysis-block message instead of the silent fallback.
      if (analysisBlocked && !accum.trim()) {
        // Drop the empty streaming placeholder before the helper appends
        // the friendly message — avoids a flashing empty bubble.
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        await appendAssistantMessage({
          convId,
          text: ANALYSIS_BLOCK_TEXT,
          isNew,
          titleSeed: text,
          baseMessages,
          userMsg,
        });
        return;
      }

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
          stickyImageRefRef.current = imgData.url;
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

      // Never expose technical errors / provider names to the user.
      const isImgGeneric =
        error instanceof Error && error.message === "__IMG_GENERIC__";
      const friendlyText = isAbort
        ? NETWORK_ERROR_TEXT
        : isImgGeneric || (wantsImage && !isAbort)
        ? GENERIC_IMG_ERROR_TEXT
        : GENERIC_ERROR_TEXT;
      const lastConvId = conversationId ?? lastConversationIdRef.current;

      if (wantsImage || wantsEdit) {
        if (!isAbort) {
          setSending(false);
          setAwaitingReply(false);
          setInflightMode("default");
          await new Promise((r) => setTimeout(r, 50));
          const errMsg: ChatMsg = {
            id: `assistant-error-${Date.now()}`,
            role: "assistant",
            content: friendlyText,
            streaming: false,
          };
          setMessages((prev) => [...prev, errMsg]);
          if (lastConvId) {
            void saveMsg({
              data: { conversationId: lastConvId, role: "assistant", content: friendlyText },
            }).catch(() => undefined);
          }
        }
      } else {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, content: friendlyText, streaming: false }
              : message,
          ),
        );
        if (!isAbort && lastConvId) {
          void saveMsg({
            data: { conversationId: lastConvId, role: "assistant", content: friendlyText },
          }).catch(() => undefined);
        }
      }
    } finally {
      setSending(false);
      setAwaitingReply(false);
      setInflightMode("default");
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
              (inflightMode === "image" ||
                inflightMode === "edit" ||
                inflightMode === "video" ||
                inflightMode === "plan") ? (
                <TypingIndicator mode={inflightMode} />
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState onSuggest={setFillText} />
        )}

        <ChatInput
          onSend={handleSend}
          disabled={sending || planLoading}
          hasUltra={hasUltra}
          onOpenVoiceMode={() => setVoiceOpen(true)}
          voiceModeActive={voiceOpen}
          fillText={fillText}
          onFillTextConsumed={() => setFillText(undefined)}
          sendButtonLabel={planLoading ? "Plano..." : undefined}
        />
        <VoiceModeModal open={voiceOpen} onClose={() => setVoiceOpen(false)} />
        {checkoutPlan && (
          <PlanCheckoutDialog
            planId={checkoutPlan}
            open={!!checkoutPlan}
            onOpenChange={(v) => !v && setCheckoutPlan(null)}
          />
        )}
      </div>
    </CodeCanvasProvider>
  );
}