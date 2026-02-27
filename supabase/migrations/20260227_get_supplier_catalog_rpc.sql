-- RPC: get_supplier_catalog
-- Returns the supplier org's active peptides for the calling user's org.
-- SECURITY DEFINER bypasses RLS so tenants can read another org's peptides.
-- Only returns data if the tenant has a supplier_org_id set in tenant_config.

create or replace function public.get_supplier_catalog()
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
  v_supplier_org_id uuid;
begin
  -- Get the calling user's org_id from their profile
  select p.org_id into v_org_id
  from profiles p
  where p.id = auth.uid();

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
grant execute on function public.get_supplier_catalog() to authenticated;
