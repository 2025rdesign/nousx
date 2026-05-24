
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-videos', 'chat-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Chat videos publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-videos');

CREATE POLICY "Chat videos insert own"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Chat videos delete own"
ON storage.objects FOR DELETE
USING (bucket_id = 'chat-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
