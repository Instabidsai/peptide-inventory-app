-- Track automation modules per org
CREATE TABLE IF NOT EXISTS public.automation_modules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_type text NOT NULL,
  enabled boolean DEFAULT true,
  config jsonb DEFAULT '{}',
  last_run_at timestamptz,
  run_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, module_type)
);

-- Payment email processing queue
CREATE TABLE IF NOT EXISTS public.payment_email_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  sender_name text,
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  email_subject text,
  email_snippet text,
  email_date timestamptz,
  matched_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  matched_movement_id uuid REFERENCES public.movements(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  confidence text NOT NULL DEFAULT 'low',
  auto_posted_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, gmail_message_id)
);

-- RLS
ALTER TABLE public.automation_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access_automation_modules" ON public.automation_modules FOR ALL
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "org_access_payment_email_queue" ON public.payment_email_queue FOR ALL
  USING (org_id = get_user_org_id(auth.uid()));

-- Index for fast lookups
CREATE INDEX idx_payment_queue_status ON public.payment_email_queue(org_id, status);
CREATE INDEX idx_payment_queue_created ON public.payment_email_queue(created_at DESC);
