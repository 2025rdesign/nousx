
-- NOVA REGRA: créditos de boas-vindas apenas para usuários indicados.
-- O trigger handle_new_user cria perfil e linha de créditos zerada.
-- Os 5 créditos só são concedidos via attachReferral() (server function)
-- quando referred_by for preenchido. Isso garante a ordem:
--   (a) conta criada → (b) referral salvo → (c) créditos concedidos.
--
-- Usuários existentes NÃO são afetados (esta função só rege novos inserts).

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

  -- Balance starts at 0. Welcome credits are awarded by attachReferral()
  -- only when the user signed up through a referral link.
  INSERT INTO public.credits (user_id, balance) VALUES (NEW.id, 0);

  RETURN NEW;
END;
$function$;
