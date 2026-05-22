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

  // 1) Try external_reference first (format: userId|kind|targetId|historyId)
  let userId: string | undefined;
  let kind: string | undefined;
  let targetId: string | undefined;
  let historyId: string | undefined;

  const extRef = detail.external_reference ?? "";
  const parts = extRef.split("|");
  if (parts.length >= 4) {
    [userId, kind, targetId, historyId] = parts;
  } else {
    // 2) Fallback: look up by mp payment id in payment_history
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
    // Idempotent — creditUserOnce checks metadata.credited via cakto_payment_id
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

export const Route = createFileRoute("/api/mp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {}
        let body: Record<string, unknown> = {};
        try {
          body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        } catch {}

        const url = new URL(request.url);
        const qpType = url.searchParams.get("type") || url.searchParams.get("topic");
        const qpId = url.searchParams.get("data.id") || url.searchParams.get("id");

        const headersLog: Record<string, string> = {};
        request.headers.forEach((v, k) => {
          headersLog[k] = v;
        });

        console.log("[MP-WEBHOOK] recebido body:", rawBody || "(vazio)");
        console.log("[MP-WEBHOOK] query:", Object.fromEntries(url.searchParams.entries()));
        console.log("[MP-WEBHOOK] headers:", JSON.stringify(headersLog));

        const type = String(body.type ?? body.action ?? qpType ?? "").toLowerCase();
        const dataObj = (body.data as Record<string, unknown> | undefined) ?? {};
        const paymentId = String(dataObj.id ?? body.id ?? qpId ?? "");

        console.log("[MP-WEBHOOK] type:", type, "paymentId:", paymentId);

        if (!paymentId) {
          console.log("[MP-WEBHOOK] paymentId nao encontrado, ignorando");
          return new Response("ok", { status: 200 });
        }

        // Process inline — fire-and-forget is unsafe on Workers (isolate dies
        // after response). MP timeout is generous; await before returning 200.
        try {
          await processMpPayment(paymentId);
        } catch (e) {
          console.error("[MP-WEBHOOK] processPayment error", e);
        }

        // Always return 200 to prevent MP retries
        return new Response("ok", { status: 200 });
      },
      GET: async ({ request }) => {
        // MP IPN/legacy sometimes uses GET with query params
        const url = new URL(request.url);
        const qpType = url.searchParams.get("type") || url.searchParams.get("topic");
        const paymentId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
        console.log("[MP-WEBHOOK GET]", {
          type: qpType,
          paymentId,
          query: Object.fromEntries(url.searchParams.entries()),
        });
        if (paymentId && (qpType === "payment" || !qpType)) {
          try {
            await processMpPayment(paymentId);
          } catch (e) {
            console.error("[MP-WEBHOOK GET] processPayment error", e);
          }
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});