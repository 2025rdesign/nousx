import { supabaseAdmin } from "@/integrations/supabase/client.server";

function expiresInOneYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

/**
 * Award referral credits to the referrer the FIRST time the referred
 * user makes any successful purchase. Idempotent via the
 * `first_purchase_rewarded` flag on the referrals row.
 *
 * @param paidUserId   user who just paid
 * @param kind         "subscription" | "credit"
 * @param productId    plan id ("plus" | "ultra") or pack id
 */
export async function rewardReferrerOnFirstPurchase(
  paidUserId: string,
  kind: "subscription" | "credit",
  productId: string | null | undefined,
) {
  try {
    const { data: ref } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_id, referred_id, first_purchase_rewarded")
      .eq("referred_id", paidUserId)
      .maybeSingle();

    if (!ref) return;
    if (ref.first_purchase_rewarded) return;
    if (ref.referrer_id === paidUserId) return;

    let credits = 0;
    if (kind === "subscription") {
      if (productId === "ultra") credits = 50;
      else if (productId === "plus") credits = 10;
    } else if (kind === "credit") {
      credits = 10;
    }
    if (credits <= 0) return;

    await supabaseAdmin.from("credit_batches").insert({
      user_id: ref.referrer_id,
      pack_id: "referral",
      credits_total: credits,
      credits_remaining: credits,
      expires_at: expiresInOneYear(),
      payment_id: `referral_${ref.id}`,
    });

    await supabaseAdmin
      .from("referrals")
      .update({
        first_purchase_rewarded: true,
        rewarded_at: new Date().toISOString(),
        credits_awarded: credits,
      })
      .eq("id", ref.id);

    // Recompute referrer balance
    const { data: batches } = await supabaseAdmin
      .from("credit_batches")
      .select("credits_remaining")
      .eq("user_id", ref.referrer_id);
    const total = (batches ?? []).reduce(
      (a, b) => a + (b.credits_remaining ?? 0),
      0,
    );
    await supabaseAdmin
      .from("credits")
      .upsert(
        {
          user_id: ref.referrer_id,
          balance: total,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    console.log("[REFERRAL] rewarded", {
      referrerId: ref.referrer_id,
      referredId: paidUserId,
      credits,
      kind,
      productId,
    });
  } catch (e) {
    console.error("[REFERRAL] reward error", e);
  }
}