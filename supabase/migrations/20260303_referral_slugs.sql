-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260303_referral_slugs.sql
-- Date: 2026-03-03
-- Purpose: Add short vanity referral URLs (e.g. /r/diego-feroni)
--   1. Add referral_slug column to profiles
--   2. Slug generator function with collision handling
--   3. Auto-trigger on INSERT/UPDATE
--   4. Backfill existing profiles
--   5. Resolver RPC for the Vercel API route
--   6. Update get_partner_downline RPC to return referral_slug
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_slug
    ON profiles(referral_slug) WHERE referral_slug IS NOT NULL;

-- 2. Slug generator function
CREATE OR REPLACE FUNCTION generate_referral_slug(p_full_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    base_slug TEXT;
    candidate TEXT;
    counter   INT := 1;
BEGIN
    -- Return NULL if no name provided
    IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
        RETURN NULL;
    END IF;

    -- Lowercase, replace spaces/underscores with hyphens
    base_slug := lower(trim(p_full_name));
    base_slug := regexp_replace(base_slug, '[\s_]+', '-', 'g');
    -- Strip everything except letters, numbers, hyphens
    base_slug := regexp_replace(base_slug, '[^a-z0-9\-]', '', 'g');
    -- Collapse multiple hyphens
    base_slug := regexp_replace(base_slug, '-+', '-', 'g');
    -- Trim leading/trailing hyphens
    base_slug := trim(BOTH '-' FROM base_slug);
    -- Truncate to 50 chars
    base_slug := left(base_slug, 50);

    IF base_slug = '' THEN
        RETURN NULL;
    END IF;

    -- Check uniqueness, append -2, -3 etc on collision
    candidate := base_slug;
    WHILE EXISTS (SELECT 1 FROM profiles WHERE referral_slug = candidate) LOOP
        counter := counter + 1;
        candidate := left(base_slug, 46) || '-' || counter::text;
    END LOOP;

    RETURN candidate;
END;
$$;

-- 3. Auto-trigger: generate slug on INSERT when full_name is set
CREATE OR REPLACE FUNCTION trg_generate_referral_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only generate if slug is not already set and name is provided
    IF NEW.referral_slug IS NULL AND NEW.full_name IS NOT NULL AND trim(NEW.full_name) != '' THEN
        NEW.referral_slug := generate_referral_slug(NEW.full_name);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_referral_slug ON profiles;
CREATE TRIGGER trg_profiles_referral_slug
    BEFORE INSERT ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION trg_generate_referral_slug();

-- 4. Backfill existing profiles
UPDATE profiles
SET referral_slug = generate_referral_slug(full_name)
WHERE referral_slug IS NULL
  AND full_name IS NOT NULL
  AND trim(full_name) != '';

-- 5. Resolver RPC — called by the Vercel /api/r/[slug] route
CREATE OR REPLACE FUNCTION resolve_referral_slug(p_slug TEXT)
RETURNS TABLE(profile_id UUID, org_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id AS profile_id, org_id
    FROM profiles
    WHERE referral_slug = lower(trim(p_slug))
    LIMIT 1;
$$;

-- 6. Update get_partner_downline to include referral_slug
-- Must DROP first because return type is changing (adding referral_slug column)
DROP FUNCTION IF EXISTS public.get_partner_downline(uuid);
CREATE OR REPLACE FUNCTION public.get_partner_downline(root_id uuid)
 RETURNS TABLE(id uuid, full_name text, email text, partner_tier text, commission_rate numeric, role text, total_sales numeric, depth integer, path uuid[], parent_rep_id uuid, referral_slug text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    resolved_profile_id uuid;
    v_org_id uuid;
BEGIN
    -- Resolve auth user_id to profiles.id
    SELECT p.id, p.org_id INTO resolved_profile_id, v_org_id
    FROM profiles p
    WHERE p.user_id = root_id;

    -- Fallback: try using root_id directly as profile_id
    IF resolved_profile_id IS NULL THEN
        SELECT p.org_id INTO v_org_id
        FROM profiles p
        WHERE p.id = root_id;
        resolved_profile_id := root_id;
    END IF;

    IF v_org_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH RECURSIVE downline AS (
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            p.commission_rate,
            p.role,
            p.parent_rep_id,
            p.referral_slug,
            1 as depth,
            ARRAY[p.id] as path
        FROM profiles p
        WHERE (p.parent_partner_id = resolved_profile_id
               OR p.parent_rep_id = resolved_profile_id)
          AND p.org_id = v_org_id

        UNION ALL

        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            p.commission_rate,
            p.role,
            p.parent_rep_id,
            p.referral_slug,
            d.depth + 1,
            d.path || p.id
        FROM profiles p
        JOIN downline d ON (p.parent_partner_id = d.id OR p.parent_rep_id = d.id)
        WHERE d.depth < 5
          AND NOT (p.id = ANY(d.path))
          AND p.org_id = v_org_id
    ),
    partner_sales AS (
        SELECT
            so.rep_id,
            COALESCE(SUM(so.total_amount), 0) as vol
        FROM sales_orders so
        WHERE so.rep_id IN (SELECT dl.id FROM downline dl)
          AND so.status != 'cancelled'
          AND so.org_id = v_org_id
        GROUP BY so.rep_id
    )
    SELECT
        d.id,
        d.full_name,
        d.email,
        d.partner_tier,
        d.commission_rate,
        d.role,
        COALESCE(ps.vol, 0.00)::numeric as total_sales,
        d.depth,
        d.path,
        d.parent_rep_id,
        d.referral_slug
    FROM downline d
    LEFT JOIN partner_sales ps ON ps.rep_id = d.id;
END;
$function$;
