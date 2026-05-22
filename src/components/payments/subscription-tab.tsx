import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { PLANS, applyDiscount, type PlanId } from "@/lib/payments-config";
import {
  startSubscriptionCheckout,
  cancelMySubscription,
  getMySubscription,
} from "@/lib/payments.functions";
import { CouponField, type AppliedCoupon } from "./coupon-field";

const formatBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

export function SubscriptionTab() {
  const qc = useQueryClient();
  const fetchSub = useServerFn(getMySubscription);
  const { data: sub, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => fetchSub(),
  });

  const [openPlan, setOpenPlan] = useState<PlanId | null>(null);

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
      <Card className="border-border bg-card">
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (sub && sub.status === "active") {
    const plan = PLANS[sub.plan_id as PlanId];
    return (
      <div className="space-y-4">
        <Card className="border-success/40 bg-success/5 shadow-sm">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge className="mb-2 bg-success text-white hover:bg-success">
                  ● Plano {plan?.name} ativo
                </Badge>
                <h3 className="text-xl font-bold">{plan?.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {formatBRL(plan?.price ?? 0)}/mês
                </p>
              </div>
              {sub.expires_at && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Próxima renovação</p>
                  <p className="text-sm font-medium">
                    {new Date(sub.expires_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              {sub.plan_id !== "ultra" && (
                <Button className="flex-1" onClick={() => setOpenPlan("ultra")}>
                  Fazer upgrade para Ultra
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? "Cancelando..." : "Cancelar assinatura"}
              </Button>
            </div>
          </CardContent>
        </Card>
        {openPlan && (
          <PlanCheckoutDialog
            planId={openPlan}
            open={!!openPlan}
            onOpenChange={(v) => !v && setOpenPlan(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const plan = PLANS[id];
          const isUltra = id === "ultra";
          const perCredit = plan.price / plan.credits;
          const basePerCredit = PLANS.plus.price / PLANS.plus.credits;
          const savings = Math.round((1 - perCredit / basePerCredit) * 100);
          return (
            <Card
              key={id}
              className={cn(
                "border-border bg-card relative",
                isUltra && "border-accent ring-1 ring-accent/40",
              )}
            >
              {isUltra && (
                <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground">
                  {plan.tagline}
                </Badge>
              )}
              <CardContent className="pt-6 pb-6 space-y-4">
                <div>
                  {!isUltra && (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                      {plan.tagline}
                    </p>
                  )}
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-2 text-3xl font-bold">
                    {formatBRL(plan.price)}
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
                  </p>
                  <p
                    className={cn(
                      "text-xs mt-1",
                      isUltra ? "text-accent font-medium" : "text-muted-foreground",
                    )}
                  >
                    {formatBRL(perCredit)} por crédito
                    {isUltra && savings > 0 && ` — economize ${savings}%`}
                  </p>
                </div>
                <ul className="space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="size-4 text-success mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={isUltra ? "default" : "outline"}
                  onClick={() => setOpenPlan(id)}
                >
                  Assinar {plan.name}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Precisa de mais créditos? Compre pacotes avulsos no{" "}
        <Link to="/studio" className="text-accent hover:underline font-medium">
          Estúdio
        </Link>
        .
      </p>
      {openPlan && (
        <PlanCheckoutDialog
          planId={openPlan}
          open={!!openPlan}
          onOpenChange={(v) => !v && setOpenPlan(null)}
        />
      )}
    </div>
  );
}

function PlanCheckoutDialog({
  planId,
  open,
  onOpenChange,
}: {
  planId: PlanId;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const plan = PLANS[planId];
  const [coupon, setCoupon] = useState<AppliedCoupon>(null);

  const finalPrice = useMemo(
    () => (coupon ? applyDiscount(plan.price, coupon.discountPercent) : plan.price),
    [plan.price, coupon],
  );

  const start = useServerFn(startSubscriptionCheckout);
  const m = useMutation({
    mutationFn: () => start({ data: { planId, couponCode: coupon?.code ?? null } }),
    onSuccess: (res) => {
      notify.success("Redirecionando para o checkout seguro...");
      window.location.href = res.checkoutUrl;
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Erro ao assinar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-[#0A0A0F] border-border">
        <DialogHeader>
          <DialogTitle>Assinar {plan.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-[#13131A] border border-[#1E1E2E] p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">{plan.name}</p>
              <p className="text-xs text-zinc-400">{plan.credits} créditos/mês</p>
            </div>
            <div className="text-right">
              {coupon && (
                <p className="text-xs text-zinc-500 line-through">{formatBRL(plan.price)}</p>
              )}
              <p className="text-lg font-bold text-white">{formatBRL(finalPrice)}/mês</p>
            </div>
          </div>
          <CouponField value={coupon} onApply={setCoupon} />
          <Button
            className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white"
            onClick={() => m.mutate()}
            disabled={m.isPending}
          >
            {m.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" /> Redirecionando...
              </>
            ) : (
              `Assinar — ${formatBRL(finalPrice)}/mês`
            )}
          </Button>
          <p className="text-xs text-zinc-500 text-center">
            Você será redirecionado para um checkout seguro. Sua assinatura será ativada
            automaticamente após a confirmação.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
