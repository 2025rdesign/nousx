// Shared client-safe pricing config
export type CreditPackId = "starter" | "popular" | "pro";
export const CREDIT_PACKS: Record<CreditPackId, { name: string; credits: number; price: number; popular?: boolean }> = {
  starter: { name: "Starter", credits: 20, price: 14.9 },
  popular: { name: "Popular", credits: 60, price: 34.9, popular: true },
  pro: { name: "Pro", credits: 150, price: 79.9 },
};

export type PlanId = "plus" | "ultra";
export const PLANS: Record<PlanId, {
  name: string;
  credits: number;
  price: number;
  features: string[];
}> = {
  plus: {
    name: "Plus",
    credits: 80,
    price: 29.9,
    features: ["80 créditos por mês", "Geração de imagem no chat", "Acesso ao Estúdio"],
  },
  ultra: {
    name: "Ultra",
    credits: 200,
    price: 57.9,
    features: [
      "200 créditos por mês",
      "Geração de imagem no chat",
      "Prioridade de processamento",
    ],
  },
};

export function applyDiscount(value: number, percent: number) {
  const v = value * (1 - percent / 100);
  return Math.round(v * 100) / 100;
}