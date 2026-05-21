import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { getCredits } from "@/lib/credits.functions";
import { cn } from "@/lib/utils";

export function CreditsBadge({ className }: { className?: string }) {
  const fetchCredits = useServerFn(getCredits);
  const { data } = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    staleTime: 30_000,
  });

  const balance = data?.balance ?? 0;

  return (
    <Link
      to="/creditos"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent",
        className,
      )}
      aria-label={`${balance} créditos`}
    >
      <Sparkles className="size-3.5 text-accent" />
      <span>{balance}</span>
    </Link>
  );
}