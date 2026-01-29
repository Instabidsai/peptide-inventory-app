
create or replace function pay_order_with_credit(p_order_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_credit_balance decimal;
  v_order_total decimal;
  v_org_id uuid;
begin
  -- 1. Check User Balance
  select credit_balance, org_id into v_credit_balance, v_org_id
  from public.profiles
  where id = p_user_id
  for update;

  if not found then raise exception 'User profile not found'; end if;
  
  -- 2. Get Order Total
  select total_amount into v_order_total
  from public.sales_orders
  where id = p_order_id;
  
  if not found then raise exception 'Order not found'; end if;

  -- 3. Validate Sufficiency
  if v_credit_balance < v_order_total then 
    raise exception 'Insufficient credit balance (Calculated: %, Needed: %)', v_credit_balance, v_order_total;
  end if;

  -- 4. Deduct Credit
  update public.profiles 
  set credit_balance = credit_balance - v_order_total 
  where id = p_user_id;

  -- 5. Mark Order Paid
  update public.sales_orders
  set 
    status = 'submitted', -- Or fulfilled? Usually just 'submitted' or 'paid' state? Schema says: draft, submitted, fulfilled, cancelled.
    payment_status = 'paid',
    amount_paid = v_order_total,
    payment_method = 'store_credit',
    payment_date = now()
  where id = p_order_id;

  -- 6. Optional: Record "Financial Movement"? 
  -- We don't have a ledger table yet. But we should log it?
  -- For now, implicit is enough.
end;
$$;
