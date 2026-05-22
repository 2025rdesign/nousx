import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { PLANS, applyDiscount, type PlanId } from "@/lib/payments-config";
import {
  subscribePlan,
  cancelMySubscription,
  getMySubscription,
  getCheckoutProfile,
  saveCheckoutProfile,
  checkPayment,
} from "@/lib/payments.functions";
import { useAuth } from "@/hooks/use-auth";
import { CouponField, type AppliedCoupon } from "./coupon-field";
import {
  CardFields,
  CustomerDataStep,
  PixDisplay,
  CountdownTimer,
  useCardForm,
} from "./payment-forms";

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
                <Badge className="mb-2 bg-success text-success-foreground hover:bg-success">
                  ● Plano {plan?.name} ativo
                </Badge>
                <h3 className="text-xl font-bold">{plan?.name}</h3>
                <p className="text-sm text-muted-foreground">
                  R$ {plan?.price.toFixed(2).replace(".", ",")}/mês
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
                  Mais popular
                </Badge>
              )}
              <CardContent className="pt-6 pb-6 space-y-4">
                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-2 text-3xl font-bold">
                    R$ {plan.price.toFixed(2).replace(".", ",")}
                    <span className="text-sm font-normal text-muted-foreground">/mês</span>
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
      <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
        <Sparkles className="size-3.5 text-accent" />
        Os créditos do plano são adicionados todo mês automaticamente.
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
  const qc = useQueryClient();
  const { user } = useAuth();
  const plan = PLANS[planId];
  const [coupon, setCoupon] = useState<AppliedCoupon>(null);
  const [method, setMethod] = useState<"PIX" | "CREDIT_CARD">("CREDIT_CARD");
  const { card, setCard, holder, setHolder, sanitized } = useCardForm(user?.email ?? "");
  const [stage, setStage] = useState<"customer" | "checkout">("customer");

  const fetchProfile = useServerFn(getCheckoutProfile);
  const saveProfile = useServerFn(saveCheckoutProfile);
  const profileQ = useQuery({
    queryKey: ["checkout-profile"],
    queryFn: () => fetchProfile(),
    enabled: open,
  });

  useEffect(() => {
    if (profileQ.data) {
      if (profileQ.data.ready) setStage("checkout");
      setHolder((h) => ({
        ...h,
        name: h.name || profileQ.data!.name,
        cpfCnpj: h.cpfCnpj || profileQ.data!.cpf,
        email: profileQ.data!.email,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQ.data]);

  const saveProfileM = useMutation({
    mutationFn: (vars: { name: string; cpf: string }) =>
      saveProfile({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkout-profile"] });
      setStage("checkout");
    },
    onError: (e) =>
      notify.error(e instanceof Error ? e.message : "Erro ao salvar dados."),
  });

  const finalPrice = useMemo(
    () => (coupon ? applyDiscount(plan.price, coupon.discountPercent) : plan.price),
    [plan.price, coupon],
  );

  const subscribe = useServerFn(subscribePlan);
  const m = useMutation({
    mutationFn: () => {
      if (method === "CREDIT_CARD") {
        const { card: c, holder: h } = sanitized();
        return subscribe({
          data: { planId, method: "CREDIT_CARD", couponCode: coupon?.code ?? null, card: c, holder: h },
        });
      }
      return subscribe({
        data: { planId, method: "PIX", couponCode: coupon?.code ?? null },
      });
    },
    onSuccess: () => {
      notify.success("Plano ativado! 🚀");
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      qc.invalidateQueries({ queryKey: ["credits"] });
      onOpenChange(false);
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Erro ao assinar."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {stage === "customer" ? "Seus dados" : `Assinar ${plan.name}`}
          </DialogTitle>
        </DialogHeader>
        {stage === "customer" ? (
          <CustomerDataStep
            initial={{
              name: profileQ.data?.name ?? "",
              cpf: profileQ.data?.cpf ?? "",
            }}
            email={profileQ.data?.email ?? user?.email ?? ""}
            isPending={saveProfileM.isPending}
            onSubmit={(d) => saveProfileM.mutate(d)}
            submitLabel="Salvar e continuar"
          />
        ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between">
            <p className="text-sm">{plan.credits} créditos/mês</p>
            <div className="text-right">
              {coupon && (
                <p className="text-xs text-muted-foreground line-through">
                  R$ {plan.price.toFixed(2).replace(".", ",")}
                </p>
              )}
              <p className="text-lg font-bold">
                R$ {finalPrice.toFixed(2).replace(".", ",")}/mês
              </p>
            </div>
          </div>
          <CouponField value={coupon} onApply={setCoupon} />
          <Tabs value={method} onValueChange={(v) => setMethod(v as any)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="CREDIT_CARD">Cartão</TabsTrigger>
              <TabsTrigger value="PIX">PIX</TabsTrigger>
            </TabsList>
            <TabsContent value="CREDIT_CARD" className="pt-3">
              <CardFields card={card} setCard={setCard} holder={holder} setHolder={setHolder} />
            </TabsContent>
            <TabsContent value="PIX" className="pt-3">
              <p className="text-sm text-muted-foreground">
                Toda renovação mensal será cobrada por PIX. Você receberá o QR Code por e-mail.
              </p>
            </TabsContent>
          </Tabs>
          <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Processando...
              </>
            ) : (
              `Confirmar — R$ ${finalPrice.toFixed(2).replace(".", ",")}/mês`
            )}
          </Button>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}