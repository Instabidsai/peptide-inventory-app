-- Postgres BEFORE triggers to enforce agent org isolation.
-- When the session variable app.agent_org_id is set, writes are locked to that org.
-- Normal frontend operations (no session variable) pass through unaffected.

CREATE OR REPLACE FUNCTION enforce_agent_org_scope()
RETURNS TRIGGER AS $$
DECLARE
  allowed_org UUID;
BEGIN
  allowed_org := nullif(current_setting('app.agent_org_id', true), '')::UUID;

  -- If no agent context set, allow through (normal user flow)
  IF allowed_org IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- For INSERT/UPDATE: check NEW.org_id matches
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.org_id != allowed_org THEN
    RAISE EXCEPTION 'Agent org scope violation: write to org_id=% blocked (session locked to %)',
      NEW.org_id, allowed_org;
  END IF;

  -- For DELETE: check OLD.org_id matches
  IF TG_OP = 'DELETE' AND OLD.org_id != allowed_org THEN
    RAISE EXCEPTION 'Agent org scope violation: delete on org_id=% blocked (session locked to %)',
      OLD.org_id, allowed_org;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Attach to critical org-scoped tables
CREATE TRIGGER trg_agent_scope_peptides
  BEFORE INSERT OR UPDATE OR DELETE ON peptides
  FOR EACH ROW EXECUTE FUNCTION enforce_agent_org_scope();

CREATE TRIGGER trg_agent_scope_tenant_config
  BEFORE INSERT OR UPDATE OR DELETE ON tenant_config
  FOR EACH ROW EXECUTE FUNCTION enforce_agent_org_scope();

CREATE TRIGGER trg_agent_scope_contacts
  BEFORE INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION enforce_agent_org_scope();

CREATE TRIGGER trg_agent_scope_onboarding_messages
  BEFORE INSERT OR UPDATE OR DELETE ON onboarding_messages
  FOR EACH ROW EXECUTE FUNCTION enforce_agent_org_scope();

-- NOTE: feature_flags table does not exist yet.
-- When created, add trigger:
-- CREATE TRIGGER trg_agent_scope_feature_flags
--   BEFORE INSERT OR UPDATE OR DELETE ON feature_flags
--   FOR EACH ROW EXECUTE FUNCTION enforce_agent_org_scope();
