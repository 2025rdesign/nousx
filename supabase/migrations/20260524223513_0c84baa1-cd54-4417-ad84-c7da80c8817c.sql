
CREATE TABLE IF NOT EXISTS public.image_usage (
  user_id uuid PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.image_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Image usage select own" ON public.image_usage;
CREATE POLICY "Image usage select own"
  ON public.image_usage
  FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly';
