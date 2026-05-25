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
import { Check, Loader2, Sparkles } from "lucide-react";
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
  getMyLatestSubscription,
  listMyPaymentHistory,
} from "@/lib/payments.functions";
import { getCredits } from "@/lib/credits.functions";
import { CreditPurchaseModal } from "./credit-purchase-modal";
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
  const fetchSub = useServerFn(getMySubscription);
  const fetchLatestSub = useServerFn(getMyLatestSubscription);
  const fetchCredits = useServerFn(getCredits);
  const fetchHistory = useServerFn(listMyPaymentHistory);
  const { data: sub, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => fetchSub(),
  });
  const { data: latestSub } = useQuery({
    queryKey: ["my-subscription-latest"],
    queryFn: () => fetchLatestSub(),
  });
  const { data: credits } = useQuery({
    queryKey: ["my-credits"],
    queryFn: () => fetchCredits(),
  });
  const { data: history } = useQuery({
    queryKey: ["my-payment-history"],
    queryFn: () => fetchHistory(),
  });

  const [openPlan, setOpenPlan] = useState<PlanId | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const [creditsOpen, setCreditsOpen] = useState(false);

  const cancelFn = useServerFn(cancelMySubscription);
  const cancel = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      qc.invalidateQueries({ queryKey: ["my-subscription-latest"] });
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
  const isAnnual = period === "annual";

  // Detect expired sub: latest sub exists, not active, and has expires_at in the past.
  const expired =
    !hasActive &&
    !!latestSub &&
    latestSub.status !== "active" &&
    latestSub.status !== "pending" &&
    !!latestSub.expires_at &&
    new Date(latestSub.expires_at).getTime() < Date.now();

  // Cards to show when not on Ultra:
  //  - State A on Plus → only Ultra upgrade card
  //  - State B/C (no active) → Plus + Ultra
  let upsellCards: CardSpec[] = [];
  if (hasActive && activePlanId === "plus") {
    upsellCards = CARDS.filter((c) => c.id === "ultra");
  } else if (!hasActive) {
    upsellCards = CARDS.filter((c) => c.id === "plus" || c.id === "ultra");
  }
  // Ultra users: upsellCards = [] (no plan cards shown)

  function renderPriceBlock(id: CardId) {
    const p = id === "plus" ? PLANS.plus : PLANS.ultra;
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

  function renderUpsellCta(card: CardSpec) {
    return (
      <Button
        className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white"
        onClick={() => setOpenPlan(card.id as PlanId)}
      >
        {hasActive ? "Fazer upgrade" : `Assinar ${card.name}`}
      </Button>
    );
  }

  const renewLabel = sub?.expires_at
    ? new Date(sub.expires_at).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-[600px] space-y-6">
      {/* ────── State A: Active plan summary ────── */}
      {hasActive && (
        <section
          className="rounded-xl border p-5"
          style={{ borderColor: "#1f2937", backgroundColor: "#111118" }}
        >
          <p
            className="text-[11px] font-medium uppercase"
            style={{ color: "#6b7280", letterSpacing: "0.1em" }}
          >
            Plano
          </p>
          <h2 className="mt-1 text-3xl font-semibold" style={{ color: "#8B6FFF" }}>
            {PLANS[activePlanId as PlanId]?.name ?? activePlanId}
          </h2>
          {renewLabel && (
            <p className="mt-1 text-sm" style={{ color: "#6b7280" }}>
              Renova em {renewLabel}
            </p>
          )}
          <p className="mt-4 text-lg font-bold text-white">
            <span className="tabular-nums">{credits?.balance ?? 0}</span>{" "}
            <span className="text-sm font-normal" style={{ color: "#9ca3af" }}>
              créditos disponíveis
            </span>
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:flex-1 bg-transparent hover:bg-[#6C47FF]/10"
              style={{ borderColor: "#6C47FF", color: "#8B6FFF" }}
              onClick={() => setCreditsOpen(true)}
            >
              Comprar créditos
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
              style={{ color: "#6b7280" }}
            >
              {cancel.isPending ? "Cancelando..." : "Cancelar assinatura"}
            </Button>
          </div>
        </section>
      )}

      {/* ────── State B/C: No active plan headline ────── */}
      {!hasActive && (
        <section className="text-center sm:text-left">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            Você não tem um plano ativo
          </h2>
          {expired && latestSub?.expires_at && (
            <p className="mt-2 text-sm" style={{ color: "#9ca3af" }}>
              Seu plano expirou em{" "}
              {new Date(latestSub.expires_at).toLocaleDateString("pt-BR")}
            </p>
          )}
          {!expired && (
            <p className="mt-2 text-sm" style={{ color: "#9ca3af" }}>
              Escolha um plano e desbloqueie o Estúdio sem limites.
            </p>
          )}
        </section>
      )}

      {/* ────── Plan cards (only when there's an upsell) ────── */}
      {upsellCards.length > 0 && (
        <>
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

          <div
            className={cn(
              "mx-auto grid gap-6 justify-center",
              upsellCards.length === 1
                ? "grid-cols-1 max-w-[320px]"
                : "grid-cols-1 sm:grid-cols-2 max-w-[620px]",
            )}
          >
            {upsellCards.map((card) => (
              <div
                key={card.id}
                className="relative flex flex-col rounded-2xl bg-transparent p-7 transition-all border w-full max-w-[300px] mx-auto"
                style={{
                  borderColor: card.highlighted
                    ? "rgba(108, 71, 255, 0.5)"
                    : "#1a1a2e",
                  boxShadow: card.highlighted
                    ? "0 0 40px rgba(108,71,255,0.08)"
                    : undefined,
                }}
              >
                <p
                  className="text-[11px] font-medium uppercase"
                  style={{ color: "#6b7280", letterSpacing: "0.1em" }}
                >
                  {card.label}
                </p>
                <h3 className="mt-2 text-2xl font-semibold" style={{ color: "#8B6FFF" }}>
                  {card.name}
                </h3>

                {card.highlighted && (
                  <p
                    className="mt-3 uppercase"
                    style={{
                      color: "#8B6FFF",
                      fontSize: "11px",
                      fontWeight: 500,
                      letterSpacing: "0.05em",
                    }}
                  >
                    Mais escolhido
                  </p>
                )}

                {renderPriceBlock(card.id)}

                <div
                  className="my-6 h-px w-full"
                  style={{ backgroundColor: "#1f2937" }}
                />

                <ul
                  className="flex-1 space-y-0 text-sm"
                  style={{ lineHeight: "1.8" }}
                >
                  {card.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check
                        className="mt-2 shrink-0"
                        size={14}
                        style={{ color: "#6C47FF" }}
                      />
                      <span style={{ color: "#d1d5db" }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">{renderUpsellCta(card)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ────── Ultra-only celebratory note (no cards) ────── */}
      {hasActive && activePlanId === "ultra" && (
        <div
          className="flex items-center gap-3 rounded-2xl border px-5 py-4"
          style={{
            borderColor: "rgba(108,71,255,0.4)",
            backgroundColor: "rgba(108,71,255,0.06)",
          }}
        >
          <Sparkles size={18} style={{ color: "#8B6FFF" }} />
          <p className="text-sm" style={{ color: "#d1d5db" }}>
            Você está no plano máximo. Aproveite tudo sem limites.
          </p>
        </div>
      )}

      {/* ────── Purchase history ────── */}
      {history && history.length > 0 && (
        <section className="space-y-3">
          <h3
            className="text-[11px] font-medium uppercase"
            style={{ color: "#6b7280", letterSpacing: "0.1em" }}
          >
            Histórico de compras
          </h3>
          <ul
            className="divide-y rounded-xl border"
            style={{ borderColor: "#1a1a2e", backgroundColor: "#0F0F1A" }}
          >
            {history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                style={{ borderColor: "#1a1a2e" }}
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">
                    {h.type === "subscription"
                      ? "Assinatura"
                      : h.type === "credits"
                        ? "Créditos"
                        : h.type ?? "Pagamento"}
                  </p>
                  <p className="text-xs" style={{ color: "#6b7280" }}>
                    {new Date(h.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                    {" · "}
                    <span
                      style={{
                        color:
                          h.status === "approved" || h.status === "paid"
                            ? "#4ade80"
                            : h.status === "pending"
                              ? "#f59e0b"
                              : "#9ca3af",
                      }}
                    >
                      {h.status}
                    </span>
                  </p>
                </div>
                <p
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: "#4ade80" }}
                >
                  {fmtBRL(Number(h.amount))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      <CreditPurchaseModal open={creditsOpen} onOpenChange={setCreditsOpen} />
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
