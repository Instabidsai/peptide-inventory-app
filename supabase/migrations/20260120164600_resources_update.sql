-- Add content and link_button_text to resources table
ALTER TABLE resources 
ADD COLUMN IF NOT EXISTS content text, 
ADD COLUMN IF NOT EXISTS link_button_text text DEFAULT 'Open';

-- Create resource_comments table
CREATE TABLE IF NOT EXISTS resource_comments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on resource_comments
ALTER TABLE resource_comments ENABLE ROW LEVEL SECURITY;

-- Policies for resource_comments
-- View comments: If you can view the resource, you can view the comments. 
-- For now, allow authenticated users to view all comments, or refine based on resource visibility.
CREATE POLICY "Comments are viewable by authenticated users" 
ON resource_comments FOR SELECT 
TO authenticated 
USING (true);

-- Insert comments: Authenticated users can comment.
CREATE POLICY "Users can create comments" 
ON resource_comments FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Delete comments: Users can delete their own comments.
CREATE POLICY "Users can delete own comments" 
ON resource_comments FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- Update comments: Users can update their own comments.
CREATE POLICY "Users can update own comments" 
ON resource_comments FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);
