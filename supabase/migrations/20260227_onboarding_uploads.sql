-- Storage bucket for onboarding file uploads (CSVs, images, PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-uploads',
  'onboarding-uploads',
  false,
  10485760,  -- 10MB max
  ARRAY[
    'text/csv',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Users can upload files scoped to their own user_id folder
CREATE POLICY "Users upload own onboarding files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'onboarding-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can read their own uploads
CREATE POLICY "Users read own onboarding uploads"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'onboarding-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own uploads
CREATE POLICY "Users delete own onboarding uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'onboarding-uploads'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
