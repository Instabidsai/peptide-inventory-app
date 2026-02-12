-- Migration: Add address column to contacts + Create contact_notes table
-- Run this in the Supabase SQL Editor

-- 1. Add address column to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS address text;

-- 2. Create contact_notes table for timestamped CRM-style notes
CREATE TABLE IF NOT EXISTS public.contact_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid REFERENCES auth.users(id),
    org_id uuid NOT NULL REFERENCES public.organizations(id)
);

-- 3. Index for fast lookups by contact
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact_id ON public.contact_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_org_id ON public.contact_notes(org_id);

-- 4. Enable RLS
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (matching contacts table patterns)
CREATE POLICY "Users can view notes in their org"
    ON public.contact_notes FOR SELECT
    USING (org_id = (SELECT get_user_org_id(auth.uid())));

CREATE POLICY "Users can insert notes in their org"
    ON public.contact_notes FOR INSERT
    WITH CHECK (org_id = (SELECT get_user_org_id(auth.uid())));

CREATE POLICY "Users can delete notes in their org"
    ON public.contact_notes FOR DELETE
    USING (org_id = (SELECT get_user_org_id(auth.uid())));
