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
  tagline: string;
  highlight?: boolean;
  features: string[];
}> = {
  plus: {
    name: "Plus",
    credits: 30,
    price: 39.9,
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
    price: 67.9,
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

export function applyDiscount(value: number, percent: number) {
  const v = value * (1 - percent / 100);
  return Math.round(v * 100) / 100;
}