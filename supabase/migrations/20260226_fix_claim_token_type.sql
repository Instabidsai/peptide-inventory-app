-- Fix: claim_token column is UUID, not text. Remove ::text casts.
-- Also fixes invite_link to build properly as text then store.

-- 1. Fix promote_contact_to_partner
CREATE OR REPLACE FUNCTION public.promote_contact_to_partner(
    p_contact_id UUID,
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
    v_contact RECORD;
    v_claim_token UUID;
    v_expires_at TIMESTAMPTZ;
    v_invite_link TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT org_id INTO v_caller_org_id
    FROM profiles
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_caller_org_id IS NULL THEN
        RAISE EXCEPTION 'No org found for user';
    END IF;

    SELECT id, name, email, linked_user_id, org_id
    INTO v_contact
    FROM contacts
    WHERE id = p_contact_id AND org_id = v_caller_org_id;

    IF v_contact IS NULL THEN
        RAISE EXCEPTION 'Contact not found in your org';
    END IF;

    IF v_contact.linked_user_id IS NOT NULL THEN
        UPDATE profiles
        SET role = 'sales_rep',
            commission_rate = COALESCE(commission_rate, 0),
            price_multiplier = COALESCE(price_multiplier, 1.0),
            parent_rep_id = p_parent_rep_id
        WHERE user_id = v_contact.linked_user_id;

        INSERT INTO user_roles (user_id, org_id, role)
        VALUES (v_contact.linked_user_id, v_caller_org_id, 'sales_rep')
        ON CONFLICT (user_id, org_id)
        DO UPDATE SET role = 'sales_rep';

        UPDATE contacts SET type = 'partner'::contact_type WHERE id = p_contact_id;

        RETURN jsonb_build_object(
            'success', true,
            'method', 'direct_promote',
            'message', v_contact.name || ' promoted to partner'
        );
    END IF;

    v_claim_token := gen_random_uuid();
    v_expires_at := now() + interval '7 days';
    v_invite_link := p_redirect_origin || '/join?token=' || v_claim_token::text;

    UPDATE contacts
    SET claim_token = v_claim_token,
        claim_token_expires_at = v_expires_at,
        invite_link = v_invite_link,
        type = 'partner'::contact_type
    WHERE id = p_contact_id AND org_id = v_caller_org_id;

    RETURN jsonb_build_object(
        'success', true,
        'method', 'invite_link',
        'action_link', v_invite_link,
        'message', 'Invite link generated for ' || v_contact.name
    );
END;
$$;

-- 2. Fix generate_invite_link
CREATE OR REPLACE FUNCTION public.generate_invite_link(
    p_contact_id UUID,
    p_tier TEXT DEFAULT 'family',
    p_redirect_origin TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id UUID;
    v_contact RECORD;
    v_claim_token UUID;
    v_expires_at TIMESTAMPTZ;
    v_invite_link TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT org_id INTO v_caller_org_id
    FROM profiles
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_caller_org_id IS NULL THEN
        RAISE EXCEPTION 'No org found for user';
    END IF;

    SELECT id, name, email, linked_user_id, org_id
    INTO v_contact
    FROM contacts
    WHERE id = p_contact_id AND org_id = v_caller_org_id;

    IF v_contact IS NULL THEN
        RAISE EXCEPTION 'Contact not found in your org';
    END IF;

    IF v_contact.linked_user_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'method', 'already_linked',
            'message', v_contact.name || ' already has portal access'
        );
    END IF;

    v_claim_token := gen_random_uuid();
    v_expires_at := now() + interval '7 days';
    v_invite_link := p_redirect_origin || '/join?token=' || v_claim_token::text;

    UPDATE contacts
    SET claim_token = v_claim_token,
        claim_token_expires_at = v_expires_at,
        invite_link = v_invite_link,
        tier = p_tier
    WHERE id = p_contact_id AND org_id = v_caller_org_id;

    RETURN jsonb_build_object(
        'success', true,
        'method', 'invite_link',
        'action_link', v_invite_link,
        'message', 'Invite link generated for ' || v_contact.name
    );
END;
$$;

-- 3. Fix invite_new_rep
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT org_id INTO v_caller_org_id
    FROM profiles
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_caller_org_id IS NULL THEN
        RAISE EXCEPTION 'No org found for user';
    END IF;

    SELECT id, name, email, linked_user_id, type
    INTO v_existing_contact
    FROM contacts
    WHERE email = p_email AND org_id = v_caller_org_id
    LIMIT 1;

    IF v_existing_contact IS NOT NULL THEN
        IF v_existing_contact.linked_user_id IS NOT NULL AND v_existing_contact.type = 'partner' THEN
            RETURN jsonb_build_object(
                'success', true,
                'method', 'already_partner',
                'message', COALESCE(v_existing_contact.name, p_email) || ' is already a partner'
            );
        END IF;
        v_contact_id := v_existing_contact.id;
    ELSE
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

    v_claim_token := gen_random_uuid();
    v_expires_at := now() + interval '7 days';
    v_invite_link := p_redirect_origin || '/join?token=' || v_claim_token::text;

    UPDATE contacts
    SET claim_token = v_claim_token,
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
