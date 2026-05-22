import { useEffect, useRef, useState } from "react";
import {
  Download,
  Music2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  X,
} from "lucide-react";
import { audioPlayerStore, useAudioPlayer } from "./audio-player-store";
import { cn } from "@/lib/utils";

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function FloatingAudioPlayer() {
  const { id, blobUrl } = useAudioPlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  useEffect(() => {
    if (!blobUrl) {
      setPlaying(false);
      setCurrent(0);
      setDuration(0);
      setSpeed(1);
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = 1;
    a.currentTime = 0;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [blobUrl]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = speed;
  }, [speed]);

  if (!id || !blobUrl) return null;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seekBy = (delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
  };

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(duration, ratio * duration));
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `auraia-voz-${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "fixed z-[60]",
        "bottom-4 right-4 left-4 sm:left-auto sm:w-[280px]",
      )}
    >
      <div
        className="rounded-xl p-3 shadow-2xl"
        style={{
          background: "#1a1a2e",
          border: "1px solid rgba(108, 71, 255, 0.35)",
        }}
      >
        <audio
          ref={audioRef}
          src={blobUrl}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />

        <div className="flex items-center gap-2 text-xs text-foreground/90">
          <Music2 className="size-3.5" style={{ color: "#8B6FFF" }} />
          <span className="flex-1 truncate">AuraIA — voz</span>
          <button
            type="button"
            onClick={() => audioPlayerStore.close()}
            className="rounded p-1 hover:bg-white/5 transition-colors"
            aria-label="Fechar player"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="mt-2">
          <div
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            onClick={handleBarClick}
            className="h-1.5 w-full rounded-full cursor-pointer overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: "#6C47FF" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{fmt(current)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => seekBy(-10)}
            className="rounded-full p-1.5 hover:bg-white/5 transition-colors"
            aria-label="Retroceder 10s"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            className="rounded-full p-2 transition-colors"
            style={{ background: "#6C47FF", color: "white" }}
            aria-label={playing ? "Pausar" : "Tocar"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => seekBy(10)}
            className="rounded-full p-1.5 hover:bg-white/5 transition-colors"
            aria-label="Avançar 10s"
          >
            <RotateCw className="size-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                  speed === s
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
                style={
                  speed === s
                    ? { background: "rgba(108,71,255,0.25)" }
                    : undefined
                }
              >
                {s}x
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Baixar mp3"
          >
            <Download className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}