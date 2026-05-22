import { cn } from "@/lib/utils";

export function NousxLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-bold tracking-tight text-foreground select-none",
        className,
      )}
    >
      Aura<span style={{ color: "#6C47FF" }}>IA</span>
    </span>
  );
}
