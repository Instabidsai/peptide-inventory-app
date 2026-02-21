-- Sender aliases: learned mappings from email sender names to contacts
-- When admin confirms "ROCK SEGAL = Rocky Segal", future scans auto-match

CREATE TABLE public.sender_aliases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sender_name text NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  payment_method text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, sender_name)
);

ALTER TABLE public.sender_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access" ON public.sender_aliases FOR ALL
  USING (org_id = get_user_org_id(auth.uid()));

-- Add AI suggestion columns to payment_email_queue
ALTER TABLE public.payment_email_queue
  ADD COLUMN IF NOT EXISTS ai_suggested_contact_id uuid REFERENCES public.contacts(id),
  ADD COLUMN IF NOT EXISTS ai_reasoning text;
