import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchMpPayment } from "@/lib/mercadopago.server";
import { creditUserOnce, revokeAllCredits } from "@/lib/credits.server";
import {
  CREDIT_PACKS,
  PLANS,
  type CreditPackId,
  type PlanId,
} from "@/lib/payments-config";

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

async function processPayment(paymentId: string) {
  const detail = await fetchMpPayment(paymentId);
  if (!detail) {
    console.warn("[MP] payment not found", paymentId);
    return;
  }
  const status = String(detail.status || "").toLowerCase();
  const extRef = detail.external_reference ?? "";
  // external_reference format: userId|kind|targetId|historyId
  const parts = extRef.split("|");
  if (parts.length < 4) {
    console.warn("[MP] invalid external_reference", extRef);
    return;
  }
  const [userId, kind, targetId, historyId] = parts;
  const mpId = String(detail.id);

  console.log("[MP] processing", { mpId, status, userId, kind, targetId, historyId });

  if (status === "approved") {
    // Idempotent: creditUserOnce checks metadata.credited flag via cakto_payment_id
    if (kind === "credit") {
      const pack = CREDIT_PACKS[targetId as CreditPackId];
      if (pack) {
        await creditUserOnce(mpId, userId, pack.credits, targetId);
      }
    } else if (kind === "subscription") {
      const plan = PLANS[targetId as PlanId];
      if (plan) {
        await activateSubscription(userId, targetId as PlanId, mpId);
        await creditUserOnce(mpId, userId, plan.credits, targetId);
      }
    }

    await supabaseAdmin
      .from("payment_history")
      .update({ status: "confirmed", cakto_payment_id: mpId })
      .eq("id", historyId);
  } else if (status === "refunded" || status === "charged_back") {
    await supabaseAdmin
      .from("payment_history")
      .update({ status: "refunded", cakto_payment_id: mpId })
      .eq("id", historyId);
    if (kind === "subscription") {
      await supabaseAdmin
        .from("user_subscriptions")
        .update({ status: "cancelled" })
        .eq("user_id", userId)
        .in("status", ["active", "pending"]);
    }
    await revokeAllCredits(userId);
  } else if (status === "cancelled" || status === "rejected") {
    await supabaseAdmin
      .from("payment_history")
      .update({ status: "failed", cakto_payment_id: mpId })
      .eq("id", historyId);
  }
}

export const Route = createFileRoute("/api/mp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          // MP may also send query params
        }
        const url = new URL(request.url);
        const qpType = url.searchParams.get("type") || url.searchParams.get("topic");
        const qpId = url.searchParams.get("data.id") || url.searchParams.get("id");

        const type = String(body.type ?? body.action ?? qpType ?? "").toLowerCase();
        const dataObj = (body.data as Record<string, unknown> | undefined) ?? {};
        const paymentId = String(dataObj.id ?? body.id ?? qpId ?? "");

        console.log("[MP webhook]", { type, paymentId });

        // Process asynchronously so we can return 200 quickly
        if (paymentId && (type.includes("payment") || qpType === "payment")) {
          processPayment(paymentId).catch((e) =>
            console.error("[MP] processPayment error", e),
          );
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});