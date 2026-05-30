import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Gem, Clock, ShieldCheck, Zap } from "lucide-react";
import { CREDIT_PACKS, type CreditPackId } from "@/lib/payments-config";
import { getCredits } from "@/lib/credits.functions";
import { MpPixModal } from "./mp-pix-modal";
import {
  PAYMENTS_UNDER_MAINTENANCE,
  notifyPaymentsMaintenance,
} from "@/lib/constants";

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
  const [pixOpen, setPixOpen] = useState(false);

  // Maintenance gate: never let the modal actually open.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (PAYMENTS_UNDER_MAINTENANCE && open) {
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        notifyPaymentsMaintenance();
      }
      onOpenChange(false);
    }
    if (!open) notifiedRef.current = false;
  }, [open, onOpenChange]);
  if (PAYMENTS_UNDER_MAINTENANCE) return null;

  const pack = CREDIT_PACKS[packId];

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

          {/* Card grid — flex + items-end so Popular is physically taller */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            {(Object.keys(CREDIT_PACKS) as CreditPackId[]).map((id) => {
              const p = CREDIT_PACKS[id];
              const meta = PACK_META[id];
              const perImg = pricePerImage(p);
              const active = packId === id;
              const isPopular = !!meta.isPopular;

              return (
                <div key={id} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  {/* "MAIS ESCOLHIDO" label — only Popular has visible text */}
                  <p
                    style={{
                      textAlign: "center",
                      marginBottom: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: isPopular ? "#6C47FF" : "transparent",
                      userSelect: "none",
                    }}
                  >
                    MAIS ESCOLHIDO
                  </p>

                  <button
                    type="button"
                    onClick={() => setPackId(id)}
                    style={{
                      padding: isPopular ? "28px 24px" : "20px",
                      background: active ? "#13111f" : "#0f0f17",
                      border: active ? "2px solid #6C47FF" : "1.5px solid #1e1e2e",
                      boxShadow: active
                        ? "0 0 0 1px #6C47FF, 0 0 24px rgba(108,71,255,0.18)"
                        : undefined,
                      opacity: active ? 1 : 0.55,
                      borderRadius: 12,
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "opacity 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, color: "white" }}>
                      {p.name}
                    </span>
                    <span
                      style={{
                        display: "block",
                        marginTop: 12,
                        fontSize: isPopular ? 30 : 22,
                        fontWeight: 700,
                        color: "white",
                        lineHeight: 1,
                      }}
                    >
                      {formatBRL(p.price)}
                    </span>
                    <span
                      style={{ display: "block", marginTop: 12, fontSize: 13, color: "#888" }}
                    >
                      {p.credits} créditos
                    </span>
                    <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#666" }}>
                      {formatBRL(perImg)} por imagem
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[11px] text-[#555] -mt-2">
            Starter expira em 10 dias · Popular expira em 30 dias · Pro nunca expira
          </p>

          <Button
            onClick={() => setPixOpen(true)}
            className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white font-semibold"
            style={{ height: 52, borderRadius: 10 }}
          >
            {`Pagar com PIX — ${formatBRL(pack.price)}`}
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
        amount={pack.price}
        couponCode={null}
        onPaid={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
