-- Phase 4: Voice Messaging (Bi-Directional)

-- 1. Add Admin Attachments column (to store Admin voice notes/files)
ALTER TABLE public.client_requests 
ADD COLUMN IF NOT EXISTS admin_attachments JSONB DEFAULT '[]'::jsonb;

-- 2. Ensure Storage Policy allows Admins to upload (Already encompassed by Authenticated policy, but robust check)
-- (No change needed if buckets are public-read and auth-write, which they are from Phase 3)
