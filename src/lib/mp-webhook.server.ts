import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchMpPayment } from "./mercadopago.server";
import { creditUserOnce, revokeAllCredits } from "./credits.server";
import {
  CREDIT_PACKS,
  PLANS,
  type CreditPackId,
  type PlanId,
} from "./payments-config";

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

export async function processMpPayment(paymentId: string) {
  const detail = await fetchMpPayment(paymentId);
  if (!detail) {
    console.warn("[MP-WEBHOOK] payment not found at MP API", paymentId);
    return;
  }
  const status = String(detail.status || "").toLowerCase();
  const mpId = String(detail.id);

  console.log("[MP-WEBHOOK] payment details", {
    mpId,
    status,
    external_reference: detail.external_reference,
    transaction_amount: detail.transaction_amount,
    payment_method: detail.payment_method_id,
  });

  let userId: string | undefined;
  let kind: string | undefined;
  let targetId: string | undefined;
  let historyId: string | undefined;

  const extRef = detail.external_reference ?? "";
  const parts = extRef.split("|");
  if (parts.length >= 4) {
    [userId, kind, targetId, historyId] = parts;
  } else {
    console.warn(
      "[MP-WEBHOOK] external_reference missing/invalid, falling back to history lookup",
      extRef,
    );
    const { data: row } = await supabaseAdmin
      .from("payment_history")
      .select("id, user_id, type, metadata")
      .eq("cakto_payment_id", mpId)
      .maybeSingle();
    if (!row) {
      console.error("[MP-WEBHOOK] no payment_history row for", mpId);
      return;
    }
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    userId = row.user_id as string;
    kind = (meta.kind as string) ?? row.type;
    targetId = (meta.target as string) ?? "";
    historyId = row.id as string;
  }

  console.log("[MP-WEBHOOK] resolved", { mpId, status, userId, kind, targetId, historyId });

  if (status === "approved") {
    if (kind === "credit") {
      const pack = CREDIT_PACKS[targetId as CreditPackId];
      if (pack && userId) {
        await creditUserOnce(mpId, userId, pack.credits, targetId);
      } else {
        console.error("[MP-WEBHOOK] unknown credit pack", targetId);
      }
    } else if (kind === "subscription") {
      const plan = PLANS[targetId as PlanId];
      if (plan && userId) {
        await activateSubscription(userId, targetId as PlanId, mpId);
        await creditUserOnce(mpId, userId, plan.credits, targetId);
      } else {
        console.error("[MP-WEBHOOK] unknown subscription plan", targetId);
      }
    }
    if (historyId) {
      await supabaseAdmin
        .from("payment_history")
        .update({ status: "confirmed", cakto_payment_id: mpId })
        .eq("id", historyId);
    }
    console.log("[MP-WEBHOOK] credited successfully", { mpId, userId });
  } else if (status === "refunded" || status === "charged_back") {
    if (historyId) {
      await supabaseAdmin
        .from("payment_history")
        .update({ status: "refunded", cakto_payment_id: mpId })
        .eq("id", historyId);
    }
    if (kind === "subscription" && userId) {
      await supabaseAdmin
        .from("user_subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", userId)
        .in("status", ["active", "pending"]);
    }
    if (userId) await revokeAllCredits(userId);
  } else if (status === "cancelled" || status === "rejected") {
    if (historyId) {
      await supabaseAdmin
        .from("payment_history")
        .update({ status: "failed", cakto_payment_id: mpId })
        .eq("id", historyId);
    }
  }
}