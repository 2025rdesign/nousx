import { useCallback, useEffect, useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

interface Props {
  /** Current value of the field, used as the base when starting recording. */
  value: string;
  /** Called with the full updated value (base + live transcript). */
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  lang?: string;
  onRecordingChange?: (recording: boolean) => void;
}

export function VoiceRecordButton({ value, onChange, disabled, className, lang = "pt-BR", onRecordingChange }: Props) {
  const baseRef = useRef("");
  const valueRef = useRef(value);
  valueRef.current = value;

  const handleError = useCallback((err: string) => {
    if (err === "not-allowed" || err === "service-not-allowed") {
      notify.error("Permita o uso do microfone para gravar.");
    } else if (err === "no-speech") {
      // silent
    } else {
      console.warn("[voice] erro:", err);
    }
  }, []);

  const handleTranscript = useCallback(
    (sessionText: string) => {
      const base = baseRef.current;
      const sep = base && !/\s$/.test(base) ? " " : "";
      onChange(base + sep + sessionText);
    },
    [onChange],
  );

  const { supported, recording, start, stop } = useSpeechRecognition({
    lang,
    onTranscript: handleTranscript,
    onError: handleError,
  });

  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  const toggle = useCallback(() => {
    if (recording) {
      stop();
    } else {
      baseRef.current = valueRef.current ?? "";
      start();
    }
  }, [recording, start, stop]);

  if (!supported) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={disabled}
      aria-label={recording ? "Parar gravação" : "Gravar voz"}
      aria-pressed={recording}
      className={cn(
        "rounded-full transition-colors",
        recording &&
          "text-red-500 ring-2 ring-red-500/60 animate-pulse hover:text-red-500",
        className,
      )}
    >
      {recording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
    </Button>
  );
}