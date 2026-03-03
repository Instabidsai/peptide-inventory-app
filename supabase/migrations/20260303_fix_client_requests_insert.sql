-- Fix client_requests INSERT failures:
-- 1. Add 'protocol_change' to request_type enum (form offers it but DB rejects it)
-- 2. Create handle_new_user() trigger to auto-create profiles on signup
--    (client_requests_profile_fk requires user_id in profiles table)

-- ═══ 1. Add protocol_change to request_type enum ═══
ALTER TYPE public.request_type ADD VALUE IF NOT EXISTS 'protocol_change';

-- ═══ 2. Create handle_new_user() function ═══
-- This function fires on auth.users INSERT and creates a profile row.
-- Without this, users who sign up don't have a profile, which breaks
-- client_requests_profile_fk and any PostgREST joins to profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, org_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.raw_user_meta_data ->> 'email'),
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    (NEW.raw_user_meta_data ->> 'org_id')::UUID
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ═══ 3. Create trigger on auth.users ═══
-- Drop first in case a partial version exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ═══ 4. Backfill: create profile rows for any auth.users missing them ═══
-- This fixes existing users who signed up before the trigger existed.
INSERT INTO public.profiles (user_id, email, full_name)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(COALESCE(u.email, ''), '@', 1)
  )
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
