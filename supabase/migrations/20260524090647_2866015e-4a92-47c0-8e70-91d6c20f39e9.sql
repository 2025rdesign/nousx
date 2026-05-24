CREATE TABLE IF NOT EXISTS public.video_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NULL,
  source_image_url text NOT NULL,
  xai_request_id text NULL,
  status text NOT NULL DEFAULT 'pending',
  final_video_url text NULL,
  provider text NOT NULL DEFAULT 'xai',
  error_message text NULL,
  credits_charged boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_user_status_created
  ON public.video_jobs (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_jobs_conversation_created
  ON public.video_jobs (conversation_id, created_at DESC);

ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Video jobs select own"
ON public.video_jobs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Video jobs insert own"
ON public.video_jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Video jobs update own"
ON public.video_jobs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Video jobs delete own"
ON public.video_jobs
FOR DELETE
USING (auth.uid() = user_id);

CREATE OR REPLACE TRIGGER trg_video_jobs_touch_updated_at
BEFORE UPDATE ON public.video_jobs
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();