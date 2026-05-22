import { useCallback } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

interface Props {
  onTranscript: (delta: string) => void;
  disabled?: boolean;
  className?: string;
  lang?: string;
}

export function VoiceRecordButton({ onTranscript, disabled, className, lang = "pt-BR" }: Props) {
  const handleError = useCallback((err: string) => {
    if (err === "not-allowed" || err === "service-not-allowed") {
      notify.error("Permita o uso do microfone para gravar.");
    } else if (err === "no-speech") {
      // silent
    } else {
      console.warn("[voice] erro:", err);
    }
  }, []);

  const { supported, recording, toggle } = useSpeechRecognition({
    lang,
    onTranscript,
    onError: handleError,
  });

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