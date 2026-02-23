-- Add org_id to discussion_topics for multi-tenant isolation
-- After applying this migration, update CommunityForum.tsx to filter by org_id

ALTER TABLE discussion_topics ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);

-- Backfill existing topics: set org_id from user's profile
UPDATE discussion_topics dt
SET org_id = p.org_id
FROM profiles p
WHERE p.user_id = dt.user_id
AND dt.org_id IS NULL;

-- Make org_id NOT NULL after backfill (only if all rows have been populated)
-- ALTER TABLE discussion_topics ALTER COLUMN org_id SET NOT NULL;

-- Add index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_discussion_topics_org_id ON discussion_topics (org_id);

-- Update RLS policies to scope by org
DROP POLICY IF EXISTS "Topics viewable by all" ON discussion_topics;
CREATE POLICY "Topics viewable by org members" ON discussion_topics
  FOR SELECT TO authenticated
  USING (org_id = (SELECT org_id FROM profiles WHERE user_id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS "Topics insertable by users" ON discussion_topics;
CREATE POLICY "Topics insertable by org members" ON discussion_topics
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND org_id = (SELECT org_id FROM profiles WHERE user_id = auth.uid() LIMIT 1)
  );
