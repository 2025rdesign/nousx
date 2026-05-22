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
import {
  Sparkles,
  Loader2,
  Check,
  ArrowLeft,
  Gem,
  Clock,
  ShieldCheck,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { CREDIT_PACKS, applyDiscount, type CreditPackId } from "@/lib/payments-config";
import {
  buyCredits,
  checkPayment,
  getCheckoutProfile,
  saveCheckoutProfile,
} from "@/lib/payments.functions";
import { getCredits } from "@/lib/credits.functions";
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

// Per-pack metadata for display (price-per-image, expiry copy).
const PACK_META: Record<
  CreditPackId,
  {
    expiresDays: number | null;
    badge?: { label: string; tone: "purple" | "gold" };
    tag?: { label: string; tone: "muted" | "green" };
    accent: "muted" | "purple" | "gold";
    blurb: string;
  }
> = {
  starter: {
    expiresDays: 10,
    tag: { label: "Para experimentar", tone: "muted" },
    accent: "muted",
    blurb: "Ideal para um primeiro teste.",
  },
  popular: {
    expiresDays: 30,
    badge: { label: "MAIS POPULAR", tone: "purple" },
    accent: "purple",
    blurb: "O melhor equilíbrio entre preço e quantidade.",
  },
  pro: {
    expiresDays: null,
    badge: { label: "MELHOR VALOR", tone: "gold" },
    tag: { label: "Sem expiração", tone: "green" },
    accent: "gold",
    blurb: "Para quem usa o Estúdio com frequência.",
  },
};

function formatBRL(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}
function pricePerImage(p: { price: number; credits: number }) {
  return p.price / p.credits;
}
function daysUntil(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

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
  const usedPercent = totalPurchased > 0
    ? Math.min(100, Math.round(((totalPurchased - balance) / totalPurchased) * 100))
    : 0;

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
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 border-border bg-[#0A0A0F] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-300">
        <div className="px-5 pt-5 pb-3">
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
            {step === "select" && "Créditos"}
            {step === "customer" && "Seus dados"}
            {step === "checkout" && "Finalizar pagamento"}
            {step === "pix" && "Pague com PIX"}
            {step === "success" && "Tudo certo!"}
          </DialogTitle>
        </DialogHeader>
        </div>

        {step === "select" && (
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
                  <p className="text-xs uppercase tracking-wider text-zinc-400">
                    Seu saldo atual
                  </p>
                  <p className="text-3xl font-bold text-white leading-tight">
                    {balance.toLocaleString("pt-BR")}{" "}
                    <span className="text-base font-medium text-zinc-400">
                      créditos
                    </span>
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
                <span className="text-zinc-500">
                  1 crédito = 1 geração de imagem no Estúdio
                </span>
              </div>
            </div>

            {/* Urgency banner */}
            {balance === 0 ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 flex items-center gap-2 text-sm text-red-300">
                <span aria-hidden>🚫</span>
                <span className="font-medium">
                  Sem créditos — gere imagens agora
                </span>
              </div>
            ) : balance < 10 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-2 text-sm text-amber-300">
                <Zap className="size-4" />
                <span>Seus créditos estão acabando!</span>
              </div>
            ) : null}

            {/* Section title */}
            <div>
              <h3 className="text-lg font-semibold text-white">
                Recarregue e economize mais
              </h3>
              <p className="text-sm text-zinc-400">
                Créditos maiores = menor custo por imagem
              </p>
            </div>

            {/* Packs grid */}
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(CREDIT_PACKS) as CreditPackId[]).map((id) => {
                const p = CREDIT_PACKS[id];
                const meta = PACK_META[id];
                const perImg = pricePerImage(p);
                const starterPer = pricePerImage(CREDIT_PACKS.starter);
                const savings =
                  id === "starter"
                    ? 0
                    : Math.round((1 - perImg / starterPer) * 100);
                const active = packId === id;
                const isPopular = meta.accent === "purple";
                const isPro = meta.accent === "gold";
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setPackId(id)}
                    className={cn(
                      "relative text-left rounded-2xl border bg-[#13131A] p-4 pt-5 transition-all flex flex-col",
                      "hover:-translate-y-0.5",
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
                    <p className="mt-2 text-2xl font-bold text-white">
                      {formatBRL(p.price)}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-white">
                      <Sparkles className="size-3.5 text-[#6C47FF]" />
                      <span className="font-semibold">{p.credits}</span>
                      <span className="text-zinc-400">créditos</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {formatBRL(perImg)} por imagem
                      {savings > 0 && (
                        <span className="ml-1 text-emerald-400 font-medium">
                          (-{savings}% vs Starter)
                        </span>
                      )}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {meta.expiresDays != null ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                          <Clock className="size-3" /> Expiram em{" "}
                          {meta.expiresDays} dias
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                          <ShieldCheck className="size-3" /> Nunca expiram
                        </span>
                      )}
                      {meta.tag && meta.tag.tone === "muted" && (
                        <span className="inline-flex items-center rounded-md bg-zinc-700/40 px-1.5 py-0.5 text-[10px] text-zinc-300">
                          {meta.tag.label}
                        </span>
                      )}
                    </div>

                    <div className="mt-4">
                      <span
                        className={cn(
                          "block w-full text-center text-sm font-semibold rounded-md py-2 transition-colors",
                          isPopular
                            ? "bg-[#6C47FF] text-white hover:bg-[#7d5cff]"
                            : isPro
                              ? "bg-[#6C47FF] text-white hover:bg-[#7d5cff]"
                              : "border border-zinc-600 text-white hover:bg-white/5",
                        )}
                      >
                        Comprar
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <Button
              className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white"
              onClick={goToCheckout}
            >
              Continuar com {CREDIT_PACKS[packId].name} ·{" "}
              {formatBRL(CREDIT_PACKS[packId].price)}
            </Button>

            {/* Footer trust block */}
            <div className="border-t border-[#1E1E2E] pt-4 space-y-1.5">
              <p className="flex items-center gap-2 text-xs text-zinc-400">
                <ShieldCheck className="size-3.5 text-emerald-400" />
                Pagamento seguro via PIX ou Cartão
              </p>
              <p className="flex items-center gap-2 text-xs text-zinc-400">
                <Zap className="size-3.5 text-amber-400" />
                Créditos liberados automaticamente após confirmação
              </p>
            </div>
          </div>
        )}

        {step === "customer" && (
          <div className="px-5 pb-5">
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
          </div>
        )}

        {step === "checkout" && (
          <div className="space-y-4 px-5 pb-5">
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
          <div className="space-y-4 px-5 pb-5">
            <PixDisplay qrCodeImage={pix.image} payload={pix.payload} />
            <CountdownTimer seconds={timeLeft} />
            <p className="text-xs text-muted-foreground text-center">
              Aguardando confirmação do pagamento...
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="text-center space-y-4 py-4 px-5 pb-5">
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