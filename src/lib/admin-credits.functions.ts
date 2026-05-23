import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const addManualCredits = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; credits: number; daysValid: number }) => input)
  .handler(async ({ data }) => {
    const { email, credits, daysValid } = data;

    // 1. Buscar usuário no auth
    const { data: userData, error: userError } = await supabaseAdmin
      .from("auth.users")
      .select("id")
      .eq("email", email)
      .single();

    if (userError) {
      throw new Error(`Usuário não encontrado: ${userError.message}`);
    }

    const userId = userData.id;

    // 2. Atualizar/adicionar saldo na tabela credits
    const { error: creditError } = await supabaseAdmin
      .from("credits")
      .upsert({
        user_id: userId,
        balance: credits,
        total_purchased: credits,
        updated_at: new Date().toISOString(),
      });

    if (creditError) throw creditError;

    // 3. Adicionar batch de créditos com validade
    const { error: batchError } = await supabaseAdmin.from("credit_batches").insert({
      user_id: userId,
      pack_id: "manual-gift",
      credits_total: credits,
      credits_remaining: credits,
      expires_at: new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (batchError) throw batchError;

    // 4. Registrar em payment_history
    const { error: paymentError } = await supabaseAdmin.from("payment_history").insert({
      user_id: userId,
      amount: 0,
      type: "manual_gift",
      status: "completed",
      metadata: { credits_granted: credits, source: "manual", email },
    });

    if (paymentError) throw paymentError;

    return { success: true, userId, creditsAdded: credits };
  });
