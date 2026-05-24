
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true;
ALTER TABLE public.character_profiles ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_characters_public_approved ON public.characters (is_public, is_approved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_public_approved ON public.character_profiles (is_public, is_approved, created_at DESC);
