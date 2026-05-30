import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { getCredits } from "@/lib/credits.functions";
import { cn } from "@/lib/utils";
import {
  PAYMENTS_UNDER_MAINTENANCE,
  PAYMENTS_MAINTENANCE_TOOLTIP,
} from "@/lib/constants";

export function CreditsBadge({ className }: { className?: string }) {
  const fetchCredits = useServerFn(getCredits);
  const { data, isLoading } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    staleTime: 30_000,
  });

  // Never render "0 créditos" during loading — show a skeleton placeholder
  // so the value either appears correct or appears as a loading state.
  if (isLoading || !data) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium",
          className,
        )}
        aria-label="Carregando créditos"
      >
        <Sparkles className="size-3.5 text-accent/40" />
        <span className="inline-block h-3 w-6 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const balance = data.balance ?? 0;

  return (
    <Link
      to="/creditos"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent",
        className,
      )}
      aria-label={`${balance} créditos`}
      title={PAYMENTS_UNDER_MAINTENANCE ? PAYMENTS_MAINTENANCE_TOOLTIP : undefined}
    >
      <Sparkles className="size-3.5 text-accent" />
      <span>{balance}</span>
    </Link>
  );
}