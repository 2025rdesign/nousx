import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useActivePlan } from "@/hooks/use-active-plan";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Check, Sparkles, Crown, Zap, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLANS as PLAN_PRICING,
  type BillingPeriod,
  type PlanId,
} from "@/lib/payments-config";
import { PlanCheckoutDialog } from "@/components/payments/subscription-tab";

const LOGO_DARK =
  "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png";
const LOGO_LIGHT =
  "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH-VARIANTE-MODO-CLARO.png";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos — AuraIA" },
      {
        name: "description",
        content:
          "Escolha o plano ideal para você. Comece grátis e evolua para Plus ou Ultra.",
      },
      { property: "og:title", content: "Planos — AuraIA" },
      {
        property: "og:description",
        content:
          "Escolha o plano ideal para você. Comece grátis e evolua para Plus ou Ultra.",
      },
    ],
  }),
  component: PlanosPage,
});

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

type CardId = "free" | "plus" | "ultra" | "credits";
type CardSpec = {
  id: CardId;
  badge: string;
  badgeStyle: string;
  icon: React.ElementType;
  name: string;
  features: string[];
  highlighted?: boolean;
};

function PlanosPage() {
  const { user } = useAuth();
  const { hasActive, planId } = useActivePlan();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? LOGO_DARK : LOGO_LIGHT;

  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const [checkout, setCheckout] = useState<PlanId | null>(null);

  const PLAN_RANK: Record<string, number> = { free: 0, plus: 1, ultra: 2 };
  const activeRank = hasActive && planId ? PLAN_RANK[planId] ?? -1 : -1;
  const isAnnual = period === "annual";
  const plus = PLAN_PRICING.plus;
  const ultra = PLAN_PRICING.ultra;

  const cards: CardSpec[] = [
    {
      id: "free",
      badge: "Grátis",
      badgeStyle: "bg-muted text-muted-foreground",
      icon: Sparkles,
      name: "Gratuito",
      features: [
        "Chat ilimitado",
        "Busca na web",
        "Análise de arquivos e imagens",
        "5 créditos de boas-vindas no Estúdio",
      ],
    },
    {
      id: "plus",
      badge: "Plus",
      badgeStyle: "bg-primary text-primary-foreground",
      icon: Crown,
      name: "Plus",
      features: [
        "Tudo do Gratuito",
        "Geração de imagem no chat",
        "30 créditos por mês no Estúdio",
        "Respostas em áudio (TTS)",
      ],
    },
    {
      id: "ultra",
      badge: "Ultra",
      badgeStyle: "bg-[#6C47FF] text-white",
      icon: Zap,
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
      badge: "Sem assinatura",
      badgeStyle: "bg-secondary text-secondary-foreground",
      icon: Package,
      name: "Créditos avulsos",
      features: [
        "Starter: 20 créditos por R$ 14,90",
        "Popular: 60 créditos por R$ 34,90",
        "Pro: 150 créditos por R$ 79,90",
      ],
    },
  ];

  const visibleCards = cards.filter((c) => {
    if (c.id === "credits") return true;
    if (!user || !hasActive) return true;
    const rank = PLAN_RANK[c.id] ?? -1;
    return rank >= activeRank;
  });

  const handlePaidCta = (id: PlanId) => {
    if (!user) {
      navigate({ to: "/auth", search: { tab: "login" } as any });
      return;
    }
    setCheckout(id);
  };

  function renderPriceBlock(id: CardId) {
    if (id === "free") {
      return (
        <p className="mt-1 flex items-baseline justify-center gap-1">
          <span className="text-3xl font-bold">R$ 0</span>
          <span className="text-sm text-muted-foreground">/sempre</span>
        </p>
      );
    }
    if (id === "credits") {
      return (
        <p className="mt-1 text-sm text-muted-foreground">
          A partir de{" "}
          <span className="font-semibold text-foreground">R$ 14,90</span>
        </p>
      );
    }
    const p = id === "plus" ? plus : ultra;
    const monthly = isAnnual ? p.annualMonthlyPrice : p.price;
    return (
      <div className="mt-1 space-y-1">
        <p className="flex items-baseline justify-center gap-1 transition-all duration-300">
          <span className="text-3xl font-bold tabular-nums">
            {fmtBRL(monthly)}
          </span>
          <span className="text-sm text-muted-foreground">/mês</span>
        </p>
        {isAnnual ? (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground line-through">
              {fmtBRL(p.price)}/mês
            </p>
            <p className="text-[11px] text-muted-foreground">
              cobrado como {fmtBRL(p.annualTotalPrice)}/ano
            </p>
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              Economize {p.annualSavingsPercent}%
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            cobrado mensalmente
          </p>
        )}
      </div>
    );
  }

  function renderCta(card: CardSpec, isCurrent: boolean, isUpgrade: boolean) {
    if (isCurrent) {
      return (
        <Button
          disabled
          className="w-full bg-emerald-600/90 hover:bg-emerald-600/90 text-white disabled:opacity-100"
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
          onClick={() =>
            user
              ? navigate({ to: "/" })
              : navigate({ to: "/auth", search: { tab: "signup" } as any })
          }
        >
          {user ? "Plano atual" : "Criar conta grátis"}
        </Button>
      );
    }
    if (card.id === "credits") {
      return (
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            user
              ? navigate({ to: "/creditos" })
              : navigate({ to: "/auth", search: { tab: "login" } as any })
          }
        >
          Ver pacotes
        </Button>
      );
    }
    return (
      <Button
        className="w-full bg-[#6C47FF] hover:bg-[#7d5cff] text-white"
        onClick={() => handlePaidCta(card.id as PlanId)}
      >
        {isUpgrade ? "Fazer upgrade" : `Assinar ${card.name}`}
      </Button>
    );
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center shrink-0">
            <img
              src={logoSrc}
              alt="AuraIA"
              className="h-8 w-auto object-contain"
            />
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Button size="sm" asChild>
                <Link to="/">Chat</Link>
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate({ to: "/auth", search: { tab: "login" } as any })
                  }
                >
                  Entrar
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    navigate({ to: "/auth", search: { tab: "signup" } as any })
                  }
                >
                  Criar conta
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <header className="text-center mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Escolha seu plano
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Comece grátis. Sem cartão de crédito.
          </p>
        </header>

        {/* Monthly / Annual toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center rounded-full border border-border bg-card p-1">
            {(["monthly", "annual"] as BillingPeriod[]).map((p) => {
              const active = period === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "relative rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                    active
                      ? "bg-[#6C47FF] text-white shadow"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p === "monthly" ? "Mensal" : "Anual"}
                  {p === "annual" && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                      Mais popular
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {visibleCards.map((card) => {
            const isCurrent =
              !!user &&
              ((card.id === "free" && !hasActive) ||
                (hasActive && card.id === planId));
            const isUpgrade =
              !!user &&
              hasActive &&
              (card.id === "plus" || card.id === "ultra") &&
              (PLAN_RANK[card.id] ?? -1) > activeRank;
            const isDowngrade =
              !!user &&
              hasActive &&
              (card.id === "plus" || card.id === "ultra") &&
              (PLAN_RANK[card.id] ?? -1) < activeRank;

            return (
              <Card
                key={card.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border-border bg-card transition-all",
                  card.highlighted &&
                    !isCurrent &&
                    "border-[#6C47FF] ring-1 ring-[#6C47FF]/40 shadow-[0_0_40px_-8px_rgba(108,71,255,0.35)]",
                  isCurrent &&
                    "border-emerald-500/60 ring-1 ring-emerald-500/30",
                  isDowngrade && "opacity-50",
                )}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold leading-none",
                      isCurrent
                        ? "bg-emerald-500 text-white"
                        : card.badgeStyle,
                    )}
                  >
                    {isCurrent ? "Plano atual" : card.badge}
                  </span>
                  {card.highlighted && !isCurrent && (
                    <span className="inline-flex items-center rounded-full bg-gradient-to-r from-[#6C47FF] to-[#9B7BFF] px-3 py-1 text-[10px] font-bold leading-none text-white shadow">
                      Mais popular
                    </span>
                  )}
                </div>

                <CardHeader className="pt-7 pb-2 text-center">
                  <div
                    className={cn(
                      "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full",
                      card.highlighted ? "bg-[#6C47FF]/15" : "bg-primary/10",
                    )}
                  >
                    <card.icon
                      className={cn(
                        "h-5 w-5",
                        card.highlighted ? "text-[#9B7BFF]" : "text-primary",
                      )}
                    />
                  </div>
                  <h2 className="text-lg font-semibold">{card.name}</h2>
                  {renderPriceBlock(card.id)}
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-4 pb-6">
                  <ul className="space-y-2.5 text-sm">
                    {card.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-3">
                    {renderCta(card, isCurrent, isUpgrade)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Todos os planos incluem acesso ao Estúdio de Criação sem censura e sem
          filtros.
        </p>
      </div>

      {checkout && (
        <PlanCheckoutDialog
          planId={checkout}
          open={!!checkout}
          onOpenChange={(v) => !v && setCheckout(null)}
          billingPeriod={period}
        />
      )}
    </div>
  );
}