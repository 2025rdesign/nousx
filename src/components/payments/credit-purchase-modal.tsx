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

const PACK_META: Record<CreditPackId, { expiresDays: number | null; isPopular?: boolean }> = {
  starter: { expiresDays: 10 },
  popular: { expiresDays: 30, isPopular: true },
  pro: { expiresDays: null },
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
  const [couponOpen, setCouponOpen] = useState(false);

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
              const active = packId === id;
              const isPopular = !!meta.isPopular;
              return (
                <div key={id} className="flex flex-col">
                  <p
                    className={cn(
                      "text-center mb-1.5 text-[11px] uppercase tracking-[0.08em] font-medium",
                      isPopular ? "text-[#6C47FF]" : "text-transparent select-none",
                    )}
                  >
                    {isPopular ? "Mais escolhido" : "·"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPackId(id)}
                    style={
                      isPopular
                        ? { boxShadow: "0 0 0 1px #6C47FF, 0 0 20px rgba(108,71,255,0.15)" }
                        : undefined
                    }
                    className={cn(
                      "group relative text-left rounded-xl border bg-[#111118] p-5 transition-all flex-1 flex flex-col",
                      "hover:border-[#4a4a6a] hover:brightness-110",
                      isPopular
                        ? "border-[#6C47FF]"
                        : "border-[#2a2a3a]",
                      active && !isPopular && "border-[#6C47FF]/70",
                    )}
                  >
                    <p className="text-[14px] font-medium text-white">{p.name}</p>
                    <p className="mt-3 text-[28px] font-bold text-white leading-none">
                      {formatBRL(p.price)}
                    </p>
                    <p className="mt-3 text-[13px] text-[#888]">
                      {p.credits} créditos
                    </p>
                    <p className="mt-1 text-[12px] text-[#666]">
                      {formatBRL(perImg)} por imagem
                    </p>
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-[#555] -mt-2">
            Starter expira em 10 dias · Popular expira em 30 dias · Pro nunca expira
          </p>

          <div className="pt-1">
            {couponOpen || coupon ? (
              <CouponField value={coupon} onApply={setCoupon} />
            ) : (
              <button
                type="button"
                onClick={() => setCouponOpen(true)}
                className="text-[13px] text-[#6C47FF] hover:underline"
              >
                Tem um cupom?
              </button>
            )}
          </div>

          <Button
            onClick={() => setPixOpen(true)}
            className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white font-semibold"
            style={{ height: 52, borderRadius: 10 }}
          >
            {`Pagar com PIX — ${formatBRL(finalPrice)}`}
          </Button>

          <p className="text-center text-[11px] text-[#444]">
            Pagamento seguro via Mercado Pago · Créditos liberados automaticamente
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
