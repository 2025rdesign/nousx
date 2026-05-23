import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Download,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import { audioPlayerStore, useAudioPlayer } from "./audio-player-store";
import { cn } from "@/lib/utils";

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const DESKTOP_BREAKPOINT = 768;

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

export function FloatingAudioPlayer() {
  const { id, blobUrl, loading } = useAudioPlayer();
  const isDesktop = useIsDesktop();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  // Desktop drag position — null = use default bottom-right.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  // Reset playback state whenever audio source changes / clears.
  useEffect(() => {
    if (!blobUrl) {
      setPlaying(false);
      setCurrent(0);
      setDuration(0);
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = speed;
    a.currentTime = 0;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    // speed intentionally excluded — we only auto-play when blob changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobUrl]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = speed;
  }, [speed]);

  // Desktop drag handlers (mounted on window during drag).
  useEffect(() => {
    if (!isDesktop) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const card = cardRef.current;
      const w = card?.offsetWidth ?? 300;
      const h = card?.offsetHeight ?? 160;
      const x = Math.max(
        8,
        Math.min(window.innerWidth - w - 8, e.clientX - dragRef.current.offsetX),
      );
      const y = Math.max(
        8,
        Math.min(window.innerHeight - h - 8, e.clientY - dragRef.current.offsetY),
      );
      setPos({ x, y });
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDesktop]);

  const onDragStart = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDesktop || !cardRef.current) return;
    // Only start drag if the target isn't an interactive control.
    const target = e.target as HTMLElement;
    if (target.closest("button,[role=slider]")) return;
    const rect = cardRef.current.getBoundingClientRect();
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    if (!pos) setPos({ x: rect.left, y: rect.top });
    document.body.style.userSelect = "none";
  };

  const handleBarClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const a = audioRef.current;
      if (!a || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      a.currentTime = Math.max(0, Math.min(duration, ratio * duration));
    },
    [duration],
  );

  if (!id) return null;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.ended) {
      a.currentTime = 0;
    }
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

  const handleDownload = () => {
    if (!blobUrl) return;
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `auraia-audio-${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  const baseStyle: React.CSSProperties = {
    background: "#1a1a2e",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  };

  // ===== MOBILE: thin bottom sheet above the chat input =====
  if (!isDesktop) {
    return (
      <div
        className="fixed left-0 right-0 z-50 px-2 animate-fade-in"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
      >
        <div
          className="mx-auto flex h-14 max-w-3xl items-center gap-2 rounded-lg px-3 shadow-lg"
          style={{
            ...baseStyle,
            borderTop: "1px solid rgba(108, 71, 255, 0.45)",
            border: "1px solid rgba(108, 71, 255, 0.25)",
          }}
        >
          <audio
            ref={audioRef}
            src={blobUrl ?? undefined}
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
          {loading ? (
            <>
              <Volume2
                className="size-4 shrink-0 animate-pulse"
                style={{ color: "#8B6FFF" }}
              />
              <IndeterminateBar />
              <span className="shrink-0 text-[11px] text-muted-foreground">
                Gerando...
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggle}
                className="shrink-0 rounded-full p-1.5"
                style={{ background: "#6C47FF", color: "white" }}
                aria-label={playing ? "Pausar" : "Tocar"}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <ProgressBar
                progress={progress}
                duration={duration}
                current={current}
                onSeek={handleBarClick}
              />
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {fmt(current)}/{fmt(duration)}
              </span>
              <SpeedSelect speed={speed} setSpeed={setSpeed} compact />
              <button
                type="button"
                onClick={handleDownload}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Baixar mp3"
              >
                <Download className="size-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => audioPlayerStore.close()}
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Fechar player"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  // ===== DESKTOP: draggable card =====
  const cardStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 20, bottom: 80 };

  return (
    <div
      ref={cardRef}
      className="fixed z-50 w-[300px] rounded-xl shadow-2xl animate-fade-in"
      style={{
        ...baseStyle,
        border: "1px solid rgba(108, 71, 255, 0.35)",
        ...cardStyle,
      }}
    >
      <audio
        ref={audioRef}
        src={blobUrl ?? undefined}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      {/* Header — drag handle */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/90"
        style={{ cursor: "grab" }}
      >
        <Music className="size-3.5" style={{ color: "#8B6FFF" }} />
        <span className="flex-1 truncate select-none">AuraIA Audio</span>
        <button
          type="button"
          onClick={() => audioPlayerStore.close()}
          className="rounded p-1 hover:bg-white/5"
          aria-label="Fechar player"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="px-3 pb-3">
          <IndeterminateBar />
          <div className="mt-2 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
            <Volume2
              className="size-3.5 animate-pulse"
              style={{ color: "#8B6FFF" }}
            />
            <span>Gerando audio...</span>
          </div>
        </div>
      ) : (
        <div className="px-3 pb-3">
          <ProgressBar
            progress={progress}
            duration={duration}
            current={current}
            onSeek={handleBarClick}
          />

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => seekBy(-10)}
                className="rounded-full p-1.5 hover:bg-white/5"
                aria-label="Retroceder 10s"
              >
                <SkipBack className="size-4" />
              </button>
              <button
                type="button"
                onClick={toggle}
                className="rounded-full p-2"
                style={{ background: "#6C47FF", color: "white" }}
                aria-label={playing ? "Pausar" : "Tocar"}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button
                type="button"
                onClick={() => seekBy(10)}
                className="rounded-full p-1.5 hover:bg-white/5"
                aria-label="Avançar 10s"
              >
                <SkipForward className="size-4" />
              </button>
            </div>
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {fmt(current)} / {fmt(duration)}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <SpeedSelect speed={speed} setSpeed={setSpeed} />
            <button
              type="button"
              onClick={handleDownload}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Baixar mp3"
            >
              <Download className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgressBar({
  progress,
  duration,
  current,
  onSeek,
}: {
  progress: number;
  duration: number;
  current: number;
  onSeek: (e: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="slider"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      onClick={onSeek}
      className="h-[3px] w-full min-w-0 flex-1 cursor-pointer rounded-full overflow-hidden"
      style={{ background: "rgba(255,255,255,0.08)" }}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${progress}%`, background: "#6C47FF" }}
      />
    </div>
  );
}

function IndeterminateBar() {
  return (
    <div
      className="relative h-[3px] w-full min-w-0 flex-1 overflow-hidden rounded-full"
      style={{ background: "rgba(255,255,255,0.08)" }}
    >
      <div
        className="absolute inset-y-0 w-1/3 rounded-full tts-indeterminate"
        style={{ background: "#6C47FF" }}
      />
    </div>
  );
}

function SpeedSelect({
  speed,
  setSpeed,
  compact,
}: {
  speed: number;
  setSpeed: (s: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
      {SPEEDS.map((s) => {
        const active = speed === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[11px] transition-colors",
              active
                ? "text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
            style={active ? { background: "rgba(108,71,255,0.3)" } : undefined}
          >
            {s}x
          </button>
        );
      })}
    </div>
  );
}