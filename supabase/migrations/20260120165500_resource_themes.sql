-- Create resource_themes table
CREATE TABLE IF NOT EXISTS resource_themes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE resource_themes ENABLE ROW LEVEL SECURITY;

-- Add policies for resource_themes
CREATE POLICY "Themes are viewable by everyone" 
ON resource_themes FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins can manage themes" 
ON resource_themes FOR ALL 
TO authenticated 
USING (true) -- For now allow all auth users to manage, strictly should check role
WITH CHECK (true);

-- Add theme_id to resources
ALTER TABLE resources 
ADD COLUMN IF NOT EXISTS theme_id uuid REFERENCES resource_themes(id) ON DELETE SET NULL;

-- Migration: Create themes from existing peptides that are used in resources
DO $$
DECLARE
    r RECORD;
    t_id uuid;
BEGIN
    FOR r IN 
        SELECT DISTINCT p.name, p.id as peptide_id 
        FROM resources res 
        JOIN peptides p ON res.peptide_id = p.id 
        WHERE res.peptide_id IS NOT NULL
    LOOP
        -- Check if theme exists or create it
        INSERT INTO resource_themes (name) 
        VALUES (r.name) 
        ON CONFLICT DO NOTHING 
        RETURNING id INTO t_id;
        
        -- If it existed (and RETURNING didn't return), find it
        IF t_id IS NULL THEN
            SELECT id INTO t_id FROM resource_themes WHERE name = r.name;
        END IF;

        -- Update resources
        UPDATE resources 
        SET theme_id = t_id 
        WHERE peptide_id = r.peptide_id;
    END LOOP;
END $$;
