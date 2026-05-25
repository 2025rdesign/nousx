
-- CORRETIVA: garante que handle_new_user() não concede créditos
-- automáticos. Se a migration 20260525130000 não foi aplicada ao banco
-- (migrations precisam ser enviadas via `supabase db push` ou pelo
-- Dashboard → SQL Editor), esta migration corrige diretamente.
--
-- A função usa CREATE OR REPLACE, portanto é idempotente:
-- aplicar múltiplas vezes não tem efeito colateral.
--
-- REGRA VIGENTE após esta migration:
--   - Cadastro sem link de indicação → 0 créditos
--   - Cadastro via ?ref=CODIGO válido → 5 créditos (dados por attachReferral())
--
-- Usuários existentes NÃO são afetados.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );

  -- Inicia com saldo 0. Créditos de boas-vindas são concedidos APENAS
  -- por attachReferral() quando o usuário veio por link de indicação.
  INSERT INTO public.credits (user_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Verificação: ao final desta migration o banco deve reportar:
-- SELECT prosrc FROM pg_proc WHERE proname = 'handle_new_user';
-- O resultado deve conter "balance) VALUES (NEW.id, 0)" — sem credit_batches.
