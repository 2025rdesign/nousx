import { toast } from "sonner";

/**
 * Friendly user-facing error notifier.
 * Translates technical errors into simple, warm messages.
 * Use `notify.error(input, fallback?)` everywhere instead of `toast.error(...)`.
 */

function extractText(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (input instanceof Error) return input.message;
  if (typeof input === "object" && "message" in (input as any)) {
    return String((input as any).message ?? "");
  }
  try {
    return String(input);
  } catch {
    return "";
  }
}

function friendlyMessage(raw: string, fallback?: string): string {
  const m = raw.toLowerCase();

  // Network / offline
  if (
    typeof navigator !== "undefined" &&
    "onLine" in navigator &&
    navigator.onLine === false
  ) {
    return "Sem conexão com a internet 📡";
  }
  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network error") ||
    m.includes("err_internet") ||
    m.includes("err_network") ||
    m.includes("load failed")
  ) {
    return "Sem conexão com a internet 📡";
  }

  // Auth / session
  if (
    m.includes("unauthorized") ||
    m.includes("não autorizado") ||
    m.includes("sessão") ||
    m.includes("session") ||
    m.includes("jwt") ||
    m.includes("401")
  ) {
    return "Sua sessão expirou, entra de novo 🔑";
  }

  // Image generation / vision
  if (
    m.includes("imagem") ||
    m.includes("image") ||
    m.includes("vision") ||
    m.includes("png") ||
    m.includes("jpg") ||
    m.includes("jpeg")
  ) {
    if (m.includes("muito grande") || m.includes("too large") || m.includes("size")) {
      return "Imagem muito pesada, tenta uma menor 📷";
    }
    if (m.includes("formato") || m.includes("format") || m.includes("unsupported")) {
      return "Formato de imagem não suportado 📷";
    }
    return "Não consegui gerar a imagem agora 😕";
  }

  // Rate limit
  if (m.includes("rate") || m.includes("429") || m.includes("too many")) {
    return "Calma aí, muitas requisições — tenta em alguns segundos ⏳";
  }

  // Credits
  if (m.includes("crédito") || m.includes("credit") || m.includes("saldo")) {
    return "Você ficou sem créditos 💳";
  }

  // Timeout
  if (m.includes("timeout") || m.includes("aborted") || m.includes("timed out")) {
    return "Demorou demais pra responder, tenta de novo ⏱";
  }

  // Server
  if (
    m.includes("500") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("internal server")
  ) {
    return "O servidor tá com soluço, tenta de novo 😕";
  }

  // Friendly Portuguese already? Keep it if short and clean.
  if (raw && raw.length > 0 && raw.length < 120 && !/[<>{}\[\]]|http/i.test(raw)) {
    return raw;
  }

  return fallback ?? "Algo deu errado, tenta de novo 😕";
}

export const notify = {
  error(input?: unknown, fallback?: string) {
    const raw = extractText(input);
    const msg = friendlyMessage(raw, fallback);
    toast.error(msg);
  },
  success(message: string) {
    toast.success(message);
  },
  info(message: string) {
    toast(message);
  },
};

// Global capture: any uncaught error / rejection becomes a friendly toast.
if (typeof window !== "undefined") {
  const w = window as Window & { __nousxNotifyHooked?: boolean };
  if (!w.__nousxNotifyHooked) {
    w.__nousxNotifyHooked = true;
    window.addEventListener("error", (e) => {
      const err = (e as ErrorEvent).error ?? (e as ErrorEvent).message;
      notify.error(err);
    });
    window.addEventListener("unhandledrejection", (e) => {
      notify.error((e as PromiseRejectionEvent).reason);
    });
    window.addEventListener("offline", () => {
      toast.error("Sem conexão com a internet 📡");
    });
  }
}