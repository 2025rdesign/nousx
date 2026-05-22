import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestIP } from "@tanstack/react-start/server";
import {
  findOrCreateCustomer,
  createPixPayment,
  getPixQrCode,
  createCardPayment,
  getPayment,
  createSubscription,
  cancelSubscription,
  getFirstSubscriptionPayment,
} from "./asaas.server";
import { creditUserOnce } from "./credits.server";
import { CREDIT_PACKS, PLANS, applyDiscount, type CreditPackId, type PlanId } from "./payments-config";

async function getOrCreateCustomerForUser(userId: string, email: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("asaas_customer_id, name, cpf")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.cpf || !profile?.name) {
    throw new Error("Preencha seus dados de cobrança antes de continuar.");
  }
  const customer = await findOrCreateCustomer({
    email,
    name: profile?.name ?? null,
    cpfCnpj: profile?.cpf ?? null,
    existingId: profile?.asaas_customer_id ?? null,
  });
  if (profile?.asaas_customer_id !== customer.id) {
    await supabaseAdmin
      .from("profiles")
      .update({ asaas_customer_id: customer.id })
      .eq("id", userId);
  }
  return customer;
}

// CPF validation (only length + digits; full DV check optional)
const cpfRegex = /^\d{11}$/;

export const getCheckoutProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, cpf, asaas_customer_id")
      .eq("id", userId)
      .maybeSingle();
    return {
      email,
      name: profile?.name ?? "",
      cpf: profile?.cpf ?? "",
      ready: Boolean(profile?.name && profile?.cpf && profile?.asaas_customer_id),
    };
  });

export const saveCheckoutProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().trim().min(2).max(100),
        cpf: z
          .string()
          .transform((v) => v.replace(/\D/g, ""))
          .refine((v) => cpfRegex.test(v), "CPF inválido"),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = claims.email as string | undefined;
    if (!email) throw new Error("Email não encontrado.");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("asaas_customer_id")
      .eq("id", userId)
      .maybeSingle();
    const customer = await findOrCreateCustomer({
      email,
      name: data.name,
      cpfCnpj: data.cpf,
      existingId: profile?.asaas_customer_id ?? null,
    });
    await supabaseAdmin
      .from("profiles")
      .update({
        name: data.name,
        cpf: data.cpf,
        asaas_customer_id: customer.id,
      })
      .eq("id", userId);
    return { ok: true, customerId: customer.id };
  });

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("coupons")
      .select("code, discount_percent, active, expires_at")
      .eq("code", data.code.toUpperCase())
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { valid: false as const, message: "Cupom inválido." };
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return { valid: false as const, message: "Cupom expirado." };
    }
    return { valid: true as const, code: row.code, discountPercent: row.discount_percent };
  });

const cardSchema = z.object({
  holderName: z.string().min(1).max(100),
  number: z.string().regex(/^\d{13,19}$/),
  expiryMonth: z.string().regex(/^\d{2}$/),
  expiryYear: z.string().regex(/^\d{4}$/),
  ccv: z.string().regex(/^\d{3,4}$/),
});
const holderSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  cpfCnpj: z.string().regex(/^\d{11,14}$/),
  postalCode: z.string().regex(/^\d{8}$/),
  addressNumber: z.string().min(1).max(20),
  phone: z.string().regex(/^\d{10,11}$/),
});

export const buyCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        packId: z.enum(["starter", "popular", "pro"]),
        method: z.enum(["PIX", "CREDIT_CARD"]),
        couponCode: z.string().max(40).optional().nullable(),
        card: cardSchema.optional(),
        holder: holderSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = claims.email as string | undefined;
    if (!email) throw new Error("Email do usuário não encontrado.");
    const pack = CREDIT_PACKS[data.packId as CreditPackId];
    let value = pack.price;
    let coupon: string | null = null;
    if (data.couponCode) {
      const { data: c } = await supabaseAdmin
        .from("coupons")
        .select("code, discount_percent, active, expires_at")
        .eq("code", data.couponCode.toUpperCase())
        .eq("active", true)
        .maybeSingle();
      if (c && (!c.expires_at || new Date(c.expires_at) > new Date())) {
        value = applyDiscount(value, c.discount_percent);
        coupon = c.code;
      }
    }
    const customer = await getOrCreateCustomerForUser(userId, email);
    const externalRef = `c_${userId.slice(0, 50)}_${data.packId}`;
    if (data.method === "PIX") {
      const payment = await createPixPayment({
        customerId: customer.id,
        value,
        description: `NOUSX — ${pack.name} (${pack.credits} créditos)`,
        externalReference: externalRef,
      });
      const qr = await getPixQrCode(payment.id);
      await supabaseAdmin.from("payment_history").insert({
        user_id: userId,
        amount: value,
        type: "credit",
        status: "pending",
        asaas_payment_id: payment.id,
        metadata: { packId: data.packId, credits: pack.credits, method: "PIX", coupon },
      });
      return {
        method: "PIX" as const,
        paymentId: payment.id,
        qrCodeImage: qr.encodedImage,
        qrCodePayload: qr.payload,
        expirationDate: qr.expirationDate,
        value,
      };
    }
    if (!data.card || !data.holder) throw new Error("Dados do cartão incompletos.");
    const remoteIp = getRequestIP({ xForwardedFor: true }) || "127.0.0.1";
    const payment = await createCardPayment({
      customerId: customer.id,
      value,
      description: `NOUSX — ${pack.name} (${pack.credits} créditos)`,
      externalReference: externalRef,
      card: data.card,
      holder: data.holder,
      remoteIp,
    });
    await supabaseAdmin.from("payment_history").insert({
      user_id: userId,
      amount: value,
      type: "credit",
      status: payment.status.toLowerCase(),
      asaas_payment_id: payment.id,
      metadata: { packId: data.packId, credits: pack.credits, method: "CARD", coupon },
    });
    // If immediately confirmed, credit now (idempotent — webhook may repeat)
    if (["CONFIRMED", "RECEIVED"].includes(payment.status)) {
      await creditUserOnce(payment.id, userId, pack.credits);
    }
    return {
      method: "CREDIT_CARD" as const,
      paymentId: payment.id,
      status: payment.status,
      value,
    };
  });

export const checkPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const p = await getPayment(data.paymentId);
    return { status: p.status, value: p.value };
  });

export const subscribePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planId: z.enum(["plus", "ultra"]),
        method: z.enum(["PIX", "CREDIT_CARD"]),
        couponCode: z.string().max(40).optional().nullable(),
        card: cardSchema.optional(),
        holder: holderSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = claims.email as string | undefined;
    if (!email) throw new Error("Email não encontrado.");
    const plan = PLANS[data.planId as PlanId];
    let value = plan.price;
    let coupon: string | null = null;
    if (data.couponCode) {
      const { data: c } = await supabaseAdmin
        .from("coupons")
        .select("code, discount_percent, active, expires_at")
        .eq("code", data.couponCode.toUpperCase())
        .eq("active", true)
        .maybeSingle();
      if (c && (!c.expires_at || new Date(c.expires_at) > new Date())) {
        value = applyDiscount(value, c.discount_percent);
        coupon = c.code;
      }
    }
    const customer = await getOrCreateCustomerForUser(userId, email);
    const externalRef = `s_${userId.slice(0, 50)}_${data.planId}`;
    if (data.method === "CREDIT_CARD" && (!data.card || !data.holder)) {
      throw new Error("Dados do cartão incompletos.");
    }
    const remoteIp = getRequestIP({ xForwardedFor: true }) || "127.0.0.1";
    const sub = await createSubscription({
      customerId: customer.id,
      value,
      billingType: data.method,
      description: `NOUSX ${plan.name} — assinatura mensal`,
      externalReference: externalRef,
      card: data.card,
      holder: data.holder,
      remoteIp,
    });
    void coupon;
    await supabaseAdmin.from("user_subscriptions").insert({
      user_id: userId,
      plan_id: data.planId,
      status: "pending",
      asaas_subscription_id: sub.id,
      expires_at: sub.nextDueDate ? new Date(sub.nextDueDate).toISOString() : null,
    });

    if (data.method === "PIX") {
      // Fetch the first auto-generated payment of this subscription and pull its
      // PIX QR code so the client can render it immediately.
      try {
        const firstPayment = await getFirstSubscriptionPayment(sub.id);
        if (firstPayment) {
          const qr = await getPixQrCode(firstPayment.id);
          await supabaseAdmin.from("payment_history").insert({
            user_id: userId,
            amount: value,
            type: "subscription",
            status: "pending",
            asaas_payment_id: firstPayment.id,
            metadata: {
              planId: data.planId,
              method: "PIX",
              coupon,
              subscriptionId: sub.id,
            },
          });
          return {
            subscriptionId: sub.id,
            status: sub.status,
            method: "PIX" as const,
            paymentId: firstPayment.id,
            qrCodeImage: qr.encodedImage,
            qrCodePayload: qr.payload,
            expirationDate: qr.expirationDate,
            value,
          };
        }
      } catch (e) {
        console.error("[subscribePlan] PIX QR fetch failed", e);
        throw new Error("Não conseguimos gerar o QR Code PIX. Tente novamente.");
      }
      throw new Error("Cobrança PIX não foi gerada. Tente novamente.");
    }

    return {
      subscriptionId: sub.id,
      status: sub.status,
      method: "CREDIT_CARD" as const,
    };
  });

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("user_subscriptions")
      .select("id, plan_id, status, expires_at, asaas_subscription_id, created_at")
      .eq("user_id", context.userId)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const cancelMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sub } = await supabaseAdmin
      .from("user_subscriptions")
      .select("id, asaas_subscription_id")
      .eq("user_id", context.userId)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub) throw new Error("Nenhuma assinatura ativa.");
    if (sub.asaas_subscription_id) {
      try { await cancelSubscription(sub.asaas_subscription_id); } catch { /* ignore */ }
    }
    await supabaseAdmin
      .from("user_subscriptions")
      .update({ status: "cancelled" })
      .eq("id", sub.id);
    return { ok: true };
  });
