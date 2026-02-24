-- Lead submissions from landing page "Apply to Join" form
CREATE TABLE IF NOT EXISTS lead_submissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text,
    email text NOT NULL,
    business_status text,
    expected_volume text,
    source text DEFAULT 'landing_page',
    created_at timestamptz DEFAULT now()
);

ALTER TABLE lead_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated landing page visitors) can submit
CREATE POLICY "Anyone can submit a lead"
    ON lead_submissions FOR INSERT
    WITH CHECK (true);

-- Only admins/super_admins can read submissions
CREATE POLICY "Admins can read leads"
    ON lead_submissions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
              AND role IN ('admin', 'super_admin')
        )
    );
