-- Partner AI Chat: chat history + suggestions feedback loop

-- 1. Partner chat messages (same pattern as admin_chat_messages)
CREATE TABLE IF NOT EXISTS public.partner_chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.partner_chat_messages ENABLE ROW LEVEL SECURITY;

-- Partners see only their own messages
CREATE POLICY "own_messages" ON public.partner_chat_messages FOR ALL
  USING (user_id = auth.uid());

-- Index for fast history loading
CREATE INDEX IF NOT EXISTS idx_partner_chat_user ON public.partner_chat_messages(user_id, created_at DESC);

-- 2. Partner suggestions (feedback loop to admin)
CREATE TABLE IF NOT EXISTS public.partner_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_text text NOT NULL,
  category text NOT NULL DEFAULT 'feature' CHECK (category IN ('feature', 'bug', 'question', 'other')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'implemented', 'dismissed')),
  admin_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.partner_suggestions ENABLE ROW LEVEL SECURITY;

-- Partners see their own suggestions
CREATE POLICY "partner_own_suggestions" ON public.partner_suggestions FOR SELECT
  USING (partner_id = auth.uid());

CREATE POLICY "partner_insert_suggestions" ON public.partner_suggestions FOR INSERT
  WITH CHECK (partner_id = auth.uid());

-- Admins see all suggestions for their org
CREATE POLICY "admin_all_suggestions" ON public.partner_suggestions FOR ALL
  USING (org_id = get_user_org_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_partner_suggestions_org ON public.partner_suggestions(org_id, status, created_at DESC);
