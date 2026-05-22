import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createCajupayPix } from "./cajupay.server";
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

async function ensureNotBlocked(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("name, is_blocked")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.is_blocked) {
    throw new Error("Sua conta está com restrição de compra. Entre em contato com o suporte.");
  }
  return profile;
}

export const createPixCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["credit", "subscription"]),
        id: z.string().min(1).max(40),
        couponCode: z.string().max(40).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";
    const profile = await ensureNotBlocked(userId);

    let baseAmount: number;
    let description: string;
    if (data.kind === "credit") {
      const pack = CREDIT_PACKS[data.id as CreditPackId];
      if (!pack) throw new Error("Pacote inválido.");
      baseAmount = pack.price;
      description = `Créditos ${pack.name} (${pack.credits})`;
    } else {
      const plan = PLANS[data.id as PlanId];
      if (!plan) throw new Error("Plano inválido.");
      baseAmount = plan.price;
      description = `Assinatura ${plan.name}`;
    }

    const coupon = await resolveCoupon(data.couponCode);
    const finalValue = coupon ? applyDiscount(baseAmount, coupon.discountPercent) : baseAmount;
    const amountCents = Math.round(finalValue * 100);

    // 1. Pre-create row to obtain UUID for Idempotency-Key + customer_ref.
    const { data: payment, error: insErr } = await supabaseAdmin
      .from("pix_payments")
      .insert({
        user_id: userId,
        kind: data.kind,
        target_id: data.id,
        amount_cents: amountCents,
        coupon_code: coupon?.code ?? null,
        status: "pending",
        metadata: { email },
      })
      .select()
      .single();
    if (insErr || !payment) {
      console.error("[CAJUPAY] insert pix_payments failed", insErr);
      throw new Error("Erro ao iniciar cobrança PIX.");
    }

    // 2. Call CajuPay
    try {
      const { qrCode, externalId } = await createCajupayPix({
        amountCents,
        description,
        customerRef: payment.id,
        idempotencyKey: payment.id,
        productRef: data.id,
        consumer: {
          name: profile?.name ?? "Cliente",
          email,
        },
      });

      await supabaseAdmin
        .from("pix_payments")
        .update({ qr_code: qrCode, external_id: externalId })
        .eq("id", payment.id);

      // Track in payment_history for unified history view
      await supabaseAdmin.from("payment_history").insert({
        user_id: userId,
        amount: finalValue,
        type: data.kind === "subscription" ? "subscription" : "credit",
        status: "pending",
        cakto_payment_id: externalId ?? payment.id,
        metadata: {
          provider: "cajupay",
          pix_payment_id: payment.id,
          kind: data.kind,
          target: data.id,
          coupon: coupon?.code ?? null,
          email,
        },
      });

      return {
        paymentId: payment.id,
        qrCode,
        amountCents,
        description,
      };
    } catch (e) {
      await supabaseAdmin
        .from("pix_payments")
        .update({ status: "failed", metadata: { error: String(e) } })
        .eq("id", payment.id);
      throw e;
    }
  });

export const getPixPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row } = await supabaseAdmin
      .from("pix_payments")
      .select("id, status, paid_at, amount_cents, kind, target_id")
      .eq("id", data.paymentId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Cobrança não encontrada.");
    return row;
  });