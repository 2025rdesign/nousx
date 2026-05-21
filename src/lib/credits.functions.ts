import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("credits")
      .select("balance, total_purchased")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { balance: data?.balance ?? 0, totalPurchased: data?.total_purchased ?? 0 };
  });