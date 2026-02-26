-- RPC to promote a contact to partner WITHOUT needing edge functions.
-- Generates a claim token + invite link, updates the contact, and returns the link.
-- The invitee clicks the link → /join page → creates their auth account.
-- SECURITY DEFINER runs as function owner (bypasses RLS).
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

    -- Fetch the contact (must be in caller's org)
    SELECT id, name, email, linked_user_id, org_id
    INTO v_contact
    FROM contacts
    WHERE id = p_contact_id AND org_id = v_caller_org_id;

    IF v_contact IS NULL THEN
        RAISE EXCEPTION 'Contact not found in your org';
    END IF;

    -- If contact already has a linked auth user, promote them directly
    IF v_contact.linked_user_id IS NOT NULL THEN
        -- Update their profile to sales_rep
        UPDATE profiles
        SET role = 'sales_rep',
            commission_rate = COALESCE(commission_rate, 0),
            price_multiplier = COALESCE(price_multiplier, 1.0),
            parent_rep_id = p_parent_rep_id
        WHERE user_id = v_contact.linked_user_id;

        -- Sync user_roles
        INSERT INTO user_roles (user_id, org_id, role)
        VALUES (v_contact.linked_user_id, v_caller_org_id, 'sales_rep')
        ON CONFLICT (user_id, org_id)
        DO UPDATE SET role = 'sales_rep';

        -- Update contact type
        UPDATE contacts SET type = 'partner'::contact_type WHERE id = p_contact_id;

        RETURN jsonb_build_object(
            'success', true,
            'method', 'direct_promote',
            'message', v_contact.name || ' promoted to partner'
        );
    END IF;

    -- Contact has no auth account — generate claim token + invite link
    v_claim_token := gen_random_uuid();
    v_expires_at := now() + interval '7 days';
    v_invite_link := p_redirect_origin || '/join?token=' || v_claim_token::text;

    -- Update contact with claim token and partner type
    UPDATE contacts
    SET claim_token = v_claim_token::text,
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
