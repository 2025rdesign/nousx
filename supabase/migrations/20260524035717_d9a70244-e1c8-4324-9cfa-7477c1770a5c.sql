-- Allow anonymous/public read of approved public gallery images
CREATE POLICY "Gallery select public approved"
ON public.gallery
FOR SELECT
TO anon, authenticated
USING (is_public = true AND is_approved = true);