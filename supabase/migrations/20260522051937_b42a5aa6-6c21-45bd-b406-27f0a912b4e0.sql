ALTER TABLE public.profiles RENAME COLUMN asaas_customer_id TO cakto_customer_id;
ALTER TABLE public.payment_history RENAME COLUMN asaas_payment_id TO cakto_payment_id;
ALTER TABLE public.user_subscriptions RENAME COLUMN asaas_subscription_id TO cakto_subscription_id;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_payment_history_cakto_payment_id ON public.payment_history(cakto_payment_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_cakto_subscription_id ON public.user_subscriptions(cakto_subscription_id);