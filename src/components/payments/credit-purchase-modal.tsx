import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Loader2, Check, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { CREDIT_PACKS, applyDiscount, type CreditPackId } from "@/lib/payments-config";
import {
  buyCredits,
  checkPayment,
  getCheckoutProfile,
  saveCheckoutProfile,
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

type Step = "select" | "customer" | "checkout" | "pix" | "success";

export function CreditPurchaseModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("select");
  const [packId, setPackId] = useState<CreditPackId>("popular");
  const [coupon, setCoupon] = useState<AppliedCoupon>(null);
  const [method, setMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const { card, setCard, holder, setHolder, sanitized } = useCardForm(user?.email ?? "");

  const [pix, setPix] = useState<{ paymentId: string; image: string; payload: string } | null>(
    null,
  );
  const [timeLeft, setTimeLeft] = useState(30 * 60);

  const pack = CREDIT_PACKS[packId];
  const finalPrice = useMemo(
    () => (coupon ? applyDiscount(pack.price, coupon.discountPercent) : pack.price),
    [pack.price, coupon],
  );

  const buy = useServerFn(buyCredits);
  const check = useServerFn(checkPayment);
  const fetchProfile = useServerFn(getCheckoutProfile);
  const saveProfile = useServerFn(saveCheckoutProfile);

  const profileQ = useQuery({
    queryKey: ["checkout-profile"],
    queryFn: () => fetchProfile(),
    enabled: open,
  });

  // When user prefills holder data for card, sync from profile
  useEffect(() => {
    if (profileQ.data) {
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
      setStep("checkout");
    },
    onError: (e) =>
      notify.error(e instanceof Error ? e.message : "Erro ao salvar dados."),
  });

  function goToCheckout() {
    if (profileQ.data?.ready) {
      setStep("checkout");
    } else {
      setStep("customer");
    }
  }

  const purchase = useMutation({
    mutationFn: async () => {
      if (method === "PIX") {
        return buy({
          data: {
            packId,
            method: "PIX",
            couponCode: coupon?.code ?? null,
          },
        });
      }
      const { card: c, holder: h } = sanitized();
      return buy({
        data: {
          packId,
          method: "CREDIT_CARD",
          couponCode: coupon?.code ?? null,
          card: c,
          holder: h,
        },
      });
    },
    onSuccess: (res) => {
      if (res.method === "PIX") {
        setPix({
          paymentId: res.paymentId,
          image: res.qrCodeImage,
          payload: res.qrCodePayload,
        });
        setTimeLeft(30 * 60);
        setStep("pix");
      } else {
        if (["CONFIRMED", "RECEIVED"].includes(res.status)) {
          qc.invalidateQueries({ queryKey: ["credits"] });
          notify.success("Créditos adicionados com sucesso! 🎉");
          setStep("success");
        } else {
          notify.error("Pagamento não aprovado. Tente outro cartão.");
        }
      }
    },
    onError: (e) => notify.error(e instanceof Error ? e.message : "Erro no pagamento."),
  });

  // PIX polling
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (step !== "pix" || !pix) return;
    intervalRef.current = window.setInterval(async () => {
      try {
        const res = await check({ data: { paymentId: pix.paymentId } });
        if (["CONFIRMED", "RECEIVED"].includes(res.status)) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          qc.invalidateQueries({ queryKey: ["credits"] });
          notify.success("Créditos adicionados com sucesso! 🎉");
          setStep("success");
        }
      } catch { /* ignore */ }
    }, 5000);
    const timer = window.setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(timer);
    };
  }, [step, pix, check, qc]);

  function reset() {
    setStep("select");
    setCoupon(null);
    setPix(null);
    setTimeLeft(30 * 60);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTimeout(reset, 300);
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== "select" && step !== "success" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => {
                  if (step === "checkout" && !profileQ.data?.ready) setStep("customer");
                  else if (step === "customer") setStep("select");
                  else if (step === "checkout") setStep("select");
                  else if (step === "pix") setStep("checkout");
                }}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {step === "select" && "Comprar créditos"}
            {step === "customer" && "Seus dados"}
            {step === "checkout" && "Finalizar pagamento"}
            {step === "pix" && "Pague com PIX"}
            {step === "success" && "Tudo certo!"}
          </DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-3">
            {(Object.keys(CREDIT_PACKS) as CreditPackId[]).map((id) => {
              const p = CREDIT_PACKS[id];
              const active = packId === id;
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => setPackId(id)}
                  className={cn(
                    "w-full text-left rounded-lg border p-4 transition-colors relative",
                    active
                      ? "border-accent bg-accent/5 ring-1 ring-accent/40"
                      : "border-border hover:border-accent/60",
                  )}
                >
                  {p.popular && (
                    <Badge className="absolute -top-2 right-3 bg-accent text-accent-foreground">
                      Mais popular
                    </Badge>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Sparkles className="size-3.5 text-accent" />
                        {p.credits} créditos
                      </p>
                    </div>
                    <p className="text-xl font-bold">
                      R$ {p.price.toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                </button>
              );
            })}
            <Button className="w-full" onClick={goToCheckout}>
              Continuar
            </Button>
          </div>
        )}

        {step === "customer" && (
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
        )}

        {step === "checkout" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{pack.name}</p>
                <p className="text-xs text-muted-foreground">{pack.credits} créditos</p>
              </div>
              <div className="text-right">
                {coupon && (
                  <p className="text-xs text-muted-foreground line-through">
                    R$ {pack.price.toFixed(2).replace(".", ",")}
                  </p>
                )}
                <p className="text-lg font-bold">
                  R$ {finalPrice.toFixed(2).replace(".", ",")}
                </p>
              </div>
            </div>
            <CouponField value={coupon} onApply={setCoupon} />
            <Tabs value={method} onValueChange={(v) => setMethod(v as any)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="PIX">PIX</TabsTrigger>
                <TabsTrigger value="CREDIT_CARD">Cartão</TabsTrigger>
              </TabsList>
              <TabsContent value="PIX" className="pt-3">
                <p className="text-sm text-muted-foreground">
                  Você verá o QR Code na próxima etapa. A liberação é automática.
                </p>
              </TabsContent>
              <TabsContent value="CREDIT_CARD" className="pt-3">
                <CardFields card={card} setCard={setCard} holder={holder} setHolder={setHolder} />
              </TabsContent>
            </Tabs>
            <Button
              className="w-full"
              disabled={purchase.isPending}
              onClick={() => purchase.mutate()}
            >
              {purchase.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Processando...
                </>
              ) : (
                `Pagar R$ ${finalPrice.toFixed(2).replace(".", ",")}`
              )}
            </Button>
          </div>
        )}

        {step === "pix" && pix && (
          <div className="space-y-4">
            <PixDisplay qrCodeImage={pix.image} payload={pix.payload} />
            <CountdownTimer seconds={timeLeft} />
            <p className="text-xs text-muted-foreground text-center">
              Aguardando confirmação do pagamento...
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="text-center space-y-4 py-4">
            <div className="mx-auto size-16 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="size-8 text-success" />
            </div>
            <div>
              <p className="text-lg font-semibold">Créditos adicionados! 🎉</p>
              <p className="text-sm text-muted-foreground">
                {pack.credits} créditos já estão disponíveis na sua conta.
              </p>
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Voltar ao Estúdio
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}