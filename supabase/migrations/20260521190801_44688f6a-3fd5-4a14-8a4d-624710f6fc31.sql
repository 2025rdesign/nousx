-- Add UPDATE policy on credits for the owner so server fns acting as the user can decrement balance.
CREATE POLICY "Credits update by owner"
  ON public.credits
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy on characters explicit (already exists from spec). Skipping.

-- Useful indexes for gallery and public explore.
CREATE INDEX IF NOT EXISTS idx_characters_user_created ON public.characters (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_characters_public_created ON public.characters (is_public, created_at DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_character_profiles_user ON public.character_profiles (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_character_profiles_public ON public.character_profiles (is_public, created_at DESC) WHERE is_public = true;