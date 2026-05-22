CREATE TABLE IF NOT EXISTS public.credit_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pack_id TEXT NOT NULL,
  credits_total INTEGER NOT NULL,
  credits_remaining INTEGER NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  payment_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_batches_user ON public.credit_batches (user_id);
CREATE INDEX IF NOT EXISTS idx_credit_batches_user_expires
  ON public.credit_batches (user_id, expires_at NULLS LAST, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_batches_payment
  ON public.credit_batches (payment_id) WHERE payment_id IS NOT NULL;

ALTER TABLE public.credit_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Credit batches select own"
ON public.credit_batches FOR SELECT
USING (auth.uid() = user_id);

CREATE TRIGGER trg_credit_batches_updated
BEFORE UPDATE ON public.credit_batches
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();