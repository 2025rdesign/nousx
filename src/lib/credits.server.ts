import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Idempotent credit grant. Marks payment_history.metadata.credited=true
// the first time a payment is credited so retries are no-ops.
export async function creditUserOnce(
  paymentId: string,
  userId: string,
  amount: number,
) {
  const { data: existing } = await supabaseAdmin
    .from("payment_history")
    .select("id, status, metadata")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();
  const meta = (existing?.metadata as Record<string, unknown> | null) || null;
  if (meta && meta.credited === true) return;

  const { data: current } = await supabaseAdmin
    .from("credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  const newBalance = (current?.balance ?? 0) + amount;
  await supabaseAdmin
    .from("credits")
    .upsert({ user_id: userId, balance: newBalance }, { onConflict: "user_id" });

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
      metadata: { credited: true, grantedAmount: amount },
    });
  }
}