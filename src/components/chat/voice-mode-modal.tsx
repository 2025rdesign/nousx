import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, SkipForward, X, Loader2 } from "lucide-react";
import type { VoiceSession, VoiceState, VoiceTurn } from "@/lib/voice-session";

interface Props {
  open: boolean;
  onClose: (summary?: string) => void;
}

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Pronto",
  connecting: "Conectando...",
  listening: "Ouvindo...",
  processing: "AuraIA está pensando...",
  speaking: "AuraIA falando...",
  error: "Algo deu errado",
};

export function VoiceModeModal({ open, onClose }: Props) {
  const sessionRef = useRef<VoiceSession | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const [state, setState] = useState<VoiceState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [history, setHistory] = useState<VoiceTurn[]>([]);
  const [bars, setBars] = useState<number[]>(() => Array(20).fill(0));

  const startSession = useCallback(async () => {
    if (typeof window === "undefined" || !mountedRef.current) return;

    try {
      const { VoiceSession } = await import("@/lib/voice-session");
      if (!mountedRef.current) return;

      const session = new VoiceSession({
        state: (s) => {
          if (!mountedRef.current) return;
          setState(s);
        },
        error: (message) => {
          if (!mountedRef.current) return;
          setError(message);
        },
        userTranscript: (text) => {
          if (!mountedRef.current) return;
          setUserText(text);
        },
        assistantTranscript: (text) => {
          if (!mountedRef.current) return;
          setAssistantText(text);
        },
        turn: (turn) => {
          if (!mountedRef.current) return;
          setHistory((prev) => [...prev, turn].slice(-4));
          if (turn.role === "user") setUserText("");
          if (turn.role === "assistant") setAssistantText("");
        },
        analyser: (node) => {
          if (!mountedRef.current) return;
          analyserRef.current = node;
        },
      });

      const previousSession = sessionRef.current;
      sessionRef.current = session;
      setState("connecting");
      setError(null);

      if (previousSession) {
        await previousSession.close();
      }

      if (!mountedRef.current) {
        await session.close();
        return;
      }

      await session.start();
    } catch (err) {
      console.error("[VOICE] modal start error", err);
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Falha ao iniciar modo de voz.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    mountedRef.current = true;
    void startSession();

    return () => {
      mountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      analyserRef.current = null;
      if (activeSession) {
        void activeSession.close();
      }
    };
  }, [open, startSession]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const tick = () => {
      const an = analyserRef.current;
      if (an) {
        const data = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data);
        const out: number[] = [];
        const step = Math.max(1, Math.floor(data.length / 20));
        for (let i = 0; i < 20; i++) {
          const v = data[i * step] ?? 0;
          out.push(v / 255);
        }
        setBars(out);
      } else {
        setBars((prev) => prev.map((v) => v * 0.85));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  function handleEnd() {
    void sessionRef.current?.close();
    const summary = buildSummary([
      ...history,
      ...(userText ? [{ role: "user" as const, text: userText }] : []),
      ...(assistantText ? [{ role: "assistant" as const, text: assistantText }] : []),
    ]);
    onClose(summary || undefined);
  }

  function handleRetry() {
    setError(null);
    setHistory([]);
    setUserText("");
    setAssistantText("");
    void startSession();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    sessionRef.current?.setMuted(next);
  }

  function handleSkip() {
    sessionRef.current?.skip();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4">
      <div
        className="relative w-full h-full md:h-auto md:max-w-[480px] md:rounded-2xl flex flex-col"
        style={{
          background: "#0A0A0F",
          border: "1px solid rgba(108,71,255,0.25)",
          boxShadow: "0 0 60px rgba(108,71,255,0.15)",
        }}
      >
        <button
          type="button"
          onClick={handleEnd}
          aria-label="Fechar"
          className="absolute top-4 right-4 text-white/60 hover:text-white"
        >
          <X className="size-5" />
        </button>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-4">
          <div className="relative size-[160px] flex items-center justify-center">
            <Circle state={state} />
          </div>

          <p className="mt-6 text-white text-base font-medium tracking-tight">
            {error ? error : STATE_LABEL[state]}
          </p>

          {state === "listening" && (
            <div className="mt-6 flex items-end gap-[3px] h-[48px]">
              {bars.map((v, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full"
                  style={{
                    height: `${Math.max(4, v * 48)}px`,
                    background: "#6C47FF",
                    transition: "height 80ms linear",
                  }}
                />
              ))}
            </div>
          )}

          {state === "error" && (
            <button
              type="button"
              onClick={handleRetry}
              className="mt-6 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#6C47FF" }}
            >
              Tentar novamente
            </button>
          )}
        </div>

        <div className="px-6 pb-2 min-h-[100px] max-h-[180px] overflow-y-auto space-y-2">
          {history.slice(-2).map((t, i) => (
            <div key={i} className="text-xs text-white/50 leading-relaxed">
              <span className="text-white/40 mr-1">
                {t.role === "user" ? "Você:" : "AuraIA:"}
              </span>
              {t.text}
            </div>
          ))}
          {userText && (
            <div className="text-xs text-white/70 leading-relaxed">
              <span className="text-white/40 mr-1">Você:</span>
              {userText}
            </div>
          )}
          {assistantText && (
            <div className="text-xs text-white leading-relaxed">
              <span className="text-white/40 mr-1">AuraIA:</span>
              {assistantText}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Ativar microfone" : "Silenciar"}
            className="size-10 rounded-full flex items-center justify-center text-white"
            style={{
              background: muted ? "rgba(255,255,255,0.08)" : "rgba(108,71,255,0.15)",
              border: "1px solid rgba(108,71,255,0.35)",
            }}
          >
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={state !== "speaking"}
            aria-label="Interromper"
            className="size-10 rounded-full flex items-center justify-center text-white disabled:opacity-30"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <SkipForward className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleEnd}
            className="px-5 h-10 rounded-full text-sm font-medium text-white"
            style={{ background: "#E03A4A" }}
          >
            Encerrar conversa
          </button>
        </div>
      </div>
    </div>
  );
}

function Circle({ state }: { state: VoiceState }) {
  const isError = state === "error";
  const color = isError ? "#E03A4A" : "#6C47FF";
  return (
    <>
      {state === "listening" && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              border: `2px solid ${color}`,
              opacity: 0.4,
              animation: "voice-wave 1.8s ease-out infinite",
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              border: `2px solid ${color}`,
              opacity: 0.25,
              animation: "voice-wave 1.8s ease-out infinite 0.6s",
            }}
          />
        </>
      )}
      {state === "speaking" && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${color}55 0%, transparent 70%)`,
            animation: "voice-pulse 1.2s ease-in-out infinite",
          }}
        />
      )}
      <div
        className="size-[120px] rounded-full flex items-center justify-center relative"
        style={{
          background: `radial-gradient(circle, ${color}33 0%, ${color}11 60%, transparent 100%)`,
          border: `1.5px solid ${color}`,
          boxShadow: `0 0 40px ${color}44`,
          animation:
            state === "connecting" || state === "processing"
              ? "voice-pulse 1.6s ease-in-out infinite"
              : undefined,
        }}
      >
        {state === "connecting" || state === "processing" ? (
          <Loader2
            className="size-9 text-white"
            style={{ animation: "voice-rotate 1.2s linear infinite" }}
          />
        ) : (
          <Mic className="size-9" style={{ color }} />
        )}
      </div>
    </>
  );
}

function buildSummary(turns: VoiceTurn[]): string {
  if (turns.length === 0) return "";
  const lines = turns.map((t) =>
    t.role === "user" ? `**Você:** ${t.text}` : `**AuraIA:** ${t.text}`,
  );
  return `Resumo da conversa por voz:\n\n${lines.join("\n\n")}`;
}