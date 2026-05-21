import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "#6C47FF",
  "#E91E8C",
  "#00BCD4",
  "#FF5722",
  "#4CAF50",
  "#FF9800",
  "#9C27B0",
  "#2196F3",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function colorForName(name?: string | null): string {
  const seed = (name ?? "").trim() || "?";
  return AVATAR_COLORS[hashString(seed.toLowerCase()) % AVATAR_COLORS.length];
}

export function initialForName(name?: string | null): string {
  const s = (name ?? "").trim();
  if (!s) return "?";
  const ch = s.charAt(0);
  return ch.toUpperCase();
}

export function UserAvatar({
  name,
  size = 80,
  className,
}: {
  /** Display name used to derive color + initial. */
  name?: string | null;
  size?: number;
  className?: string;
  /** @deprecated kept for backward compatibility — ignored. */
  avatarId?: string | null;
}) {
  const bg = colorForName(name);
  const initial = initialForName(name);
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: bg,
        color: "#fff",
        fontWeight: 700,
        fontSize: Math.round(size * 0.45),
        lineHeight: 1,
      }}
      aria-label={name ? `Avatar de ${name}` : "Avatar"}
    >
      {initial}
    </div>
  );
}