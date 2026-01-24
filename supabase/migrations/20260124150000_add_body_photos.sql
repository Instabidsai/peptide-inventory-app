
-- Add photo_url column to body_composition_logs
ALTER TABLE public.body_composition_logs 
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Create a storage bucket for body composition photos
-- Note: Creating buckets via SQL is specific to Supabase's storage schema
INSERT INTO storage.buckets (id, name, public) 
VALUES ('body-photos', 'body-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for Storage
CREATE POLICY "Body Photos are publicly accessible" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'body-photos' );

CREATE POLICY "Users can upload their own body photos" 
ON storage.objects FOR INSERT 
WITH CHECK ( 
    bucket_id = 'body-photos' AND 
    auth.uid() = owner 
);

CREATE POLICY "Users can update their own body photos" 
ON storage.objects FOR UPDATE 
USING ( 
    bucket_id = 'body-photos' AND 
    auth.uid() = owner 
);

CREATE POLICY "Users can delete their own body photos" 
ON storage.objects FOR DELETE 
USING ( 
    bucket_id = 'body-photos' AND 
    auth.uid() = owner 
);
