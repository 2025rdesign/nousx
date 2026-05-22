
-- Backfill: every user in credits without batches gets 5 free non-expiring credits
INSERT INTO public.credit_batches (user_id, pack_id, credits_total, credits_remaining, expires_at)
SELECT c.user_id, 'free', 5, 5, NULL
FROM public.credits c
WHERE NOT EXISTS (SELECT 1 FROM public.credit_batches b WHERE b.user_id = c.user_id);

-- Sync credits.balance to sum(batches)
UPDATE public.credits c
SET balance = COALESCE((SELECT SUM(credits_remaining) FROM public.credit_batches b WHERE b.user_id = c.user_id), 0),
    updated_at = now();

-- Update new user trigger to also create a batch
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.credits (user_id, balance) VALUES (NEW.id, 5);
  INSERT INTO public.credit_batches (user_id, pack_id, credits_total, credits_remaining, expires_at)
    VALUES (NEW.id, 'free', 5, 5, NULL);
  RETURN NEW;
END;
$function$;

-- Grant 1000 credits to contatord2023@gmail.com
INSERT INTO public.credit_batches (user_id, pack_id, credits_total, credits_remaining, expires_at)
SELECT id, 'manual', 1000, 1000, NULL FROM auth.users WHERE email = 'contatord2023@gmail.com';

UPDATE public.credits c
SET balance = COALESCE((SELECT SUM(credits_remaining) FROM public.credit_batches b WHERE b.user_id = c.user_id), 0),
    updated_at = now()
WHERE c.user_id IN (SELECT id FROM auth.users WHERE email = 'contatord2023@gmail.com');
