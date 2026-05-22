import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Expiration windows per pack/plan, in days. null = never expires.
const EXPIRATION_DAYS: Record<string, number | null> = {
  starter: 10,
  popular: 30,
  pro: null,
  plus: 30,
  ultra: 30,
};

function expiresAtForPack(packId: string | null | undefined): string | null {
  if (!packId) return null;
  const d = EXPIRATION_DAYS[packId];
  if (d == null) return null;
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t.toISOString();
}

async function recomputeBalance(userId: string) {
  // Expire batches whose date has passed.
  await supabaseAdmin
    .from("credit_batches")
    .update({ credits_remaining: 0 })
    .eq("user_id", userId)
    .lt("expires_at", new Date().toISOString())
    .gt("credits_remaining", 0);

  const { data: batches } = await supabaseAdmin
    .from("credit_batches")
    .select("credits_remaining")
    .eq("user_id", userId);
  const total = (batches ?? []).reduce(
    (a, b) => a + (b.credits_remaining ?? 0),
    0,
  );
  await supabaseAdmin
    .from("credits")
    .upsert(
      { user_id: userId, balance: total, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return total;
}

/**
 * Consumes `amount` credits for `userId`, deducting from batches with the
 * soonest expiration first (NULL = non-expiring goes last, so the user
 * keeps the most flexible credits longer). Throws if balance insufficient.
 */
export async function consumeCredits(userId: string, amount: number) {
  const available = await recomputeBalance(userId);
  if (available < amount) throw new Error("Créditos insuficientes.");

  const { data: batches } = await supabaseAdmin
    .from("credit_batches")
    .select("id, credits_remaining, expires_at, created_at")
    .eq("user_id", userId)
    .gt("credits_remaining", 0)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  let left = amount;
  for (const b of batches ?? []) {
    if (left <= 0) break;
    const take = Math.min(b.credits_remaining ?? 0, left);
    await supabaseAdmin
      .from("credit_batches")
      .update({ credits_remaining: (b.credits_remaining ?? 0) - take })
      .eq("id", b.id);
    left -= take;
  }
  await recomputeBalance(userId);
}

// Idempotent credit grant. Marks payment_history.metadata.credited=true
// the first time a payment is credited so retries are no-ops.
export async function creditUserOnce(
  paymentId: string,
  userId: string,
  amount: number,
  packId?: string | null,
) {
  const { data: existing } = await supabaseAdmin
    .from("payment_history")
    .select("id, status, metadata")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();
  const meta = (existing?.metadata as Record<string, unknown> | null) || null;
  if (meta && meta.credited === true) return;

  // Insert a batch row (idempotent on payment_id) and recompute balance.
  const resolvedPack = packId ?? (meta?.packId as string | undefined) ?? null;
  await supabaseAdmin.from("credit_batches").insert({
    user_id: userId,
    pack_id: resolvedPack ?? "manual",
    credits_total: amount,
    credits_remaining: amount,
    expires_at: expiresAtForPack(resolvedPack),
    payment_id: paymentId,
  });
  await recomputeBalance(userId);

  if (existing) {
    await supabaseAdmin
      .from("payment_history")
      .update({
        status: "confirmed",
        metadata: { ...(meta || {}), credited: true },
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("payment_history").insert({
      user_id: userId,
      amount: 0,
      type: "credit",
      status: "confirmed",
      asaas_payment_id: paymentId,
      metadata: { credited: true, grantedAmount: amount, packId: resolvedPack },
    });
  }
}