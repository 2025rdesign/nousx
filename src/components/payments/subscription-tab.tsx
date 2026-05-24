import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import {
  PLANS,
  applyDiscount,
  planPriceFor,
  type BillingPeriod,
  type PlanId,
} from "@/lib/payments-config";
import {
  cancelMySubscription,
  getMySubscription,
} from "@/lib/payments.functions";
import { CouponField, type AppliedCoupon } from "./coupon-field";
import { MpPixModal } from "./mp-pix-modal";

const formatBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const fmtBRL = formatBRL;

type CardId = "free" | "plus" | "ultra" | "credits";
type CardSpec = {
  id: CardId;
  label: string;
  name: string;
  features: string[];
  highlighted?: boolean;
};

const CARDS: CardSpec[] = [
  {
    id: "free",
    label: "GRATUITO",
    name: "Grátis",
    features: [
      "Chat ilimitado",
      "Busca na web",
      "Análise de arquivos e imagens",
      "5 créditos no Estúdio",
    ],
  },
  {
    id: "plus",
    label: "PLUS",
    name: "Plus",
    features: [
      "Tudo do Gratuito",
      "Geração de imagem no chat",
      "30 créditos por mês no Estúdio",
      "Respostas em áudio",
    ],
  },
  {
    id: "ultra",
    label: "ULTRA",
    name: "Ultra",
    features: [
      "Tudo do Plus",
      "Edição de imagem no chat",
      "80 créditos por mês no Estúdio",
      "Prioridade máxima na fila",
    ],
    highlighted: true,
  },
  {
    id: "credits",
    label: "AVULSOS",
    name: "Créditos",
    features: [
      "Starter · 20 créditos · R$ 14,90",
      "Popular · 60 créditos · R$ 34,90",
      "Pro · 150 créditos · R$ 79,90",
    ],
  },
];
const PLAN_RANK: Record<string, number> = { free: 0, plus: 1, ultra: 2 };

export function SubscriptionTab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchSub = useServerFn(getMySubscription);
  const { data: sub, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => fetchSub(),
  });

  const [openPlan, setOpenPlan] = useState<PlanId | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("annual");

  const cancelFn = useServerFn(cancelMySubscription);
  const cancel = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      notify.success("Assinatura cancelada.");
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Erro."),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasActive = !!sub && sub.status === "active";
  const activePlanId = hasActive ? (sub!.plan_id as string) : null;
  const activeRank = hasActive && activePlanId ? PLAN_RANK[activePlanId] ?? -1 : -1;
  const isAnnual = period === "annual";
  const plus = PLANS.plus;
  const ultra = PLANS.ultra;

  const visibleCards = CARDS.filter((c) => {
    if (c.id === "credits") return true;
    if (!hasActive) return true;
    const rank = PLAN_RANK[c.id] ?? -1;
    return rank >= activeRank;
  });

  function renderPriceBlock(id: CardId) {
    if (id === "free") {
      return (
        <div className="mt-2">
          <p className="text-4xl font-bold tracking-tight" style={{ color: "#4ade80" }}>R$ 0</p>
          <p className="mt-1 text-xs" style={{ color: "#9ca3af" }}>para sempre</p>
        </div>
      );
    }
    if (id === "credits") {
      return (
        <div className="mt-2">
          <p className="text-xs" style={{ color: "#9ca3af" }}>A partir de</p>
          <p className="mt-1 text-4xl font-bold tracking-tight" style={{ color: "#4ade80" }}>
            R$ 14,90
          </p>
        </div>
      );
    }
    const p = id === "plus" ? plus : ultra;
    const monthly = isAnnual ? p.annualMonthlyPrice : p.price;
    return (
      <div className="mt-2">
        <p key={`${id}-${period}`} className="flex items-baseline gap-1 animate-fade-in">
          <span className="text-4xl font-bold tracking-tight tabular-nums" style={{ color: "#4ade80" }}>
            {fmtBRL(monthly)}
          </span>
          <span className="text-sm" style={{ color: "#9ca3af" }}>/mês</span>
        </p>
        {isAnnual ? (
          <div className="mt-1 space-y-0.5">
            <p style={{ color: "#6b7280", fontSize: "13px" }}>
              cobrado anualmente · {fmtBRL(p.annualTotalPrice)}
            </p>
            <p style={{ color: "#4b5563", fontSize: "12px" }}>vs {fmtBRL(p.price)}/mês</p>
          </div>
        ) : (
          <p className="mt-1 text-xs" style={{ color: "#6b7280" }}>&nbsp;</p>
        )}
      </div>
    );
  }

  function renderCta(card: CardSpec, isCurrent: boolean, isUpgrade: boolean) {
    if (isCurrent) {
      return (
        <Button
          disabled
          variant="outline"
          className="w-full disabled:opacity-100"
          style={{ borderColor: "#374151", color: "#9ca3af" }}
        >
          Plano atual
        </Button>
      );
    }
    if (card.id === "free") {
      return (
        <Button
          variant="outline"
          className="w-full"
          style={{ borderColor: "#374151", color: "#9ca3af", backgroundColor: "transparent" }}
          disabled
        >
          Plano gratuito
        </Button>
      );
    }
    if (card.id === "credits") {
      return (
        <Button
          variant="outline"
          className="w-full"
          style={{ borderColor: "#374151", color: "#9ca3af", backgroundColor: "transparent" }}
          onClick={() => navigate({ to: "/creditos" })}
        >
          Ver pacotes
        </Button>
      );
    }
    return (
      <Button
        className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white"
        onClick={() => setOpenPlan(card.id as PlanId)}
      >
        {isUpgrade ? "Fazer upgrade" : `Assinar ${card.name}`}
      </Button>
    );
  }

  return (
    <div className="space-y-8">
      {hasActive && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1a1a2e] bg-[#0F0F1A] px-4 py-3">
          <div className="text-sm">
            <span style={{ color: "#9ca3af" }}>Plano atual: </span>
            <span style={{ color: "#8B6FFF", fontWeight: 600 }}>
              {PLANS[activePlanId as PlanId]?.name ?? activePlanId}
            </span>
            {sub?.expires_at && (
              <span style={{ color: "#6b7280" }} className="ml-2">
                · renova em {new Date(sub.expires_at).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            style={{ borderColor: "#374151", color: "#9ca3af" }}
          >
            {cancel.isPending ? "Cancelando..." : "Cancelar assinatura"}
          </Button>
        </div>
      )}

      {/* Monthly / Annual toggle */}
      <div className="flex flex-col items-center">
        <div className="inline-flex items-center rounded-full border border-[#1a1a2e] p-1">
          {(["monthly", "annual"] as BillingPeriod[]).map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-full px-5 py-1.5 text-sm font-medium transition-colors",
                  active ? "text-white" : "text-muted-foreground hover:text-foreground",
                )}
                style={active ? { backgroundColor: "#6C47FF" } : undefined}
              >
                {p === "monthly" ? "Mensal" : "Anual"}
              </button>
            );
          })}
        </div>
        <p
          className={cn(
            "mt-3 text-xs text-muted-foreground transition-opacity duration-200",
            isAnnual ? "opacity-100" : "opacity-0",
          )}
        >
          Economize até 33% com cobrança anual
        </p>
      </div>

      <div className="mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-center max-w-[1180px]">
        {visibleCards.map((card) => {
          const isCurrent =
            (card.id === "free" && !hasActive) ||
            (hasActive && card.id === activePlanId);
          const isUpgrade =
            hasActive &&
            (card.id === "plus" || card.id === "ultra") &&
            (PLAN_RANK[card.id] ?? -1) > activeRank;
          const isDowngrade =
            hasActive &&
            (card.id === "plus" || card.id === "ultra") &&
            (PLAN_RANK[card.id] ?? -1) < activeRank;

          return (
            <div
              key={card.id}
              className={cn(
                "relative flex flex-col rounded-2xl bg-transparent p-7 transition-all",
                "border w-full max-w-[280px] mx-auto",
                isDowngrade && "opacity-50",
              )}
              style={{
                borderColor: card.highlighted ? "rgba(108, 71, 255, 0.5)" : "#1a1a2e",
                boxShadow: card.highlighted ? "0 0 40px rgba(108,71,255,0.08)" : undefined,
              }}
            >
              <p
                className="text-[11px] font-medium uppercase"
                style={{ color: "#6b7280", letterSpacing: "0.1em" }}
              >
                {card.label}
              </p>
              <h2 className="mt-2 text-2xl font-semibold" style={{ color: "#8B6FFF" }}>
                {card.name}
              </h2>

              {card.highlighted && (
                <p
                  className="mt-3 uppercase"
                  style={{ color: "#8B6FFF", fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em" }}
                >
                  Mais escolhido
                </p>
              )}

              {renderPriceBlock(card.id)}

              <div className="my-6 h-px w-full" style={{ backgroundColor: "#1f2937" }} />

              <ul className="flex-1 space-y-0 text-sm" style={{ lineHeight: "1.8" }}>
                {card.features.map((f, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-2.5",
                      card.id === "credits" && "gap-0",
                    )}
                  >
                    {card.id !== "credits" && (
                      <Check className="mt-2 shrink-0" size={14} style={{ color: "#6C47FF" }} />
                    )}
                    <span style={{ color: "#d1d5db" }}>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">{renderCta(card, isCurrent, isUpgrade)}</div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Todos os planos incluem o Estúdio de Criação sem censura e sem filtros.
      </p>

      {openPlan && (
        <PlanCheckoutDialog
          planId={openPlan}
          open={!!openPlan}
          onOpenChange={(v) => !v && setOpenPlan(null)}
          billingPeriod={period}
        />
      )}
    </div>
  );
}

export function PlanCheckoutDialog({
  planId,
  open,
  onOpenChange,
  billingPeriod = "monthly",
}: {
  planId: PlanId;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  billingPeriod?: BillingPeriod;
}) {
  const plan = PLANS[planId];
  const [coupon, setCoupon] = useState<AppliedCoupon>(null);
  const [pixOpen, setPixOpen] = useState(false);

  const basePrice = planPriceFor(planId, billingPeriod);
  const finalPrice = useMemo(
    () => (coupon ? applyDiscount(basePrice, coupon.discountPercent) : basePrice),
    [basePrice, coupon],
  );
  const isAnnual = billingPeriod === "annual";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-[#0A0A0F] border-border">
        <DialogHeader>
          <DialogTitle>
            Assinar {plan.name}
            {isAnnual ? " (anual)" : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-[#13131A] border border-[#1E1E2E] p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{plan.name}</p>
              <p className="text-xs text-zinc-400">
                {plan.credits} créditos/mês · {isAnnual ? "cobrado anualmente" : "cobrado mensalmente"}
              </p>
            </div>
            <div className="text-right">
              {coupon && (
                <p className="text-xs text-zinc-500 line-through">{formatBRL(basePrice)}</p>
              )}
              <p className="text-lg font-bold text-white">
                {formatBRL(finalPrice)}
                <span className="text-xs font-normal text-zinc-400">
                  {isAnnual ? "/ano" : "/mês"}
                </span>
              </p>
            </div>
          </div>
          <CouponField value={coupon} onApply={setCoupon} />
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
            Após confirmar o pagamento, sua assinatura é ativada automaticamente.
          </p>
        </div>
      </DialogContent>
      <MpPixModal
        open={pixOpen}
        onOpenChange={setPixOpen}
        kind="subscription"
        id={planId}
        name={`Assinatura ${plan.name}${isAnnual ? " (anual)" : ""}`}
        amount={finalPrice}
        couponCode={coupon?.code ?? null}
        billingPeriod={billingPeriod}
        onPaid={() => onOpenChange(false)}
      />
    </Dialog>
  );
}
