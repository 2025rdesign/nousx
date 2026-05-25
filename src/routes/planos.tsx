import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useActivePlan } from "@/hooks/use-active-plan";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
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
      { title: "Planos — Aura Chat" },
      {
        name: "description",
        content:
          "Escolha seu plano e desbloqueie recursos exclusivos. Comece grátis, sem cartão de crédito.",
      },
      { property: "og:title", content: "Planos — Aura Chat" },
      {
        property: "og:description",
        content:
          "Escolha seu plano e desbloqueie recursos exclusivos. Comece grátis, sem cartão de crédito.",
      },
    ],
    links: [{ rel: "canonical", href: "https://chataura.com.br/planos" }],
  }),
  component: PlanosPage,
});

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

type CardId = "free" | "plus" | "ultra" | "credits";
type CardSpec = {
  id: CardId;
  label: string;
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
      label: "GRATUITO",
      name: "Grátis",
      features: [
        "Chat ilimitado",
        "Busca na web",
        "Análise de arquivos e imagens",
        "Acesso ao Estúdio de Criação",
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
        <p
          key={`${id}-${period}`}
          className="flex items-baseline gap-1 animate-fade-in"
        >
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
            <p style={{ color: "#4b5563", fontSize: "12px" }}>
              vs {fmtBRL(p.price)}/mês
            </p>
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
          onClick={() =>
            user
              ? navigate({ to: "/" })
              : navigate({ to: "/auth", search: { tab: "signup" } as any })
          }
        >
          {user ? "Plano atual" : "Começar grátis"}
        </Button>
      );
    }
    if (card.id === "credits") {
      return (
        <Button
          variant="outline"
          className="w-full"
          style={{ borderColor: "#374151", color: "#9ca3af", backgroundColor: "transparent" }}
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
        className="sticky top-0 z-20 border-b border-[#1a1a2e] bg-background/80 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center shrink-0">
            <img
              src={logoSrc}
              alt="Aura Chat"
              className="w-auto object-contain"
              style={{ height: "36px" }}
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

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-14 md:py-20">
        <header className="text-center mb-12 md:mb-14">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">
            Escolha seu plano
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Comece grátis. Sem cartão de crédito.
          </p>
        </header>

        {/* Monthly / Annual toggle */}
        <div className="flex flex-col items-center mb-14">
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
                    active
                      ? "text-white"
                      : "text-muted-foreground hover:text-foreground",
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
              <div
                key={card.id}
                className={cn(
                  "relative flex flex-col rounded-2xl bg-transparent p-7 transition-all",
                  "border w-full max-w-[280px] mx-auto",
                  isDowngrade && "opacity-50",
                )}
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

                <div
                  className="my-6 h-px w-full"
                  style={{ backgroundColor: "#1f2937" }}
                />

                <ul
                  className="flex-1 space-y-0 text-sm"
                  style={{ lineHeight: "1.8" }}
                >
                  {card.features.map((f, i) => (
                    <li
                      key={i}
                      className={cn(
                        "flex items-start gap-2.5",
                        card.id === "credits" && "gap-0",
                      )}
                    >
                      {card.id !== "credits" && (
                        <Check
                          className="mt-2 shrink-0"
                          size={14}
                          style={{ color: "#6C47FF" }}
                        />
                      )}
                      <span style={{ color: "#d1d5db" }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  {renderCta(card, isCurrent, isUpgrade)}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-14 text-center text-xs text-muted-foreground">
          Todos os planos incluem o Estúdio de Criação sem censura e sem filtros.
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