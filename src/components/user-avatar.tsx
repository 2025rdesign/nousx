import { cn } from "@/lib/utils";

export interface AvatarPreset {
  id: string;
  bg: string;
  fg: string;
  shape: "circle" | "triangle" | "square" | "diamond" | "blob" | "spark" | "wave" | "star";
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "nebula", bg: "#6C47FF", fg: "#F0E9FF", shape: "circle" },
  { id: "ember", bg: "#FF5E5B", fg: "#FFE2DA", shape: "triangle" },
  { id: "moss", bg: "#2DD4A8", fg: "#0B2D24", shape: "blob" },
  { id: "ocean", bg: "#2D8A9E", fg: "#E0F7FA", shape: "wave" },
  { id: "sun", bg: "#F5B83D", fg: "#3A2A00", shape: "spark" },
  { id: "rose", bg: "#E84393", fg: "#FFE3F0", shape: "diamond" },
  { id: "noir", bg: "#1A1A22", fg: "#C9A84C", shape: "star" },
  { id: "lavender", bg: "#A78BFA", fg: "#1B0B3A", shape: "square" },
];

function PresetSVG({ preset, size = 80 }: { preset: AvatarPreset; size?: number }) {
  const { bg, fg, shape } = preset;
  const s = size;
  return (
    <svg viewBox="0 0 100 100" width={s} height={s} aria-hidden>
      <defs>
        <radialGradient id={`g-${preset.id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor={bg} stopOpacity="1" />
          <stop offset="100%" stopColor={bg} stopOpacity="0.7" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#g-${preset.id})`} />
      {shape === "circle" && <circle cx="50" cy="50" r="22" fill={fg} opacity="0.85" />}
      {shape === "triangle" && (
        <polygon points="50,25 78,72 22,72" fill={fg} opacity="0.9" />
      )}
      {shape === "square" && (
        <rect x="30" y="30" width="40" height="40" rx="6" fill={fg} opacity="0.9" />
      )}
      {shape === "diamond" && (
        <polygon points="50,22 78,50 50,78 22,50" fill={fg} opacity="0.9" />
      )}
      {shape === "blob" && (
        <path
          d="M50 22c12 0 26 8 26 24s-10 32-26 32-28-14-28-30 16-26 28-26z"
          fill={fg}
          opacity="0.9"
        />
      )}
      {shape === "spark" && (
        <g fill={fg} opacity="0.95">
          <circle cx="50" cy="50" r="10" />
          <path d="M50 18 L54 42 L78 50 L54 58 L50 82 L46 58 L22 50 L46 42 Z" />
        </g>
      )}
      {shape === "wave" && (
        <g fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" opacity="0.95">
          <path d="M18 42 Q34 28 50 42 T82 42" />
          <path d="M18 58 Q34 72 50 58 T82 58" />
        </g>
      )}
      {shape === "star" && (
        <polygon
          points="50,22 58,44 82,44 62,58 70,80 50,66 30,80 38,58 18,44 42,44"
          fill={fg}
          opacity="0.95"
        />
      )}
    </svg>
  );
}

export function UserAvatar({
  avatarId,
  size = 80,
  className,
}: {
  avatarId?: string | null;
  size?: number;
  className?: string;
}) {
  const preset =
    AVATAR_PRESETS.find((p) => p.id === avatarId) ?? AVATAR_PRESETS[0];
  return (
    <div
      className={cn("overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
    >
      <PresetSVG preset={preset} size={size} />
    </div>
  );
}

export function AvatarGrid({
  selected,
  onSelect,
}: {
  selected: string | null | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
      {AVATAR_PRESETS.map((p) => {
        const isSel = (selected ?? AVATAR_PRESETS[0].id) === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-label={`Avatar ${p.id}`}
            className={cn(
              "rounded-full p-[3px] transition-all",
              isSel
                ? "ring-2 ring-offset-2 ring-offset-card"
                : "opacity-80 hover:opacity-100",
            )}
            style={isSel ? { boxShadow: "0 0 0 2px #6C47FF" } : undefined}
          >
            <PresetSVG preset={p} size={48} />
          </button>
        );
      })}
    </div>
  );
}