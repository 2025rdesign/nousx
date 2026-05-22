import { cn } from "@/lib/utils";

type PlanKey = "free" | "plus" | "ultra";

export function PlanBadge({
  plan,
  className,
}: {
  plan: PlanKey;
  className?: string;
}) {
  const base =
    "inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-bold leading-none text-white";
  if (plan === "ultra") {
    return (
      <span
        className={cn(base, className)}
        style={{
          background: "linear-gradient(135deg, #F59E0B, #6C47FF)",
        }}
      >
        Ultra
      </span>
    );
  }
  if (plan === "plus") {
    return (
      <span
        className={cn(base, className)}
        style={{ background: "#6C47FF" }}
      >
        Plus
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "bg-muted text-muted-foreground",
        className,
      )}
    >
      Free
    </span>
  );
}

export function getPlanKey(
  hasActive: boolean,
  planId: string | null,
): PlanKey {
  if (hasActive && planId === "ultra") return "ultra";
  if (hasActive && planId === "plus") return "plus";
  return "free";
}