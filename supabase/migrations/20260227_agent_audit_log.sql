-- Agent Audit Log — tracks every agent interaction for monitoring and debugging
CREATE TABLE IF NOT EXISTS agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,
  message_preview TEXT NOT NULL,     -- first 200 chars of user message
  reply_preview TEXT,                -- first 500 chars of agent reply
  tool_log TEXT,                     -- stderr from Claude CLI (tool usage)
  duration_ms INTEGER,              -- how long the CLI took
  status TEXT DEFAULT 'success',    -- success | error | timeout | rate_limited
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_org ON agent_audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON agent_audit_log(created_at DESC);

-- RLS: Only the service role can insert (agent backend uses service key)
ALTER TABLE agent_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins within the org can read their own audit logs
CREATE POLICY "Org admins can view their audit logs"
ON agent_audit_log FOR SELECT
USING (
  org_id IN (
    SELECT p.org_id FROM profiles p
    WHERE p.user_id = auth.uid() AND p.role IN ('owner', 'admin')
  )
);
