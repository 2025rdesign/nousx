import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { creditUserOnce } from "@/lib/credits.server";
import { PLANS, type PlanId } from "@/lib/payments-config";

type AsaasEvent = {
  event: string;
  payment?: {
    id: string;
    status: string;
    value: number;
    externalReference?: string;
    subscription?: string;
    customer?: string;
  };
};

function parseRef(ref: string | undefined) {
  if (!ref) return null;
  try { return JSON.parse(ref); } catch { return null; }
}

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("asaas-access-token");
        const expected = process.env.ASAAS_WEBHOOK_TOKEN;
        if (!expected || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: AsaasEvent;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const event = body.event;
        const payment = body.payment;
        if (!payment) return new Response("ok");

        const isConfirmed =
          event === "PAYMENT_CONFIRMED" ||
          event === "PAYMENT_RECEIVED" ||
          ["CONFIRMED", "RECEIVED"].includes(payment.status);

        const ref = parseRef(payment.externalReference);

        // CREDIT PURCHASE
        if (ref?.kind === "credits" && isConfirmed) {
          await creditUserOnce(payment.id, ref.userId, ref.credits);
        }

        // SUBSCRIPTION PAYMENT
        if ((ref?.kind === "subscription" || payment.subscription) && isConfirmed) {
          const planId = ref?.planId as PlanId | undefined;
          const userId = ref?.userId as string | undefined;
          const subId = payment.subscription;
          if (userId && planId) {
            const plan = PLANS[planId];
            // Activate subscription row
            const nextRenewal = new Date();
            nextRenewal.setMonth(nextRenewal.getMonth() + 1);
            await supabaseAdmin
              .from("user_subscriptions")
              .update({
                status: "active",
                expires_at: nextRenewal.toISOString(),
              })
              .eq("user_id", userId)
              .eq("asaas_subscription_id", subId ?? "");
            // Grant monthly credits (idempotent per payment id)
            await creditUserOnce(payment.id, userId, plan.credits);
            // creditUserOnce already inserts/updates payment_history idempotently
            void plan;
          }
        }

        return new Response("ok");
      },
    },
  },
});