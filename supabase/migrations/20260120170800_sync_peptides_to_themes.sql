-- Ensure all active peptides have a corresponding theme
DO $$
DECLARE
    p RECORD;
BEGIN
    FOR p IN 
        SELECT name FROM peptides WHERE active = true
    LOOP
        INSERT INTO resource_themes (name) 
        VALUES (p.name) 
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;
