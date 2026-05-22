
CREATE TABLE public.pix_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('credit','subscription')),
  target_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  qr_code TEXT NOT NULL DEFAULT '',
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded','disputed','expired')),
  coupon_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pix_payments_user ON public.pix_payments(user_id, created_at DESC);
CREATE INDEX idx_pix_payments_external ON public.pix_payments(external_id);

ALTER TABLE public.pix_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pix select own" ON public.pix_payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER trg_pix_payments_updated
  BEFORE UPDATE ON public.pix_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
