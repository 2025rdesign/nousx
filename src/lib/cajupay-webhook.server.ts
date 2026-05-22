// Webhook handler for CajuPay PIX events.
// HMAC verified via X-CajuPay-Signature header (t=...,v1=...).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { creditUserOnce, revokeAllCredits } from "@/lib/credits.server";
import { CREDIT_PACKS, PLANS, type CreditPackId, type PlanId } from "@/lib/payments-config";
import { verifyCajupaySignature } from "./cajupay.server";

const PAID_EVENTS = new Set(["checkout.payment.paid", "pix.payment.paid", "payment.paid"]);
const FAIL_EVENTS = new Set([
  "checkout.payment.failed",
  "checkout.payment.refunded",
  "checkout.payment.disputed",
  "pix.payment.refunded",
  "pix.payment.failed",
  "pix.payment.expired",
]);

async function activateSubscription(userId: string, planId: PlanId, externalId: string) {
  const plan = PLANS[planId];
  if (!plan) return;
  const now = new Date();
  const expires = new Date();
  expires.setDate(now.getDate() + 30);

  const { data: existing } = await supabaseAdmin
    .from("user_subscriptions")
    .select("id, expires_at")
    .eq("user_id", userId)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextExpires = expires;
  if (existing?.expires_at && new Date(existing.expires_at) > now) {
    const cur = new Date(existing.expires_at);
    cur.setDate(cur.getDate() + 30);
    nextExpires = cur;
  }

  if (existing) {
    await supabaseAdmin
      .from("user_subscriptions")
      .update({
        plan_id: planId,
        status: "active",
        expires_at: nextExpires.toISOString(),
        cakto_subscription_id: externalId,
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("user_subscriptions").insert({
      user_id: userId,
      plan_id: planId,
      status: "active",
      cakto_subscription_id: externalId,
      expires_at: nextExpires.toISOString(),
    });
  }
}

/**
 * Apply "paid" outcome to a pix_payments row: idempotent.
 * Used by both the webhook and the on-demand polling fallback.
 */
export async function markPixPaymentPaid(
  payment: Record<string, unknown>,
  externalIdHint?: string | null,
): Promise<void> {
  if (payment.status === "paid") return;
  const userId = String(payment.user_id);
  const kind = String(payment.kind);
  const targetId = String(payment.target_id);
  const paymentRowId = String(payment.id);
  const finalExternalId =
    (externalIdHint && String(externalIdHint)) ||
    String(payment.external_id || "") ||
    paymentRowId;

  const { data: updated } = await supabaseAdmin
    .from("pix_payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      external_id: finalExternalId,
    })
    .eq("id", paymentRowId)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (!updated) return; // already processed by another path

  if (kind === "credit") {
    const pack = CREDIT_PACKS[targetId as CreditPackId];
    if (pack) {
      await creditUserOnce(finalExternalId, userId, pack.credits, targetId);
    }
  } else if (kind === "subscription") {
    const plan = PLANS[targetId as PlanId];
    if (plan) {
      await activateSubscription(userId, targetId as PlanId, finalExternalId);
      await creditUserOnce(finalExternalId, userId, plan.credits, targetId);
    }
  }

  await supabaseAdmin
    .from("payment_history")
    .update({ status: "confirmed" })
    .eq("cakto_payment_id", finalExternalId);
}

export async function handleCajupayWebhook(request: Request): Promise<Response> {
  const secret = process.env.CAJUPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[CAJUPAY] CAJUPAY_WEBHOOK_SECRET not configured");
    return new Response("config_error", { status: 500 });
  }

  const raw = await request.text();
  const sigHeader = request.headers.get("x-cajupay-signature");
  const ok = await verifyCajupaySignature(raw, sigHeader, secret);
  if (!ok) {
    console.warn("[CAJUPAY] signature mismatch", {
      hasHeader: !!sigHeader,
      headerPreview: sigHeader?.slice(0, 80),
      bodyPreview: raw.slice(0, 200),
    });
    return new Response("invalid_signature", { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new Response("ok", { status: 200 });
  }

  const type = String(event.type || event.event || "").toLowerCase();
  const dataNode = (event.data as Record<string, unknown> | undefined) || event;
  const obj =
    (dataNode?.object as Record<string, unknown> | undefined) ||
    (dataNode as Record<string, unknown>);

  const externalId = String(
    obj?.cajupay_charge_id || obj?.payment_id || obj?.id || "",
  );
  const internalRef = String(
    obj?.customer_ref ||
      (obj?.metadata as Record<string, unknown> | undefined)?.customer_ref ||
      "",
  );

  console.log("[CAJUPAY] event received", { type, externalId, internalRef });

  // Locate our pix_payments row
  let payment: Record<string, unknown> | null = null;
  if (externalId) {
    const { data } = await supabaseAdmin
      .from("pix_payments")
      .select("*")
      .eq("external_id", externalId)
      .maybeSingle();
    payment = data;
  }
  if (!payment && internalRef) {
    const { data } = await supabaseAdmin
      .from("pix_payments")
      .select("*")
      .eq("id", internalRef)
      .maybeSingle();
    payment = data;
  }

  if (!payment) {
    console.warn("[CAJUPAY] payment not found", { externalId, internalRef });
    return new Response("ok", { status: 200 });
  }

  // Idempotency
  if (payment.status === "paid") return new Response("ok", { status: 200 });

  if (PAID_EVENTS.has(type)) {
    await markPixPaymentPaid(payment, externalId);
    return new Response("ok", { status: 200 });
  }

  if (FAIL_EVENTS.has(type)) {
    const newStatus = type.includes("refunded")
      ? "refunded"
      : type.includes("disputed")
        ? "disputed"
        : type.includes("expired")
          ? "expired"
          : "failed";

      await supabaseAdmin
        .from("pix_payments")
        .update({ status: newStatus })
        .eq("id", String(payment.id));

    if (newStatus === "refunded" || newStatus === "disputed") {
      const userId = String(payment.user_id);
      await supabaseAdmin
        .from("user_subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", userId)
        .in("status", ["active", "pending"]);
      await revokeAllCredits(userId);
      await supabaseAdmin.from("payment_history").insert({
        user_id: userId,
        amount: 0,
        type: "refund",
        status: "refunded",
        cakto_payment_id: String(payment.external_id || payment.id),
        metadata: { provider: "cajupay", event: type },
      });
    }
  }

  return new Response("ok", { status: 200 });
}