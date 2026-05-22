import { useCallback, useEffect, useRef, useState } from "react";

type SR = any;

function getSpeechRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onTranscript: (delta: string) => void;
  onError?: (err: string) => void;
}

export function useSpeechRecognition({
  lang = "pt-BR",
  onTranscript,
  onError,
}: UseSpeechRecognitionOptions) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const finalIndexRef = useRef(0);
  const cbRef = useRef(onTranscript);
  const errRef = useRef(onError);

  useEffect(() => {
    cbRef.current = onTranscript;
    errRef.current = onError;
  }, [onTranscript, onError]);

  useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
  }, []);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (r) {
      try {
        r.stop();
      } catch {
        /* noop */
      }
    }
    setRecording(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
    }
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    finalIndexRef.current = 0;
    r.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          const text = res[0]?.transcript ?? "";
          if (text) {
            const needsSpace = !/[\s\n]$/.test(text);
            cbRef.current(text + (needsSpace ? " " : ""));
          }
        }
      }
    };
    r.onerror = (e: any) => {
      errRef.current?.(e?.error ?? "speech-error");
      setRecording(false);
    };
    r.onend = () => {
      setRecording(false);
    };
    recognitionRef.current = r;
    try {
      r.start();
      setRecording(true);
    } catch (e) {
      errRef.current?.(String(e));
      setRecording(false);
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (recording) stop();
    else start();
  }, [recording, start, stop]);

  useEffect(() => {
    return () => {
      const r = recognitionRef.current;
      if (r) {
        try {
          r.stop();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return { supported, recording, start, stop, toggle };
}