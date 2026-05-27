
-- Credits: server-only mutations
DROP POLICY IF EXISTS "Credits update by owner" ON public.credits;

-- Video jobs: server-only updates
DROP POLICY IF EXISTS "Video jobs update own" ON public.video_jobs;

-- Coupons: server-only reads
DROP POLICY IF EXISTS "Coupons readable by authenticated" ON public.coupons;

-- Profiles: restrict updatable columns
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;
GRANT UPDATE (name, avatar_url, avatar_id) ON public.profiles TO authenticated;

-- Characters & character_profiles: restrict public exposure (server-side listings use service role)
DROP POLICY IF EXISTS "CP select own or public" ON public.character_profiles;
CREATE POLICY "CP select own"
  ON public.character_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Characters select own or public" ON public.characters;
CREATE POLICY "Characters select own"
  ON public.characters
  FOR SELECT
  USING (auth.uid() = user_id);

-- Storage: remove broad SELECT policies (public bucket URLs continue to work via the public CDN endpoint)
DROP POLICY IF EXISTS "Audio library public read" ON storage.objects;
DROP POLICY IF EXISTS "Chat videos publicly readable" ON storage.objects;

-- Fix mutable search_path on handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credits (user_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
