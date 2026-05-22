import { cn } from "@/lib/utils";

const LOGO_URL =
  "https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA.png";

export function NousxLogo({ className }: { className?: string }) {
  return (
    <img
      src={LOGO_URL}
      alt="AuraIA"
      className={cn("h-9 w-auto select-none", className)}
      draggable={false}
    />
  );
}