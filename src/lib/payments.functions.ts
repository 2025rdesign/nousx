import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildHostedCheckoutUrl,
  createPixOrder,
  createCardOrder,
  getOrder,
  isPaid,
} from "./cakto.server";
import { creditUserOnce } from "./credits.server";
import {
  CREDIT_PACKS,
  PLANS,
  applyDiscount,
  type CreditPackId,
  type PlanId,
} from "./payments-config";

// CPF validation (only length + digits)
const cpfRegex = /^\d{11}$/;

async function loadProfileForCheckout(userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("name, cpf, cakto_customer_id, is_blocked")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return profile;
}

function buildCustomer(name: string, email: string, cpf: string) {
  return { name, email, document: cpf };
}

function resolveOrderId(order: { id?: string; raw?: unknown } | null | undefined) {
  const orderId = order?.id?.trim();
  if (!orderId) {
    console.warn("[CAKTO] ordem sem id válido:", JSON.stringify(order?.raw ?? order ?? null));
    return null;
  }
  return orderId;
}

async function ensureNotBlocked(userId: string) {
  const profile = await loadProfileForCheckout(userId);
  if (profile?.is_blocked) {
    throw new Error("Sua conta está com restrição de compra. Entre em contato com o suporte.");
  }
  return profile;
}

export const getCheckoutProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";
    const profile = await loadProfileForCheckout(userId);
    return {
      email,
      name: profile?.name ?? "",
      cpf: profile?.cpf ?? "",
      ready: Boolean(profile?.name && profile?.cpf),
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
    const { userId } = context;
    await supabaseAdmin
      .from("profiles")
      .update({ name: data.name, cpf: data.cpf })
      .eq("id", userId);
    return { ok: true };
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

function toCaktoCard(card: z.infer<typeof cardSchema>) {
  // expiry: MM/YY (Cakto convention based on user spec)
  const yy = card.expiryYear.slice(-2);
  return {
    card_number: card.number,
    card_holder: card.holderName,
    card_expiry: `${card.expiryMonth}/${yy}`,
    card_cvv: card.ccv,
  };
}

export const buyCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        packId: z.enum(["starter", "popular", "pro"]),
        method: z.enum(["PIX", "CREDIT_CARD"]),
        couponCode: z.string().max(40).optional().nullable(),
        card: cardSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = claims.email as string | undefined;
    if (!email) throw new Error("Email do usuário não encontrado.");
    const profile = await ensureNotBlocked(userId);
    if (!profile?.name || !profile?.cpf) {
      throw new Error("Preencha seus dados de cobrança antes de continuar.");
    }
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
    const customer = buildCustomer(profile.name, email, profile.cpf);
    const externalRef = `c_${userId.slice(0, 50)}_${data.packId}`;

    if (data.method === "PIX") {
      let order = null;
      try {
        order = await createPixOrder({
          productId: pack.productId,
          customer,
          externalReference: externalRef,
        });
      } catch (error) {
        console.warn(
          "[CAKTO] falha ao criar ordem PIX, usando checkout hospedado:",
          error instanceof Error ? error.message : String(error),
        );
      }
      const orderId = resolveOrderId(order);
      const redirectUrl =
        order?.checkoutUrl ??
        buildHostedCheckoutUrl({
          checkoutId: pack.productId,
          customer,
          couponCode: coupon,
        });
      const canUseDirectPix = Boolean(
        orderId && (order?.pix_qr_image || order?.qr_code || order?.pix_code),
      );
      await supabaseAdmin.from("payment_history").insert({
        user_id: userId,
        amount: value,
        type: "credit",
        status: "pending",
        cakto_payment_id: resolveOrderId(order),
        metadata: {
          packId: data.packId,
          credits: pack.credits,
          method: "PIX",
          coupon,
          email,
          product_id: pack.productId,
          external_reference: externalRef,
          hosted_checkout_url: redirectUrl,
        },
      });
      return {
        method: "PIX" as const,
        paymentId: orderId ?? pack.productId,
        qrCodeImage: order?.pix_qr_image ?? order?.qr_code ?? "",
        qrCodePayload: order?.pix_code ?? order?.qr_code ?? "",
        expirationDate: order?.expires_at ?? null,
        redirectUrl: canUseDirectPix ? null : redirectUrl,
        value,
      };
    }

    if (!data.card) throw new Error("Dados do cartão incompletos.");
    let order = null;
    try {
      order = await createCardOrder({
        productId: pack.productId,
        customer,
        card: toCaktoCard(data.card),
        externalReference: externalRef,
      });
    } catch (error) {
      console.warn(
        "[CAKTO] falha ao criar ordem no cartão, usando checkout hospedado:",
        error instanceof Error ? error.message : String(error),
      );
    }
    const orderId = resolveOrderId(order) ?? pack.productId;
    const redirectUrl =
      order?.checkoutUrl ??
      buildHostedCheckoutUrl({
        checkoutId: pack.productId,
        customer,
        couponCode: coupon,
      });
    await supabaseAdmin.from("payment_history").insert({
      user_id: userId,
      amount: value,
      type: "credit",
      status: (order?.status ?? "pending").toLowerCase(),
      cakto_payment_id: resolveOrderId(order),
      metadata: {
        packId: data.packId,
        credits: pack.credits,
        method: "CARD",
        coupon,
        email,
        product_id: pack.productId,
        external_reference: externalRef,
        hosted_checkout_url: redirectUrl,
      },
    });
    if (orderId && order && isPaid(order.status)) {
      await creditUserOnce(orderId, userId, pack.credits, data.packId);
    }
    return {
      method: "CREDIT_CARD" as const,
      paymentId: orderId,
      status: order ? (isPaid(order.status) ? "CONFIRMED" : (order.status ?? "PENDING").toUpperCase()) : "REDIRECT",
      redirectUrl,
      value,
    };
  });

export const checkPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const p = await getOrder(data.paymentId);
    const status = isPaid(p.status) ? "CONFIRMED" : (p.status ?? "PENDING").toUpperCase();
    return { status, value: p.amount ?? 0 };
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
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = claims.email as string | undefined;
    if (!email) throw new Error("Email não encontrado.");
    const profile = await ensureNotBlocked(userId);
    if (!profile?.name || !profile?.cpf) {
      throw new Error("Preencha seus dados de cobrança antes de continuar.");
    }
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
    const customer = buildCustomer(profile.name, email, profile.cpf);
    const externalRef = `s_${userId.slice(0, 50)}_${data.planId}`;

    let order = null;
    if (data.method === "PIX") {
      try {
        order = await createPixOrder({
          productId: plan.productId,
          customer,
          externalReference: externalRef,
        });
      } catch (error) {
        console.warn(
          "[CAKTO] falha ao criar ordem PIX de assinatura, usando checkout hospedado:",
          error instanceof Error ? error.message : String(error),
        );
      }
    } else {
      if (!data.card) throw new Error("Dados do cartão incompletos.");
      try {
        order = await createCardOrder({
          productId: plan.productId,
          customer,
          card: toCaktoCard(data.card),
          externalReference: externalRef,
        });
      } catch (error) {
        console.warn(
          "[CAKTO] falha ao criar ordem de assinatura no cartão, usando checkout hospedado:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const orderId = resolveOrderId(order);
    const redirectUrl =
      order?.checkoutUrl ??
      buildHostedCheckoutUrl({
        checkoutId: plan.productId,
        customer,
        couponCode: coupon,
      });
    const canUseDirectPix = Boolean(
      orderId && (order?.pix_qr_image || order?.qr_code || order?.pix_code),
    );

    const nextRenewal = new Date();
    nextRenewal.setDate(nextRenewal.getDate() + 30);

    await supabaseAdmin.from("user_subscriptions").insert({
      user_id: userId,
      plan_id: data.planId,
      status: order && isPaid(order.status) ? "active" : "pending",
      cakto_subscription_id: order?.subscription_id ?? orderId,
      expires_at: order && isPaid(order.status) ? nextRenewal.toISOString() : null,
    });

    await supabaseAdmin.from("payment_history").insert({
      user_id: userId,
      amount: value,
      type: "subscription",
      status: order && isPaid(order.status) ? "confirmed" : "pending",
      cakto_payment_id: resolveOrderId(order),
      metadata: {
        planId: data.planId,
        method: data.method,
        coupon,
        email,
        product_id: plan.productId,
        subscription_id: order?.subscription_id ?? orderId,
        external_reference: externalRef,
        hosted_checkout_url: redirectUrl,
      },
    });

    if (order && orderId && isPaid(order.status)) {
      await creditUserOnce(orderId, userId, plan.credits, data.planId);
    }

    if (data.method === "PIX") {
      return {
        subscriptionId: order?.subscription_id ?? orderId ?? plan.productId,
        status: order?.status ?? "pending",
        method: "PIX" as const,
        paymentId: orderId ?? plan.productId,
        qrCodeImage: order?.pix_qr_image ?? order?.qr_code ?? "",
        qrCodePayload: order?.pix_code ?? order?.qr_code ?? "",
        expirationDate: order?.expires_at ?? null,
        redirectUrl: canUseDirectPix ? null : redirectUrl,
        value,
      };
    }
    return {
      subscriptionId: order?.subscription_id ?? orderId ?? plan.productId,
      status: order?.status ?? "REDIRECT",
      method: "CREDIT_CARD" as const,
      paymentId: orderId ?? plan.productId,
      redirectUrl,
    };
  });

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("user_subscriptions")
      .select("id, plan_id, status, expires_at, cakto_subscription_id, created_at")
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
      .select("id, cakto_subscription_id")
      .eq("user_id", context.userId)
      .in("status", ["active", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub) throw new Error("Nenhuma assinatura ativa.");
    await supabaseAdmin
      .from("user_subscriptions")
      .update({ status: "cancelled" })
      .eq("id", sub.id);
    return { ok: true };
  });
