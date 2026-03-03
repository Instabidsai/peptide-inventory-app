-- Fix ALL RPC functions that derive org_id from auth.uid() → profiles lookup.
-- When super_admin impersonates a tenant, auth.uid() returns the vendor's user,
-- whose profile has the vendor's org_id — not the impersonated tenant's.
-- Added p_target_org_id to each: if provided AND caller is super_admin, use it.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. promote_contact_to_partner (already fixed in prior migration, but
--    re-applying here as the canonical version for clarity)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.promote_contact_to_partner(
    p_contact_id UUID,
    p_parent_rep_id UUID DEFAULT NULL,
    p_redirect_origin TEXT DEFAULT '',
    p_target_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id UUID;
    v_effective_org_id UUID;
    v_contact RECORD;
    v_profile_id UUID;
    v_claim_token UUID;
    v_expires_at TIMESTAMPTZ;
    v_invite_link TEXT;
    v_is_super_admin BOOLEAN := false;
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

    SELECT EXISTS(
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    ) INTO v_is_super_admin;

    IF p_target_org_id IS NOT NULL AND v_is_super_admin THEN
        v_effective_org_id := p_target_org_id;
    ELSE
        v_effective_org_id := v_caller_org_id;
    END IF;

    SELECT id, name, email, linked_user_id, org_id
    INTO v_contact
    FROM contacts
    WHERE id = p_contact_id AND org_id = v_effective_org_id;

    IF v_contact IS NULL THEN
        RAISE EXCEPTION 'Contact not found in organization';
    END IF;

    -- Case 1: Contact has a linked auth user — update their existing profile
    IF v_contact.linked_user_id IS NOT NULL THEN
        UPDATE profiles
        SET role = 'sales_rep',
            commission_rate = COALESCE(commission_rate, 0),
            price_multiplier = COALESCE(price_multiplier, 1.0),
            parent_rep_id = p_parent_rep_id
        WHERE user_id = v_contact.linked_user_id;

        INSERT INTO user_roles (user_id, org_id, role)
        VALUES (v_contact.linked_user_id, v_effective_org_id, 'sales_rep')
        ON CONFLICT (user_id, org_id)
        DO UPDATE SET role = 'sales_rep';

        UPDATE contacts SET type = 'partner'::contact_type WHERE id = p_contact_id;

        RETURN jsonb_build_object(
            'success', true,
            'method', 'direct_promote',
            'message', v_contact.name || ' promoted to partner'
        );
    END IF;

    -- Case 2: No auth account — create a placeholder profile
    SELECT id INTO v_profile_id
    FROM profiles
    WHERE user_id = p_contact_id
      AND org_id = v_effective_org_id
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        INSERT INTO profiles (user_id, full_name, email, role, commission_rate, price_multiplier, parent_rep_id, org_id)
        VALUES (
            p_contact_id, v_contact.name, v_contact.email, 'sales_rep',
            0, 1.0, p_parent_rep_id, v_effective_org_id
        )
        ON CONFLICT (user_id) DO UPDATE
        SET role = 'sales_rep',
            parent_rep_id = EXCLUDED.parent_rep_id,
            org_id = EXCLUDED.org_id
        RETURNING id INTO v_profile_id;
    ELSE
        UPDATE profiles
        SET role = 'sales_rep',
            parent_rep_id = COALESCE(p_parent_rep_id, parent_rep_id)
        WHERE id = v_profile_id;
    END IF;

    v_claim_token := gen_random_uuid();
    v_expires_at := now() + interval '7 days';
    v_invite_link := p_redirect_origin || '/#/join?token=' || v_claim_token::text;

    UPDATE contacts
    SET claim_token = v_claim_token,
        claim_token_expires_at = v_expires_at,
        invite_link = v_invite_link,
        type = 'partner'::contact_type,
        assigned_rep_id = COALESCE(p_parent_rep_id, assigned_rep_id)
    WHERE id = p_contact_id AND org_id = v_effective_org_id;

    RETURN jsonb_build_object(
        'success', true,
        'method', 'instant_partner',
        'profile_id', v_profile_id,
        'action_link', v_invite_link,
        'message', v_contact.name || ' is now a partner'
    );
END;
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. invite_new_rep
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.invite_new_rep(
    p_email TEXT,
    p_full_name TEXT DEFAULT '',
    p_parent_rep_id UUID DEFAULT NULL,
    p_redirect_origin TEXT DEFAULT '',
    p_target_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id UUID;
    v_effective_org_id UUID;
    v_existing_contact RECORD;
    v_contact_id UUID;
    v_claim_token UUID;
    v_expires_at TIMESTAMPTZ;
    v_invite_link TEXT;
    v_is_super_admin BOOLEAN := false;
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

    SELECT EXISTS(
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    ) INTO v_is_super_admin;

    IF p_target_org_id IS NOT NULL AND v_is_super_admin THEN
        v_effective_org_id := p_target_org_id;
    ELSE
        v_effective_org_id := v_caller_org_id;
    END IF;

    -- Check if a contact with this email already exists in the target org
    SELECT id, name, email, linked_user_id, type
    INTO v_existing_contact
    FROM contacts
    WHERE email = p_email AND org_id = v_effective_org_id
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
            v_effective_org_id,
            auth.uid()
        )
        RETURNING id INTO v_contact_id;
    END IF;

    v_claim_token := gen_random_uuid();
    v_expires_at := now() + interval '7 days';
    v_invite_link := p_redirect_origin || '/#/join?token=' || v_claim_token::text;

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


-- ════════════════════════════════════════════════════════════════════════════
-- 3. generate_invite_link
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generate_invite_link(
    p_contact_id UUID,
    p_tier TEXT DEFAULT 'family',
    p_redirect_origin TEXT DEFAULT '',
    p_target_org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_org_id UUID;
    v_effective_org_id UUID;
    v_contact RECORD;
    v_claim_token UUID;
    v_expires_at TIMESTAMPTZ;
    v_invite_link TEXT;
    v_is_super_admin BOOLEAN := false;
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

    SELECT EXISTS(
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
    ) INTO v_is_super_admin;

    IF p_target_org_id IS NOT NULL AND v_is_super_admin THEN
        v_effective_org_id := p_target_org_id;
    ELSE
        v_effective_org_id := v_caller_org_id;
    END IF;

    SELECT id, name, email, linked_user_id, org_id
    INTO v_contact
    FROM contacts
    WHERE id = p_contact_id AND org_id = v_effective_org_id;

    IF v_contact IS NULL THEN
        RAISE EXCEPTION 'Contact not found in organization';
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
    v_invite_link := p_redirect_origin || '/#/join?token=' || v_claim_token::text;

    UPDATE contacts
    SET claim_token = v_claim_token::text,
        claim_token_expires_at = v_expires_at,
        invite_link = v_invite_link,
        tier = p_tier
    WHERE id = p_contact_id AND org_id = v_effective_org_id;

    RETURN jsonb_build_object(
        'success', true,
        'method', 'invite_link',
        'action_link', v_invite_link,
        'message', 'Invite link generated for ' || v_contact.name
    );
END;
$$;
