-- RPC function to create contacts, bypassing RLS issues
-- SECURITY DEFINER runs as the function owner (bypasses RLS)
-- but we do our own auth checks inside the function
CREATE OR REPLACE FUNCTION public.create_contact_for_org(
    p_name TEXT,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_type TEXT DEFAULT 'customer',
    p_assigned_rep_id UUID DEFAULT NULL,
    p_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id UUID;
    v_final_org_id UUID;
    v_new_id UUID;
BEGIN
    -- Must be authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get caller's org
    SELECT org_id INTO v_caller_org_id
    FROM profiles
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_caller_org_id IS NULL THEN
        RAISE EXCEPTION 'No org found for user';
    END IF;

    -- Use provided org_id if it matches caller's org, otherwise use caller's org
    v_final_org_id := COALESCE(p_org_id, v_caller_org_id);
    IF v_final_org_id != v_caller_org_id THEN
        RAISE EXCEPTION 'Cannot create contact in different org';
    END IF;

    -- Do the insert
    INSERT INTO contacts (name, email, phone, address, type, assigned_rep_id, org_id)
    VALUES (p_name, p_email, p_phone, p_address, p_type, p_assigned_rep_id, v_final_org_id)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('id', v_new_id, 'success', true);
END;
$$;
