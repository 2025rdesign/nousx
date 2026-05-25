
-- Add is_approved moderation flag to characters
-- (was missing; .eq("is_approved", true) in fetchPublicCharacters caused PostgREST error)
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_characters_public_approved_created
  ON public.characters (is_public, is_approved, created_at DESC);

-- Add is_approved moderation flag to character_profiles
ALTER TABLE public.character_profiles
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_character_profiles_public_approved_created
  ON public.character_profiles (is_public, is_approved, created_at DESC);

-- Allow anyone to read profile display names so creator attribution
-- works in /explorar for anonymous and cross-user reads.
-- The existing "Profiles viewable by owner" policy only covers auth.uid() = id,
-- which blocks reading other users' names.
DROP POLICY IF EXISTS "Profiles name readable by all" ON public.profiles;
CREATE POLICY "Profiles name readable by all" ON public.profiles
  FOR SELECT USING (true);
