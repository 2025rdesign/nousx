// Shared Cakto webhook handler. Used by both:
// - /api/public/cakto-webhook (canonical)
// - /api/cakto-webhook       (legacy alias kept for existing Cakto panel config)
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { creditUserOnce, revokeAllCredits } from "@/lib/credits.server";
import { CREDIT_PACKS, PLANS, type CreditPackId, type PlanId } from "@/lib/payments-config";
import { rewardReferrerOnFirstPurchase } from "@/lib/referrals.server";

type CaktoWebhook = {
  event?: string;
  type?: string;
  data?: {
    id?: string;
    order_id?: string;
    subscription_id?: string;
    product_id?: string;
    status?: string;
    amount?: number;
    payment_method?: string;
    customer?: { email?: string; name?: string; document?: string };
    external_reference?: string;
  };
  id?: string;
  order_id?: string;
  product_id?: string;
  status?: string;
  customer?: { email?: string };
};

function resolveProduct(productId: string | undefined | null) {
  if (!productId) return null;
  for (const k of Object.keys(CREDIT_PACKS) as CreditPackId[]) {
    if (CREDIT_PACKS[k].productId === productId) {
      return { kind: "credit" as const, id: k, credits: CREDIT_PACKS[k].credits };
    }
  }
  for (const k of Object.keys(PLANS) as PlanId[]) {
    if (PLANS[k].productId === productId) {
      return { kind: "subscription" as const, id: k, credits: PLANS[k].credits };
    }
  }
  return null;
}

async function findUserByEmail(email: string | undefined | null): Promise<string | null> {
  if (!email) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return null;
    const u = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    return u?.id ?? null;
  } catch {
    return null;
  }
}

function parseRef(ref: string | undefined | null): { userId: string; kind: "c" | "s"; id: string } | null {
  if (!ref) return null;
  const m = /^([cs])_(.+)_([^_]+)$/.exec(ref);
  if (!m) return null;
  return { kind: m[1] as "c" | "s", userId: m[2], id: m[3] };
}

async function recordRefund(userId: string, orderId: string, email: string | null) {
  await supabaseAdmin.from("payment_history").insert({
    user_id: userId,
    amount: 0,
    type: "refund",
    status: "refunded",
    cakto_payment_id: orderId,
    metadata: { email },
  });
}

async function maybeBlockUser(userId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { count } = await supabaseAdmin
    .from("payment_history")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "refund")
    .gte("created_at", since.toISOString());
  if ((count ?? 0) > 1) {
    await supabaseAdmin.from("profiles").update({ is_blocked: true }).eq("id", userId);
  }
}

export async function handleCaktoWebhook(request: Request): Promise<Response> {
  const secret = process.env.CAKTO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[CAKTO] CAKTO_WEBHOOK_SECRET not configured");
    return new Response("Webhook not configured", { status: 500 });
  }
  const provided =
    request.headers.get("x-cakto-signature") ||
    request.headers.get("x-webhook-secret") ||
    request.headers.get("cakto-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (provided !== secret) {
    console.warn("[CAKTO] signature mismatch", {
      hasHeader: Boolean(provided),
      providedLen: provided.length,
    });
    return new Response("Unauthorized", { status: 401 });
  }

  let body: CaktoWebhook;
  try {
    body = (await request.json()) as CaktoWebhook;
  } catch {
    console.error("[CAKTO] invalid JSON body");
    return new Response("Bad request", { status: 400 });
  }

  const event = (body.event || body.type || "").toLowerCase();
  const d = body.data || (body as CaktoWebhook["data"]) || {};
  const orderId = d?.id || d?.order_id || body.id || body.order_id || "";
  const productId = d?.product_id || body.product_id;
  const status = (d?.status || body.status || "").toLowerCase();
  const email = d?.customer?.email || body.customer?.email || null;
  const ref = parseRef(d?.external_reference);

  console.log("[CAKTO] event received", { event, status, orderId, productId, email });

  let userId: string | null = ref?.userId ?? null;
  if (!userId) userId = await findUserByEmail(email);
  if (!userId) {
    console.warn("[CAKTO] user not found", { email });
    return new Response("ok");
  }

  const product =
    resolveProduct(productId) ||
    (ref?.kind === "c"
      ? { kind: "credit" as const, id: ref.id, credits: CREDIT_PACKS[ref.id as CreditPackId]?.credits ?? 0 }
      : ref?.kind === "s"
        ? { kind: "subscription" as const, id: ref.id, credits: PLANS[ref.id as PlanId]?.credits ?? 0 }
        : null);

  const isPaidEvt =
    event === "order.paid" ||
    event === "payment_confirmed" ||
    event === "payment.confirmed" ||
    event === "purchase.approved" ||
    event === "payment.approved" ||
    event === "subscription.renewed" ||
    event === "subscription.created" ||
    status === "paid" ||
    status === "confirmed" ||
    status === "approved";

  const isRefundEvt =
    event === "order.refunded" ||
    event === "payment.refunded" ||
    event === "subscription.cancelled" ||
    event === "subscription.canceled" ||
    status === "refunded" ||
    status === "cancelled" ||
    status === "canceled";

  if (isPaidEvt && product) {
    console.log("[CAKTO] crediting", { userId, kind: product.kind, packId: product.id, credits: product.credits });
    if (product.kind === "credit") {
      await creditUserOnce(orderId, userId, product.credits, product.id);
    } else {
      const next = new Date();
      next.setDate(next.getDate() + 30);
      const subId = d?.subscription_id || orderId;
      const { data: existing } = await supabaseAdmin
        .from("user_subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("cakto_subscription_id", subId)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("user_subscriptions")
          .update({ status: "active", expires_at: next.toISOString() })
          .eq("id", existing.id);
      } else {
        await supabaseAdmin.from("user_subscriptions").insert({
          user_id: userId,
          plan_id: product.id,
          status: "active",
          cakto_subscription_id: subId,
          expires_at: next.toISOString(),
        });
      }
      await creditUserOnce(orderId, userId, product.credits, product.id);
    }
    await rewardReferrerOnFirstPurchase(userId, product.kind, product.id);
    return new Response("ok");
  }

  if (isPaidEvt && !product) {
    console.warn("[CAKTO] paid event but unknown product", { productId, ref: d?.external_reference });
  }

  if (isRefundEvt) {
    await supabaseAdmin
      .from("user_subscriptions")
      .update({ status: "cancelled" })
      .eq("user_id", userId)
      .in("status", ["active", "pending"]);
    await revokeAllCredits(userId);
    await recordRefund(userId, orderId, email);
    await maybeBlockUser(userId);
    return new Response("ok");
  }

  return new Response("ok");
}
