import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMpPreference } from "./mercadopago.server";
import {
  CREDIT_PACKS,
  PLANS,
  applyDiscount,
  type CreditPackId,
  type PlanId,
} from "./payments-config";

async function resolveCoupon(code: string | null | undefined) {
  if (!code) return null;
  const { data: c } = await supabaseAdmin
    .from("coupons")
    .select("code, discount_percent, active, expires_at")
    .eq("code", code.toUpperCase())
    .eq("active", true)
    .maybeSingle();
  if (!c) return null;
  if (c.expires_at && new Date(c.expires_at) < new Date()) return null;
  return { code: c.code, discountPercent: c.discount_percent };
}

function siteOrigin(): string {
  // Hard-coded production origin per spec; webhook & return URLs must be HTTPS public.
  return "https://chataura.com.br";
}

export const createMpCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["credit", "subscription"]),
        id: z.string().min(1).max(40),
        couponCode: z.string().max(40).optional().nullable(),
        method: z.enum(["pix", "card"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, is_blocked")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.is_blocked) {
      throw new Error("Sua conta está com restrição de compra. Entre em contato com o suporte.");
    }

    let baseAmount: number;
    let title: string;
    if (data.kind === "credit") {
      const pack = CREDIT_PACKS[data.id as CreditPackId];
      if (!pack) throw new Error("Pacote inválido.");
      baseAmount = pack.price;
      title = `AuraIA — Créditos ${pack.name} (${pack.credits})`;
    } else {
      const plan = PLANS[data.id as PlanId];
      if (!plan) throw new Error("Plano inválido.");
      baseAmount = plan.price;
      title = `AuraIA — Assinatura ${plan.name}`;
    }

    const coupon = await resolveCoupon(data.couponCode);
    const finalValue = coupon ? applyDiscount(baseAmount, coupon.discountPercent) : baseAmount;

    // Pre-create a pending history row to get a stable internal ID.
    const { data: history, error: insErr } = await supabaseAdmin
      .from("payment_history")
      .insert({
        user_id: userId,
        amount: finalValue,
        type: data.kind === "subscription" ? "subscription" : "credit",
        status: "pending",
        cakto_payment_id: null,
        metadata: {
          provider: "mercadopago",
          kind: data.kind,
          target: data.id,
          coupon: coupon?.code ?? null,
          method: data.method ?? null,
          email,
        },
      })
      .select("id")
      .single();
    if (insErr || !history) {
      console.error("[MP] history insert failed", insErr);
      throw new Error("Erro ao iniciar pagamento.");
    }

    const externalReference = `${userId}|${data.kind}|${data.id}|${history.id}`;
    const origin = siteOrigin();

    try {
      const { preferenceId, initPoint } = await createMpPreference({
        title,
        unitPrice: finalValue,
        externalReference,
        payerEmail: email,
        payerName: profile?.name ?? undefined,
        successUrl: `${origin}/pagamento/sucesso`,
        failureUrl: `${origin}/pagamento/falha`,
        pendingUrl: `${origin}/pagamento/pendente`,
        notificationUrl: `${origin}/api/mp-webhook`,
        idempotencyKey: history.id,
      });

      await supabaseAdmin
        .from("payment_history")
        .update({
          metadata: {
            provider: "mercadopago",
            kind: data.kind,
            target: data.id,
            coupon: coupon?.code ?? null,
            method: data.method ?? null,
            email,
            preference_id: preferenceId,
            external_reference: externalReference,
            init_point: initPoint,
          },
        })
        .eq("id", history.id);

      return { preferenceId, initPoint, historyId: history.id, amount: finalValue };
    } catch (e) {
      await supabaseAdmin
        .from("payment_history")
        .update({ status: "failed", metadata: { error: String(e) } })
        .eq("id", history.id);
      throw e;
    }
  });