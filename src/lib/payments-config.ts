// Shared client-safe pricing config
export type CreditPackId = "starter" | "popular" | "pro";
export const CREDIT_PACKS: Record<
  CreditPackId,
  { name: string; credits: number; price: number; productId: string; popular?: boolean }
> = {
  starter: { name: "Starter", credits: 20, price: 14.9, productId: "kqgddod" },
  popular: { name: "Popular", credits: 60, price: 34.9, productId: "3eq6p9f", popular: true },
  pro: { name: "Pro", credits: 150, price: 79.9, productId: "36venb6" },
};

export type PlanId = "plus" | "ultra";
export type BillingPeriod = "monthly" | "annual";

export const PLANS: Record<PlanId, {
  name: string;
  credits: number;
  price: number;
  annualMonthlyPrice: number;
  annualTotalPrice: number;
  annualSavingsPercent: number;
  productId: string;
  tagline: string;
  highlight?: boolean;
  features: string[];
}> = {
  plus: {
    name: "Plus",
    credits: 30,
    price: 29.9,
    annualMonthlyPrice: 25.9,
    annualTotalPrice: 310.8,
    annualSavingsPercent: 13,
    productId: "36i2qxd",
    tagline: "Ideal para começar",
    features: [
      "30 créditos por mês",
      "Geração de imagem no chat",
      "Mensagens ilimitadas no chat",
      "Suporte prioritário",
      "Acesso antecipado a novidades",
    ],
  },
  ultra: {
    name: "Ultra",
    credits: 80,
    price: 57.9,
    annualMonthlyPrice: 38.9,
    annualTotalPrice: 466.8,
    annualSavingsPercent: 33,
    productId: "ouavt87",
    tagline: "Mais popular",
    highlight: true,
    features: [
      "80 créditos por mês",
      "Geração de imagem no chat",
      "Mensagens ilimitadas no chat",
      "Suporte VIP 24h",
      "Acesso antecipado a novidades",
      "Prioridade máxima na fila de geração",
    ],
  },
};

export function planPriceFor(planId: PlanId, period: BillingPeriod): number {
  const p = PLANS[planId];
  return period === "annual" ? p.annualTotalPrice : p.price;
}

export function applyDiscount(value: number, percent: number) {
  const v = value * (1 - percent / 100);
  return Math.round(v * 100) / 100;
}