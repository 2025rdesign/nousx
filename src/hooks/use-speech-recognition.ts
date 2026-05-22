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
  /**
   * Called on every result event (interim and final) with the full
   * accumulated transcript for the current recording session.
   */
  onTranscript: (sessionText: string, isFinal: boolean) => void;
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
  const finalTextRef = useRef("");
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
    r.maxAlternatives = 1;
    finalTextRef.current = "";
    r.onresult = (event: any) => {
      let interim = "";
      let newFinal = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const chunk = res[0]?.transcript ?? "";
        if (res.isFinal) newFinal += chunk;
        else interim += chunk;
      }
      if (newFinal) {
        finalTextRef.current = (finalTextRef.current + " " + newFinal)
          .replace(/\s+/g, " ")
          .trim();
      }
      const combined = (finalTextRef.current + " " + interim)
        .replace(/\s+/g, " ")
        .trim();
      cbRef.current(combined, newFinal.length > 0 && interim.length === 0);
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