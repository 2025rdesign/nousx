// Cakto payments HTTP client (server-only).
const BASE = "https://api.cakto.com.br";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 30_000 > now) return tokenCache.token;
  const clientId = process.env.CAKTO_CLIENT_ID;
  const clientSecret = process.env.CAKTO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Gateway de pagamento não configurado.");
  const res = await fetch(`${BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha na autenticação do gateway: ${res.status} ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Resposta inválida do gateway.");
  const ttl = (j.expires_in ?? 3600) * 1000;
  tokenCache = { token: j.access_token, expiresAt: now + ttl };
  return j.access_token;
}

async function caktoFetch(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    // token may have rotated — refresh once
    tokenCache = null;
    const t2 = await getAccessToken();
    headers.set("Authorization", `Bearer ${t2}`);
    const r2 = await fetch(`${BASE}${path}`, { ...init, headers });
    if (!r2.ok) {
      const txt = await r2.text().catch(() => "");
      throw new Error(`Gateway error ${r2.status}: ${txt.slice(0, 200)}`);
    }
    return r2.json();
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gateway error ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

export type Customer = { name: string; email: string; document: string };
export type CardData = {
  card_number: string;
  card_holder: string;
  card_expiry: string; // MM/YY
  card_cvv: string;
};

export type CaktoOrder = {
  id: string;
  status: "pending" | "paid" | "cancelled" | "refunded" | string;
  qr_code?: string;
  pix_code?: string;
  pix_qr_image?: string;
  amount?: number;
  product_id?: string;
  customer?: { email?: string };
  expires_at?: string;
  subscription_id?: string;
};

export async function createPixOrder(opts: {
  productId: string;
  customer: Customer;
  externalReference?: string;
}): Promise<CaktoOrder> {
  return caktoFetch("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      product_id: opts.productId,
      payment_method: "pix",
      customer: opts.customer,
      external_reference: opts.externalReference,
    }),
  });
}

export async function createCardOrder(opts: {
  productId: string;
  customer: Customer;
  card: CardData;
  externalReference?: string;
}): Promise<CaktoOrder> {
  return caktoFetch("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      product_id: opts.productId,
      payment_method: "credit_card",
      customer: opts.customer,
      card_number: opts.card.card_number,
      card_holder: opts.card.card_holder,
      card_expiry: opts.card.card_expiry,
      card_cvv: opts.card.card_cvv,
      external_reference: opts.externalReference,
    }),
  });
}

export async function getOrder(orderId: string): Promise<CaktoOrder> {
  return caktoFetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}

// Map status from Cakto to our normalized form
export function isPaid(status: string | undefined | null) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "paid" || s === "confirmed" || s === "received" || s === "approved";
}
export function isRefunded(status: string | undefined | null) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "refunded" || s === "chargeback";
}
export function isCancelled(status: string | undefined | null) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "cancelled" || s === "canceled" || s === "failed";
}
