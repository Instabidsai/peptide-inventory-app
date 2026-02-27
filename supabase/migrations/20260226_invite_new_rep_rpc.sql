-- RPC to invite a new sales rep by email WITHOUT edge functions.
-- Creates a contact (if needed), generates claim token + invite link.
-- SECURITY DEFINER runs as function owner (bypasses RLS).
CREATE OR REPLACE FUNCTION public.invite_new_rep(
    p_email TEXT,
    p_full_name TEXT DEFAULT '',
    p_parent_rep_id UUID DEFAULT NULL,
    p_redirect_origin TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id UUID;
    v_existing_contact RECORD;
    v_contact_id UUID;
    v_claim_token UUID;
    v_expires_at TIMESTAMPTZ;
    v_invite_link TEXT;
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

    -- Check if a contact with this email already exists in the org
    SELECT id, name, email, linked_user_id, type
    INTO v_existing_contact
    FROM contacts
    WHERE email = p_email AND org_id = v_caller_org_id
    LIMIT 1;

    IF v_existing_contact IS NOT NULL THEN
        -- Contact exists — if already a partner with linked user, nothing to do
        IF v_existing_contact.linked_user_id IS NOT NULL AND v_existing_contact.type = 'partner' THEN
            RETURN jsonb_build_object(
                'success', true,
                'method', 'already_partner',
                'message', COALESCE(v_existing_contact.name, p_email) || ' is already a partner'
            );
        END IF;

        -- Reuse existing contact
        v_contact_id := v_existing_contact.id;
    ELSE
        -- Create new contact
        INSERT INTO contacts (name, email, type, org_id, created_by)
        VALUES (
            COALESCE(NULLIF(p_full_name, ''), p_email),
            p_email,
            'partner'::contact_type,
            v_caller_org_id,
            auth.uid()
        )
        RETURNING id INTO v_contact_id;
    END IF;

    -- Generate claim token + invite link
    v_claim_token := gen_random_uuid();
    v_expires_at := now() + interval '7 days';
    v_invite_link := p_redirect_origin || '/#/join?token=' || v_claim_token::text;

    -- Update contact with claim token, type, and parent rep
    UPDATE contacts
    SET claim_token = v_claim_token::text,
        claim_token_expires_at = v_expires_at,
        invite_link = v_invite_link,
        type = 'partner'::contact_type,
        assigned_rep_id = p_parent_rep_id
    WHERE id = v_contact_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_user', (v_existing_contact IS NULL),
        'contact_id', v_contact_id,
        'action_link', v_invite_link,
        'message', 'Invite link generated for ' || COALESCE(NULLIF(p_full_name, ''), p_email)
    );
END;
$$;
