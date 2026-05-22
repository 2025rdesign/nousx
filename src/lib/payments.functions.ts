import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildHostedCheckoutUrl } from "./cakto.server";
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

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const c = await resolveCoupon(data.code);
    if (!c) return { valid: false as const, message: "Cupom inválido ou expirado." };
    return { valid: true as const, code: c.code, discountPercent: c.discountPercent };
  });

export const startCreditCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        packId: z.enum(["starter", "popular", "pro"]),
        couponCode: z.string().max(40).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";
    const profile = await ensureNotBlocked(userId);
    const pack = CREDIT_PACKS[data.packId as CreditPackId];
    const coupon = await resolveCoupon(data.couponCode);
    const value = coupon ? applyDiscount(pack.price, coupon.discountPercent) : pack.price;
    const externalRef = `c_${userId.slice(0, 50)}_${data.packId}`;
    const checkoutUrl = buildHostedCheckoutUrl({
      checkoutId: pack.productId,
      customer: { name: profile?.name ?? undefined, email },
      couponCode: coupon?.code ?? null,
      externalReference: externalRef,
    });
    await supabaseAdmin.from("payment_history").insert({
      user_id: userId,
      amount: value,
      type: "credit",
      status: "pending",
      cakto_payment_id: null,
      metadata: {
        packId: data.packId,
        credits: pack.credits,
        coupon: coupon?.code ?? null,
        email,
        product_id: pack.productId,
        external_reference: externalRef,
        hosted_checkout_url: checkoutUrl,
      },
    });
    return { checkoutUrl, value };
  });

export const startSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planId: z.enum(["plus", "ultra"]),
        couponCode: z.string().max(40).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined) ?? "";
    const profile = await ensureNotBlocked(userId);
    const plan = PLANS[data.planId as PlanId];
    const coupon = await resolveCoupon(data.couponCode);
    const value = coupon ? applyDiscount(plan.price, coupon.discountPercent) : plan.price;
    const externalRef = `s_${userId.slice(0, 50)}_${data.planId}`;
    const checkoutUrl = buildHostedCheckoutUrl({
      checkoutId: plan.productId,
      customer: { name: profile?.name ?? undefined, email },
      couponCode: coupon?.code ?? null,
      externalReference: externalRef,
    });
    await supabaseAdmin.from("payment_history").insert({
      user_id: userId,
      amount: value,
      type: "subscription",
      status: "pending",
      cakto_payment_id: null,
      metadata: {
        planId: data.planId,
        coupon: coupon?.code ?? null,
        email,
        product_id: plan.productId,
        external_reference: externalRef,
        hosted_checkout_url: checkoutUrl,
      },
    });
    return { checkoutUrl, value };
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
