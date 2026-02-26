-- Fix: promote_contact_to_partner should create a profile row immediately
-- so the partner shows up in the Reps page without needing to accept an invite.
-- For contacts without auth accounts, we create a "placeholder" profile.
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
    v_profile_id UUID;
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

    -- Case 1: Contact has a linked auth user — update their existing profile
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

    -- Case 2: No auth account — create a placeholder profile so they appear immediately
    -- Use a deterministic "fake" user_id derived from the contact id (no actual auth user)
    -- Check if a profile already exists for this contact
    SELECT id INTO v_profile_id
    FROM profiles
    WHERE full_name = v_contact.name
      AND org_id = v_caller_org_id
      AND role = 'sales_rep'
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        INSERT INTO profiles (user_id, full_name, email, role, commission_rate, price_multiplier, parent_rep_id, org_id)
        VALUES (
            p_contact_id,  -- use contact UUID as the user_id placeholder
            v_contact.name,
            v_contact.email,
            'sales_rep',
            0,
            1.0,
            p_parent_rep_id,
            v_caller_org_id
        )
        RETURNING id INTO v_profile_id;
    END IF;

    -- Generate invite link for when they eventually create an account
    v_claim_token := gen_random_uuid();
    v_expires_at := now() + interval '7 days';
    v_invite_link := p_redirect_origin || '/join?token=' || v_claim_token::text;

    -- Update contact
    UPDATE contacts
    SET claim_token = v_claim_token,
        claim_token_expires_at = v_expires_at,
        invite_link = v_invite_link,
        type = 'partner'::contact_type,
        assigned_rep_id = COALESCE(p_parent_rep_id, assigned_rep_id)
    WHERE id = p_contact_id AND org_id = v_caller_org_id;

    RETURN jsonb_build_object(
        'success', true,
        'method', 'instant_partner',
        'profile_id', v_profile_id,
        'action_link', v_invite_link,
        'message', v_contact.name || ' is now a partner'
    );
END;
$$;
