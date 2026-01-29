
-- Function to convert a commission to store credit
create or replace function convert_commission_to_credit(commission_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_amount decimal;
  v_partner_id uuid;
  v_status text;
begin
  -- 1. Get commission details and lock the row
  select amount, partner_id, status
  into v_amount, v_partner_id, v_status
  from public.commissions
  where id = commission_id
  for update;

  if not found then
    raise exception 'Commission not found';
  end if;

  if v_status != 'pending' then
    raise exception 'Commission is not pending';
  end if;

  -- 2. Update commission status to 'paid' (or we could add 'credited')
  update public.commissions
  set status = 'paid'
  where id = commission_id;

  -- 3. Update profile credit balance
  update public.profiles
  set credit_balance = coalesce(credit_balance, 0) + v_amount
  where id = v_partner_id;

  -- Optional: Record log? For now, we trust the transaction.

end;
$$;
