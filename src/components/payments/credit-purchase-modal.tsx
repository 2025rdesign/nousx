import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Loader2,
  Gem,
  Clock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CREDIT_PACKS, applyDiscount, type CreditPackId } from "@/lib/payments-config";
import { getCredits } from "@/lib/credits.functions";
import { CouponField, type AppliedCoupon } from "./coupon-field";
import { MpPixModal } from "./mp-pix-modal";

const PACK_META: Record<
  CreditPackId,
  {
    expiresDays: number | null;
    badge?: { label: string; tone: "purple" | "gold" };
    tag?: { label: string; tone: "muted" | "green" };
    accent: "muted" | "purple" | "gold";
  }
> = {
  starter: { expiresDays: 10, tag: { label: "Para experimentar", tone: "muted" }, accent: "muted" },
  popular: { expiresDays: 30, badge: { label: "MAIS POPULAR", tone: "purple" }, accent: "purple" },
  pro: {
    expiresDays: null,
    badge: { label: "MELHOR VALOR", tone: "gold" },
    tag: { label: "Sem expiração", tone: "green" },
    accent: "gold",
  },
};

const formatBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const pricePerImage = (p: { price: number; credits: number }) => p.price / p.credits;
const daysUntil = (iso: string | null) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
};

export function CreditPurchaseModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [packId, setPackId] = useState<CreditPackId>("popular");
  const [coupon, setCoupon] = useState<AppliedCoupon>(null);
  const [pixOpen, setPixOpen] = useState(false);

  const pack = CREDIT_PACKS[packId];
  const finalPrice = useMemo(
    () => (coupon ? applyDiscount(pack.price, coupon.discountPercent) : pack.price),
    [pack.price, coupon],
  );

  const fetchCredits = useServerFn(getCredits);

  const creditsQ = useQuery({
    queryKey: ["credits"],
    queryFn: () => fetchCredits(),
    enabled: open,
  });
  const balance = creditsQ.data?.balance ?? 0;
  const totalPurchased = creditsQ.data?.totalPurchased ?? 0;
  const nextExpiresAt = creditsQ.data?.nextExpiresAt ?? null;
  const nonExpiringRemaining = creditsQ.data?.nonExpiringRemaining ?? 0;
  const expiresInDays = daysUntil(nextExpiresAt);
  const hasOnlyNonExpiring = balance > 0 && nonExpiringRemaining === balance;
  const usedPercent =
    totalPurchased > 0
      ? Math.min(100, Math.round(((totalPurchased - balance) / totalPurchased) * 100))
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 border-border bg-[#0A0A0F] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-300">
        <div className="px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle>Créditos</DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-5 pb-5 space-y-5">
          {/* Balance card */}
          <div className="rounded-2xl border border-[#1E1E2E] bg-[#13131A] p-5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-[#6C47FF]/30 blur-xl animate-pulse" />
                <div className="relative size-12 rounded-full bg-gradient-to-br from-[#6C47FF] to-[#9B7BFF] flex items-center justify-center shadow-lg shadow-[#6C47FF]/30">
                  <Gem className="size-6 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider text-zinc-400">Seu saldo atual</p>
                <p className="text-3xl font-bold text-white leading-tight">
                  {balance.toLocaleString("pt-BR")}{" "}
                  <span className="text-base font-medium text-zinc-400">créditos</span>
                </p>
              </div>
            </div>

            {totalPurchased > 0 && (
              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1E1E2E]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#6C47FF] to-[#9B7BFF] transition-all"
                    style={{ width: `${usedPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-500">
                  {usedPercent}% do total comprado já utilizado
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {hasOnlyNonExpiring ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <ShieldCheck className="size-3.5" /> Sem expiração
                </span>
              ) : expiresInDays != null && balance > 0 ? (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Clock className="size-3.5" /> Expiram em {expiresInDays}{" "}
                  {expiresInDays === 1 ? "dia" : "dias"}
                </span>
              ) : null}
              <span className="text-zinc-500">1 crédito = 1 geração de imagem no Estúdio</span>
            </div>
          </div>

          {balance < 10 && balance > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-2 text-sm text-amber-300">
              <Zap className="size-4" />
              <span>Seus créditos estão acabando!</span>
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-white">Recarregue e economize mais</h3>
            <p className="text-sm text-zinc-400">Créditos maiores = menor custo por imagem</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {(Object.keys(CREDIT_PACKS) as CreditPackId[]).map((id) => {
              const p = CREDIT_PACKS[id];
              const meta = PACK_META[id];
              const perImg = pricePerImage(p);
              const starterPer = pricePerImage(CREDIT_PACKS.starter);
              const savings = id === "starter" ? 0 : Math.round((1 - perImg / starterPer) * 100);
              const active = packId === id;
              const isPopular = meta.accent === "purple";
              const isPro = meta.accent === "gold";
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => setPackId(id)}
                  className={cn(
                    "relative text-left rounded-2xl border bg-[#13131A] p-4 pt-5 transition-all flex flex-col hover:-translate-y-0.5",
                    isPopular && "md:scale-[1.03] md:-my-1",
                    active && isPopular && "border-[#6C47FF] ring-2 ring-[#6C47FF]/40 shadow-lg shadow-[#6C47FF]/20",
                    active && isPro && "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 shadow-lg shadow-[#F59E0B]/10",
                    active && meta.accent === "muted" && "border-zinc-400 ring-1 ring-zinc-400/30",
                    !active && isPopular && "border-[#6C47FF]/60",
                    !active && isPro && "border-[#F59E0B]/40",
                    !active && meta.accent === "muted" && "border-[#1E1E2E]",
                  )}
                >
                  {meta.badge && (
                    <span
                      className={cn(
                        "absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider",
                        meta.badge.tone === "purple"
                          ? "bg-[#6C47FF] text-white"
                          : "bg-[#F59E0B] text-black",
                      )}
                    >
                      {meta.badge.label}
                    </span>
                  )}

                  <p className="text-sm font-medium text-zinc-300">{p.name}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{formatBRL(p.price)}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-white">
                    <Sparkles className="size-3.5 text-[#6C47FF]" />
                    <span className="font-semibold">{p.credits}</span>
                    <span className="text-zinc-400">créditos</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatBRL(perImg)} por imagem
                    {savings > 0 && (
                      <span className="ml-1 text-emerald-400 font-medium">(-{savings}% vs Starter)</span>
                    )}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {meta.expiresDays != null ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                        <Clock className="size-3" /> Expiram em {meta.expiresDays} dias
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                        <ShieldCheck className="size-3" /> Nunca expiram
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <CouponField value={coupon} onApply={setCoupon} />

          <div className="rounded-lg bg-[#13131A] border border-[#1E1E2E] p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{pack.name}</p>
              <p className="text-xs text-zinc-400">{pack.credits} créditos</p>
            </div>
            <div className="text-right">
              {coupon && (
                <p className="text-xs text-zinc-500 line-through">{formatBRL(pack.price)}</p>
              )}
              <p className="text-lg font-bold text-white">{formatBRL(finalPrice)}</p>
            </div>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            Pagamento processado com segurança. Seus dados financeiros não são armazenados pela AuraIA.
          </p>

          <Button
            className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white"
            onClick={() => setPixOpen(true)}
          >
            {`Pagar com PIX — ${formatBRL(finalPrice)}`}
          </Button>

          <p className="text-xs text-zinc-500 text-center">
            Após confirmar o pagamento, seus créditos serão liberados automaticamente.
          </p>
        </div>
      </DialogContent>
      <MpPixModal
        open={pixOpen}
        onOpenChange={setPixOpen}
        kind="credit"
        id={packId}
        name={`${pack.name} — ${pack.credits} créditos`}
        amount={finalPrice}
        couponCode={coupon?.code ?? null}
        onPaid={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
