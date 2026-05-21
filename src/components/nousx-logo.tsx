import { cn } from "@/lib/utils";

export function NousxLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-bold tracking-tight text-foreground select-none",
        className,
      )}
    >
      NOUS<span className="text-accent">X</span>
    </span>
  );
}