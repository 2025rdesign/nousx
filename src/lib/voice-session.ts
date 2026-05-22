// Voice Session client — manages WebSocket to xAI Realtime, mic capture, and audio playback.
// SSR-safe: all browser APIs are accessed only inside methods called at runtime.

import { supabase } from "@/integrations/supabase/client";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface VoiceTurn {
  role: "user" | "assistant";
  text: string;
}

interface Listeners {
  state?: (s: VoiceState) => void;
  userTranscript?: (text: string, final: boolean) => void;
  assistantTranscript?: (text: string, final: boolean) => void;
  turn?: (turn: VoiceTurn) => void;
  error?: (msg: string) => void;
  analyser?: (node: AnalyserNode | null) => void;
}

const VOICE_INSTRUCTIONS = `Você é AuraIA, uma assistente brasileira amigável.

INSTRUÇÕES PARA MODO DE VOZ:
- Respostas curtas e diretas, no máximo 3 ou 4 frases.
- Linguagem natural para ser falada em voz alta.
- Sem markdown, sem asteriscos, sem listas, sem URLs.
- Tom conversacional e casual.
- Fale sempre em português brasileiro.`;

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(s);
}

function floatToPCM16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = bytes.byteLength / 2;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const s = view.getInt16(i * 2, true);
    out[i] = s / 0x8000;
  }
  return out;
}

const TARGET_RATE = 24000;

export class VoiceSession {
  private ws: WebSocket | null = null;
  private micStream: MediaStream | null = null;
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private muted = false;
  private closed = false;
  private retried = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  history: VoiceTurn[] = [];
  state: VoiceState = "idle";

  private currentUserText = "";
  private currentAssistantText = "";

  constructor(private listeners: Listeners = {}) {}

  private setState(s: VoiceState) {
    this.state = s;
    this.listeners.state?.(s);
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.listeners.error?.("Sem fala detectada por 60 segundos. Encerrando.");
      this.close();
    }, 60_000);
  }

  async start() {
    this.setState("connecting");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");

      const res = await fetch("/api/voice-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) throw new Error("Modo de voz exclusivo do plano Ultra.");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Falha ao iniciar." }));
        throw new Error(err.error || "Falha ao iniciar.");
      }
      const { token: ephemeral, model } = (await res.json()) as {
        token: string;
        model: string;
      };

      await this.openSocket(ephemeral, model);
      await this.openMic();
      this.resetIdleTimer();
      this.setState("listening");
    } catch (err) {
      console.error("[VOICE] start error", err);
      this.listeners.error?.(err instanceof Error ? err.message : "Falha ao iniciar.");
      this.setState("error");
      await this.cleanup();
    }
  }

  private openSocket(ephemeral: string, model: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const url = `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model)}`;
        // Pass ephemeral token via subprotocol — standard pattern for realtime APIs
        // since browser WebSocket cannot set Authorization headers.
        const ws = new WebSocket(url, [
          "realtime",
          `openai-insecure-api-key.${ephemeral}`,
          `xai-ephemeral.${ephemeral}`,
        ]);
        this.ws = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: {
                voice: "ara",
                language: "pt-BR",
                instructions: VOICE_INSTRUCTIONS,
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  silence_duration_ms: 800,
                },
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
              },
            }),
          );
          resolve();
        };
        ws.onmessage = (ev) => this.handleMessage(ev);
        ws.onerror = (e) => {
          console.error("[VOICE] ws error", e);
        };
        ws.onclose = (e) => {
          console.warn("[VOICE] ws closed", e.code, e.reason);
          if (!this.closed && !this.retried) {
            this.retried = true;
            console.log("[VOICE] tentando reconectar...");
            void this.start();
          } else if (!this.closed) {
            this.listeners.error?.("Conexão perdida.");
            this.setState("error");
          }
        };

        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            reject(new Error("Timeout ao conectar."));
          }
        }, 10_000);
      } catch (err) {
        reject(err);
      }
    });
  }

  private async openMic() {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.inputCtx = new Ctx();
    this.outputCtx = new Ctx({ sampleRate: TARGET_RATE });
    this.nextStartTime = this.outputCtx.currentTime;

    this.source = this.inputCtx.createMediaStreamSource(this.micStream);
    this.analyser = this.inputCtx.createAnalyser();
    this.analyser.fftSize = 64;
    this.source.connect(this.analyser);
    this.listeners.analyser?.(this.analyser);

    const bufSize = 4096;
    const inRate = this.inputCtx.sampleRate;
    const processor = this.inputCtx.createScriptProcessor(bufSize, 1, 1);
    this.processor = processor;
    processor.onaudioprocess = (e) => {
      if (this.muted) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const downsampled = this.downsample(input, inRate, TARGET_RATE);
      const pcm = floatToPCM16(downsampled);
      const bytes = new Uint8Array(pcm.buffer);
      const b64 = uint8ToBase64(bytes);
      this.ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: b64 }));
    };
    this.source.connect(processor);
    processor.connect(this.inputCtx.destination);
  }

  private downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const newLen = Math.round(input.length / ratio);
    const out = new Float32Array(newLen);
    let pos = 0;
    let idxIn = 0;
    while (pos < newLen) {
      const nextIdxIn = Math.round((pos + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let i = idxIn; i < nextIdxIn && i < input.length; i++) {
        sum += input[i];
        count++;
      }
      out[pos] = count > 0 ? sum / count : 0;
      pos++;
      idxIn = nextIdxIn;
    }
    return out;
  }

  private handleMessage(ev: MessageEvent) {
    let msg: any;
    try {
      msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
    } catch {
      return;
    }
    const type = msg.type as string | undefined;
    if (!type) return;

    switch (type) {
      case "input_audio_buffer.speech_started":
        this.resetIdleTimer();
        this.currentUserText = "";
        this.setState("listening");
        break;
      case "input_audio_buffer.speech_stopped":
        this.setState("processing");
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (typeof msg.delta === "string") {
          this.currentUserText += msg.delta;
          this.listeners.userTranscript?.(this.currentUserText, false);
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof msg.transcript === "string") {
          this.currentUserText = msg.transcript;
          this.listeners.userTranscript?.(msg.transcript, true);
          this.history.push({ role: "user", text: msg.transcript });
          this.listeners.turn?.({ role: "user", text: msg.transcript });
        }
        break;
      case "response.created":
      case "response.output_item.added":
        this.currentAssistantText = "";
        break;
      case "response.audio.delta":
      case "response.output_audio.delta":
        if (typeof msg.delta === "string") {
          this.playAudioChunk(msg.delta);
          this.setState("speaking");
        }
        break;
      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
        if (typeof msg.delta === "string") {
          this.currentAssistantText += msg.delta;
          this.listeners.assistantTranscript?.(this.currentAssistantText, false);
        }
        break;
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done":
        if (typeof msg.transcript === "string") {
          this.currentAssistantText = msg.transcript;
          this.listeners.assistantTranscript?.(msg.transcript, true);
        }
        break;
      case "response.done":
      case "response.completed":
        if (this.currentAssistantText) {
          this.history.push({ role: "assistant", text: this.currentAssistantText });
          this.listeners.turn?.({ role: "assistant", text: this.currentAssistantText });
        }
        this.setState("listening");
        this.resetIdleTimer();
        break;
      case "error":
        console.error("[VOICE] api error", msg);
        this.listeners.error?.(msg.error?.message || "Erro na API de voz.");
        this.setState("error");
        break;
    }
  }

  private playAudioChunk(b64: string) {
    if (!this.outputCtx) return;
    const bytes = base64ToUint8(b64);
    const floats = pcm16ToFloat(bytes);
    const buffer = this.outputCtx.createBuffer(1, floats.length, TARGET_RATE);
    buffer.copyToChannel(floats, 0);
    const src = this.outputCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.outputCtx.destination);
    const now = this.outputCtx.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  skip() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "response.cancel" }));
    }
    this.nextStartTime = this.outputCtx?.currentTime ?? 0;
    this.setState("listening");
  }

  async close() {
    this.closed = true;
    await this.cleanup();
    this.setState("idle");
  }

  private async cleanup() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.analyser?.disconnect();
    } catch {}
    this.processor = null;
    this.source = null;
    this.analyser = null;
    this.listeners.analyser?.(null);
    try {
      this.micStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    this.micStream = null;
    try {
      await this.inputCtx?.close();
    } catch {}
    try {
      await this.outputCtx?.close();
    } catch {}
    this.inputCtx = null;
    this.outputCtx = null;
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}