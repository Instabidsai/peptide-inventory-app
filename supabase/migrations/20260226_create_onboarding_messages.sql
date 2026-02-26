-- Onboarding AI Agent conversation history
-- Stores messages between merchants and the AI setup assistant

CREATE TABLE IF NOT EXISTS onboarding_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_onboarding_messages_org ON onboarding_messages(org_id);
CREATE INDEX idx_onboarding_messages_user ON onboarding_messages(user_id);
CREATE INDEX idx_onboarding_messages_created ON onboarding_messages(org_id, created_at);

ALTER TABLE onboarding_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own org messages"
  ON onboarding_messages FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own messages"
  ON onboarding_messages FOR INSERT
  WITH CHECK (user_id = auth.uid());
