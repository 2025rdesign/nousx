import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMpPixPayment, fetchMpPayment } from "./mercadopago.server";
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

function siteOrigin() {
  return "https://chataura.com.br";
}

function isValidCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (slice: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += parseInt(slice[i], 10) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(d.slice(0, 9), 10);
  const d2 = calc(d.slice(0, 10), 11);
  return d1 === parseInt(d[9], 10) && d2 === parseInt(d[10], 10);
}

/**
 * Creates a PIX charge via Mercado Pago Transparent Checkout.
 * Saves CPF to profile on success (so subsequent purchases skip the input).
 */
export const createPixPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["credit", "subscription"]),
        id: z.string().min(1).max(40),
        couponCode: z.string().max(40).optional().nullable(),
        cpf: z.string().min(11).max(14).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";
    if (!email) throw new Error("Email do usuário não disponível.");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, cpf, is_blocked")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.is_blocked) {
      throw new Error("Sua conta está com restrição de compra. Entre em contato com o suporte.");
    }

    const cpfRaw = (data.cpf ?? profile?.cpf ?? "").replace(/\D/g, "");
    if (!isValidCpf(cpfRaw)) {
      throw new Error("CPF inválido. Verifique e tente novamente.");
    }

    // Pricing
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

    // Pre-create history row
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
          method: "pix",
          kind: data.kind,
          target: data.id,
          coupon: coupon?.code ?? null,
          email,
        },
      })
      .select("id")
      .single();
    if (insErr || !history) {
      console.error("[MP PIX] history insert failed", insErr);
      throw new Error("Erro ao iniciar pagamento.");
    }

    const externalReference = `${userId}|${data.kind}|${data.id}|${history.id}`;
    const firstName = (profile?.name ?? email.split("@")[0] ?? "Cliente").split(" ")[0];

    try {
      const pix = await createMpPixPayment({
        amount: finalValue,
        description: title,
        payerEmail: email,
        payerFirstName: firstName,
        cpf: cpfRaw,
        externalReference,
        notificationUrl: `${siteOrigin()}/api/mp-webhook`,
        idempotencyKey: history.id,
        expiresInMinutes: 30,
      });

      await supabaseAdmin
        .from("payment_history")
        .update({
          cakto_payment_id: pix.paymentId,
          metadata: {
            provider: "mercadopago",
            method: "pix",
            kind: data.kind,
            target: data.id,
            coupon: coupon?.code ?? null,
            email,
            mp_payment_id: pix.paymentId,
            external_reference: externalReference,
            expires_at: pix.expiresAt,
          },
        })
        .eq("id", history.id);

      // Persist CPF on profile for next time
      if (cpfRaw && profile?.cpf !== cpfRaw) {
        await supabaseAdmin.from("profiles").update({ cpf: cpfRaw }).eq("id", userId);
      }

      return {
        paymentId: pix.paymentId,
        qrCode: pix.qrCode,
        qrCodeBase64: pix.qrCodeBase64,
        ticketUrl: pix.ticketUrl ?? null,
        expiresAt: pix.expiresAt,
        amount: finalValue,
        description: title,
        historyId: history.id,
      };
    } catch (e) {
      await supabaseAdmin
        .from("payment_history")
        .update({ status: "failed", metadata: { error: String(e) } })
        .eq("id", history.id);
      throw e;
    }
  });

/**
 * Poll a Mercado Pago PIX payment by ID. Returns normalized status.
 */
export const getPixStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Ensure caller owns this payment
    const { data: row } = await supabaseAdmin
      .from("payment_history")
      .select("id, user_id, status")
      .eq("cakto_payment_id", data.paymentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return { status: "unknown" as const };

    if (row.status === "confirmed") return { status: "approved" as const };
    if (row.status === "failed") return { status: "rejected" as const };
    if (row.status === "refunded") return { status: "refunded" as const };

    const detail = await fetchMpPayment(data.paymentId);
    if (!detail) return { status: "pending" as const };
    return { status: String(detail.status || "pending").toLowerCase() };
  });

export const getProfileCpf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("cpf, name")
      .eq("id", context.userId)
      .maybeSingle();
    return { cpf: data?.cpf ?? null, name: data?.name ?? null };
  });