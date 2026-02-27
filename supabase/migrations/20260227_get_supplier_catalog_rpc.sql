-- RPC: get_supplier_catalog
-- Returns the supplier org's active peptides for a given org.
-- SECURITY DEFINER bypasses RLS so tenants can read another org's peptides.
-- Only returns data if the org has a supplier_org_id set in tenant_config.
--
-- p_org_id: optional override — used during super_admin impersonation.
--           If null, falls back to auth.uid()'s own org.
--           When provided, caller must be a member of that org OR a super_admin.

drop function if exists public.get_supplier_catalog();

create or replace function public.get_supplier_catalog(p_org_id uuid default null)
returns table (
  id uuid,
  name text,
  description text,
  sku text,
  base_cost numeric,
  retail_price numeric,
  active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_caller_role text;
  v_supplier_org_id uuid;
begin
  if p_org_id is not null then
    -- Verify the caller has access: must belong to that org OR be super_admin
    select p.role into v_caller_role
    from profiles p
    where p.id = auth.uid();

    if v_caller_role is distinct from 'super_admin' then
      -- Non-super_admin: must belong to the requested org
      if not exists (
        select 1 from profiles p where p.id = auth.uid() and p.org_id = p_org_id
      ) then
        return;  -- unauthorized
      end if;
    end if;

    v_org_id := p_org_id;
  else
    -- Default: use the calling user's own org
    select p.org_id into v_org_id
    from profiles p
    where p.id = auth.uid();
  end if;

  if v_org_id is null then
    return;  -- no org = no results
  end if;

  -- Look up the supplier_org_id from tenant_config
  select tc.supplier_org_id into v_supplier_org_id
  from tenant_config tc
  where tc.org_id = v_org_id;

  if v_supplier_org_id is null then
    return;  -- no supplier linked = no results
  end if;

  -- Return the supplier's active peptides
  return query
    select
      pep.id,
      pep.name,
      pep.description,
      pep.sku,
      pep.base_cost,
      pep.retail_price,
      pep.active
    from peptides pep
    where pep.org_id = v_supplier_org_id
      and pep.active = true
    order by pep.name;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.get_supplier_catalog(uuid) to authenticated;
