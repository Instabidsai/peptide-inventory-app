-- Fix: admin-ai-chat edge function was deployed WITHOUT org_id in inserts,
-- but the prior migration (20260227173633) made org_id NOT NULL.
-- This caused all message inserts to silently fail, breaking the AI assistant.
--
-- Solution: Make org_id nullable + auto-fill trigger from profiles.
-- The trigger ensures org_id is always populated even if the edge function
-- doesn't explicitly provide it.

-- ============================================
-- FIX 1: admin_chat_messages
-- ============================================
ALTER TABLE admin_chat_messages ALTER COLUMN org_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION admin_chat_messages_set_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_chat_set_org_id ON admin_chat_messages;
CREATE TRIGGER trg_admin_chat_set_org_id
  BEFORE INSERT ON admin_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION admin_chat_messages_set_org_id();

-- ============================================
-- FIX 2: partner_chat_messages (same vulnerability)
-- ============================================
ALTER TABLE partner_chat_messages ALTER COLUMN org_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION partner_chat_messages_set_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_partner_chat_set_org_id ON partner_chat_messages;
CREATE TRIGGER trg_partner_chat_set_org_id
  BEFORE INSERT ON partner_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION partner_chat_messages_set_org_id();
