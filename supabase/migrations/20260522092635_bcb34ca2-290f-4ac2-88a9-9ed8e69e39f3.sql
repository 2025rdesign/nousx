-- Gallery (images)
CREATE TABLE IF NOT EXISTS public.gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'studio',
  prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gallery_user_id_created ON public.gallery(user_id, created_at DESC);
ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gallery select own" ON public.gallery FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Gallery insert own" ON public.gallery FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Gallery delete own" ON public.gallery FOR DELETE USING (auth.uid() = user_id);

-- Audio library
CREATE TABLE IF NOT EXISTS public.audio_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  audio_url TEXT,
  text_content TEXT,
  duration_seconds INTEGER,
  voice_id TEXT DEFAULT 'ara',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audio_library_user_id_created ON public.audio_library(user_id, created_at DESC);
ALTER TABLE public.audio_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audio select own" ON public.audio_library FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Audio insert own" ON public.audio_library FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Audio delete own" ON public.audio_library FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for audio (public so MP3 playable via URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-library', 'audio-library', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Audio library public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audio-library');

CREATE POLICY "Audio library upload own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio-library' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Audio library delete own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'audio-library' AND auth.uid()::text = (storage.foldername(name))[1]);