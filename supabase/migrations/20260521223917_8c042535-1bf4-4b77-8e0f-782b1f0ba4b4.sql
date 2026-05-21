ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_id text;
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON public.conversations(user_id, pinned, updated_at DESC);