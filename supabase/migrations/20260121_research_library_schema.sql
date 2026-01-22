-- Research Library Schema Updates (Extended)
-- Adds view tracking, featured content, thumbnails, discussion system

-- 1. Add new columns to resources table
ALTER TABLE resources 
ADD COLUMN IF NOT EXISTS thumbnail_url text,
ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- 2. Add new columns to resource_themes table
ALTER TABLE resource_themes 
ADD COLUMN IF NOT EXISTS icon text DEFAULT 'beaker',
ADD COLUMN IF NOT EXISTS color text DEFAULT '#10b981';

-- 3. Create resource_views table for tracking
CREATE TABLE IF NOT EXISTS resource_views (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    viewed_at timestamp with time zone DEFAULT now()
);

ALTER TABLE resource_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Views insertable by authenticated" ON resource_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Views viewable by authenticated" ON resource_views FOR SELECT TO authenticated USING (true);

-- 4. Create discussion_topics table
CREATE TABLE IF NOT EXISTS discussion_topics (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    content text,
    theme_id uuid REFERENCES resource_themes(id) ON DELETE SET NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    is_pinned boolean DEFAULT false,
    message_count integer DEFAULT 0,
    last_activity_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE discussion_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Topics viewable by all" ON discussion_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Topics insertable by users" ON discussion_topics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Topics updatable by owner" ON discussion_topics FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Topics deletable by owner" ON discussion_topics FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5. Create discussion_messages table
CREATE TABLE IF NOT EXISTS discussion_messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    topic_id uuid NOT NULL REFERENCES discussion_topics(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    content text NOT NULL,
    parent_id uuid REFERENCES discussion_messages(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE discussion_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages viewable by all" ON discussion_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Messages insertable by users" ON discussion_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Messages updatable by owner" ON discussion_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Messages deletable by owner" ON discussion_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_resources_featured ON resources(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_resources_view_count ON resources(view_count DESC);
CREATE INDEX IF NOT EXISTS idx_resource_views_resource ON resource_views(resource_id);
CREATE INDEX IF NOT EXISTS idx_discussion_topics_theme ON discussion_topics(theme_id);
CREATE INDEX IF NOT EXISTS idx_discussion_topics_activity ON discussion_topics(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussion_messages_topic ON discussion_messages(topic_id);

-- 7. Function to update topic message count and last activity
CREATE OR REPLACE FUNCTION update_topic_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE discussion_topics
    SET 
        message_count = (SELECT COUNT(*) FROM discussion_messages WHERE topic_id = NEW.topic_id),
        last_activity_at = NOW()
    WHERE id = NEW.topic_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Trigger for message count updates
DROP TRIGGER IF EXISTS trigger_update_topic_stats ON discussion_messages;
CREATE TRIGGER trigger_update_topic_stats
AFTER INSERT OR DELETE ON discussion_messages
FOR EACH ROW EXECUTE FUNCTION update_topic_stats();
