-- Phase 3: Media & Notifications Schema

-- 1. Add Attachments to Client Requests
ALTER TABLE public.client_requests 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- 2. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    type TEXT DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" 
ON public.notifications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users/Admins can insert notifications" 
ON public.notifications FOR INSERT 
WITH CHECK (true); -- Allow system/admins to insert for anyone

CREATE POLICY "Users can update own notifications" 
ON public.notifications FOR UPDATE 
USING (auth.uid() = user_id);

-- 4. Storage Bucket (Idempotent attempt)
INSERT INTO storage.buckets (id, name, public)
VALUES ('messaging-attachments', 'messaging-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage Policy (Public Read, Authenticated Upload)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'messaging-attachments' );

CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'messaging-attachments' AND auth.role() = 'authenticated' );
