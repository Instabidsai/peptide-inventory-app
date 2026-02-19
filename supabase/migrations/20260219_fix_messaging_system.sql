-- Fix messaging system: add profile FK for PostgREST joins + create request_replies table

-- 1. Add missing columns to client_requests (used by ClientRequestModal + MessageThread)
ALTER TABLE public.client_requests
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS admin_attachments JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS context_type TEXT,
  ADD COLUMN IF NOT EXISTS context_id UUID;

-- 2. Add FK from client_requests.user_id → profiles(user_id)
--    This allows PostgREST to resolve the join `profile:profiles!...(full_name, email)`
--    profiles.user_id already has a UNIQUE constraint from the original migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_requests_profile_fk'
  ) THEN
    ALTER TABLE public.client_requests
      ADD CONSTRAINT client_requests_profile_fk
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;
END$$;

-- 3. Create request_replies table (threaded messaging on requests)
CREATE TABLE IF NOT EXISTS public.request_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES public.client_requests(id) ON DELETE CASCADE NOT NULL,
    user_id UUID NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    attachments JSONB DEFAULT '[]',
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Add FKs on request_replies.user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_replies_user_fk'
  ) THEN
    ALTER TABLE public.request_replies
      ADD CONSTRAINT request_replies_user_fk
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'request_replies_profile_fk'
  ) THEN
    ALTER TABLE public.request_replies
      ADD CONSTRAINT request_replies_profile_fk
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;
END$$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_request_replies_request ON public.request_replies(request_id);
CREATE INDEX IF NOT EXISTS idx_request_replies_user ON public.request_replies(user_id);

-- 6. RLS
ALTER TABLE public.request_replies ENABLE ROW LEVEL SECURITY;

-- Clients can view replies on their own requests; admins/staff can view all
CREATE POLICY "View request replies" ON public.request_replies
  FOR SELECT TO authenticated
  USING (
    request_id IN (SELECT id FROM public.client_requests WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'staff')
  );

-- Anyone can insert replies on requests they own or if they're admin/staff
CREATE POLICY "Insert request replies" ON public.request_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      request_id IN (SELECT id FROM public.client_requests WHERE user_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'staff')
    )
  );

-- Admins can update replies (for moderation)
CREATE POLICY "Admin update replies" ON public.request_replies
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 7. Create messaging-attachments storage bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('messaging-attachments', 'messaging-attachments', true)
ON CONFLICT (id) DO NOTHING;
