-- 1. Update Enums (Handle if 'client' already exists)
DO $$
BEGIN
  ALTER TYPE "public"."app_role" ADD VALUE IF NOT EXISTS 'client';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Update Contacts Table
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS tier text DEFAULT 'public';

-- Add check constraint for tier
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_tier_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_tier_check CHECK (tier IN ('family', 'network', 'public'));

-- 3. Create protocol_feedback table
CREATE TABLE IF NOT EXISTS protocol_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_id uuid REFERENCES protocols(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id),
    rating smallint CHECK (rating >= 1 AND rating <= 5),
    comment text,
    created_at timestamptz DEFAULT now()
);

-- 4. Create resources table
CREATE TABLE IF NOT EXISTS resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    peptide_id uuid REFERENCES peptides(id) ON DELETE SET NULL,
    title text NOT NULL,
    url text NOT NULL,
    type text CHECK (type IN ('video', 'article', 'pdf')),
    description text,
    created_at timestamptz DEFAULT now()
);

-- 5. Enable RLS
ALTER TABLE protocol_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Resources: Public read
DROP POLICY IF EXISTS "Enable read access for all users" ON resources;
CREATE POLICY "Enable read access for all users" ON resources FOR SELECT USING (true);

-- Protocol Feedback: Users can manage their own
DROP POLICY IF EXISTS "Users can insert own feedback" ON protocol_feedback;
CREATE POLICY "Users can insert own feedback" ON protocol_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own feedback" ON protocol_feedback;
CREATE POLICY "Users can view own feedback" ON protocol_feedback FOR SELECT USING (auth.uid() = user_id);

-- Contacts: Users can see their own linkage
DROP POLICY IF EXISTS "Users can view own contact link" ON contacts;
CREATE POLICY "Users can view own contact link" ON contacts FOR SELECT USING (auth.uid() = linked_user_id);
