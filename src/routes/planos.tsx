import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Check, Sparkles, Crown, Zap, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const LOGO_DARK =
  "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png";
const LOGO_LIGHT =
  "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH-VARIANTE-MODO-CLARO.png";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos — AuraIA" },
      { name: "description", content: "Escolha o plano ideal para você. Comece grátis e evolua para Plus ou Ultra." },
      { property: "og:title", content: "Planos — AuraIA" },
      { property: "og:description", content: "Escolha o plano ideal para você. Comece grátis e evolua para Plus ou Ultra." },
    ],
  }),
  component: PlanosPage,
});

interface PlanItem {
  id: string;
  badge: string;
  badgeStyle: string;
  icon: React.ElementType;
  name: string;
  price: string;
  period?: string;
  features: string[];
  cta: string;
  ctaVariant: "outline" | "default";
  highlighted?: boolean;
}

const PLANS: PlanItem[] = [
  {
    id: "free",
    badge: "Grátis",
    badgeStyle: "bg-muted text-muted-foreground",
    icon: Sparkles,
    name: "Gratuito",
    price: "R$ 0",
    features: [
      "Chat ilimitado",
      "Busca na web",
      "Análise de arquivos e imagens",
      "3 créditos de boas-vindas no Estúdio",
    ],
    cta: "Criar conta grátis",
    ctaVariant: "outline",
  },
  {
    id: "plus",
    badge: "Mais popular",
    badgeStyle: "bg-primary text-primary-foreground",
    icon: Crown,
    name: "Plus",
    price: "R$ 29,90",
    period: "/mês",
    features: [
      "Tudo do Gratuito",
      "30 créditos por mês no Estúdio",
      "Geração de imagem no chat",
      "Respostas em áudio (TTS)",
    ],
    cta: "Assinar Plus",
    ctaVariant: "default",
    highlighted: true,
  },
  {
    id: "ultra",
    badge: "Completo",
    badgeStyle: "bg-accent text-accent-foreground",
    icon: Zap,
    name: "Ultra",
    price: "R$ 57,90",
    period: "/mês",
    features: [
      "Tudo do Plus",
      "80 créditos por mês",
      "Edição de imagem no chat",
    ],
    cta: "Assinar Ultra",
    ctaVariant: "default",
  },
  {
    id: "credits",
    badge: "Sem assinatura",
    badgeStyle: "bg-secondary text-secondary-foreground",
    icon: Package,
    name: "Créditos avulsos",
    price: "A partir de R$ 14,90",
    features: [
      "Starter: 20 créditos por R$ 14,90",
      "Popular: 60 créditos por R$ 34,90",
      "Pro: 150 créditos por R$ 79,90",
    ],
    cta: "Ver pacotes",
    ctaVariant: "outline",
  },
];

function PlanosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? LOGO_DARK : LOGO_LIGHT;

  const handleCta = (planId: string) => {
    if (planId === "free") {
      navigate({ to: "/auth", search: { tab: "signup" } as any });
      return;
    }
    if (user) {
      navigate({ to: "/configuracoes" });
    } else {
      navigate({ to: "/auth", search: { tab: "login" } as any });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
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

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <header className="text-center mb-10 md:mb-14">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Escolha seu plano
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Comece grátis. Sem cartão de crédito.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={cn(
                "relative flex flex-col border-border bg-card",
                plan.highlighted &&
                  "border-primary/60 ring-1 ring-primary/40 shadow-[0_0_30px_-8px_rgba(108,71,255,0.3)]"
              )}
            >
              {/* Badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold leading-none",
                    plan.badgeStyle
                  )}
                >
                  {plan.badge}
                </span>
              </div>

              <CardHeader className="pt-7 pb-2 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <plan.icon className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="mt-1 flex items-baseline justify-center gap-1">
                  <span className="text-2xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  )}
                </p>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col gap-4 pb-6">
                <ul className="space-y-2.5 text-sm">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-3">
                  <Button
                    variant={plan.ctaVariant}
                    className={cn(
                      "w-full",
                      plan.ctaVariant === "default" &&
                        "bg-primary hover:bg-primary/90 text-primary-foreground"
                    )}
                    onClick={() => handleCta(plan.id)}
                  >
                    {plan.cta}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer note */}
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Todos os planos incluem acesso ao Estúdio de Criação sem censura e sem
          filtros.
        </p>
      </div>
    </div>
  );
}
