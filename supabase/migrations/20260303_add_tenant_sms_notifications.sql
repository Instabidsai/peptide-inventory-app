-- Add SMS notification columns to tenant_config for per-tenant order alerts.
-- order_sms_phones is a JSONB array of { phone, label, enabled } objects.
-- order_sms_enabled is the global toggle for the feature.

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS order_sms_enabled BOOLEAN DEFAULT false;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS order_sms_phones JSONB DEFAULT '[]'::jsonb;

-- Enable pg_net extension (usually already enabled on Supabase hosted)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Locked-down table for internal secrets (trigger auth).
-- RLS blocks all access from anon/authenticated; only SECURITY DEFINER functions can read.
CREATE TABLE IF NOT EXISTS internal_secrets (
    key text PRIMARY KEY,
    value text NOT NULL
);
ALTER TABLE internal_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_access" ON internal_secrets;
CREATE POLICY "no_access" ON internal_secrets FOR ALL USING (false);
REVOKE ALL ON internal_secrets FROM anon, authenticated;

-- NOTE: The service_role_key must be inserted into internal_secrets separately
-- (not in this migration file for security). Run:
--   INSERT INTO internal_secrets (key, value) VALUES ('service_role_key', '<YOUR_KEY>');

-- Trigger function: fires on every sales_orders INSERT, calls notify-order edge function.
-- Reads service role key from internal_secrets table.
-- This means ANY order — WooCommerce, Shopify, manual, store — triggers SMS automatically.
CREATE OR REPLACE FUNCTION public.notify_new_order_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    _service_key text;
BEGIN
    -- Skip draft orders (not yet submitted to fulfillment)
    IF NEW.status = 'draft' THEN
        RETURN NEW;
    END IF;

    -- Read service role key from locked-down secrets table
    SELECT value INTO _service_key
    FROM internal_secrets
    WHERE key = 'service_role_key'
    LIMIT 1;

    IF _service_key IS NULL THEN
        RAISE WARNING '[notify_new_order_sms] No service_role_key found in internal_secrets — SMS skipped';
        RETURN NEW;
    END IF;

    -- Fire-and-forget HTTP POST to notify-order edge function via pg_net
    PERFORM net.http_post(
        url    := 'https://mckkegmkpqdicudnfhor.supabase.co/functions/v1/notify-order',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || _service_key
        ),
        body   := jsonb_build_object(
            'org_id', NEW.org_id,
            'order_id', NEW.id,
            'total_amount', NEW.total_amount,
            'source', COALESCE(NEW.order_source, 'manual'),
            'payment_method', COALESCE(NEW.payment_method, '')
        )
    );

    RETURN NEW;
END;
$fn$;

-- Attach trigger to sales_orders — fires on every INSERT
DROP TRIGGER IF EXISTS trg_notify_new_order_sms ON public.sales_orders;
CREATE TRIGGER trg_notify_new_order_sms
    AFTER INSERT ON public.sales_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_new_order_sms();
