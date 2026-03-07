-- Fix NO ACTION foreign keys that could block deletes across all orgs
-- These should be SET NULL (reference columns are nullable) or CASCADE

-- contacts.assigned_rep_id: if rep profile deleted, unassign
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_assigned_rep_id_fkey;
ALTER TABLE contacts ADD CONSTRAINT contacts_assigned_rep_id_fkey
  FOREIGN KEY (assigned_rep_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- sender_aliases.created_by: if profile deleted, don't block
ALTER TABLE sender_aliases DROP CONSTRAINT IF EXISTS sender_aliases_created_by_fkey;
ALTER TABLE sender_aliases ADD CONSTRAINT sender_aliases_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- order_payments.recorded_by: if profile deleted, don't block
ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_recorded_by_fkey;
ALTER TABLE order_payments ADD CONSTRAINT order_payments_recorded_by_fkey
  FOREIGN KEY (recorded_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- profiles self-refs: if parent partner/rep deleted, null the ref
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_parent_partner_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_parent_partner_id_fkey
  FOREIGN KEY (parent_partner_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_parent_rep_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_parent_rep_id_fkey
  FOREIGN KEY (parent_rep_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- sales_orders.rep_id: if rep deleted, keep order but unassign
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_rep_id_fkey;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_rep_id_fkey
  FOREIGN KEY (rep_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- payment_email_queue.ai_suggested_contact_id: if contact deleted, null the suggestion
ALTER TABLE payment_email_queue DROP CONSTRAINT IF EXISTS payment_email_queue_ai_suggested_contact_id_fkey;
ALTER TABLE payment_email_queue ADD CONSTRAINT payment_email_queue_ai_suggested_contact_id_fkey
  FOREIGN KEY (ai_suggested_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

-- client_inventory.movement_id: if movement deleted, cascade
ALTER TABLE client_inventory DROP CONSTRAINT IF EXISTS client_inventory_movement_id_fkey;
ALTER TABLE client_inventory ADD CONSTRAINT client_inventory_movement_id_fkey
  FOREIGN KEY (movement_id) REFERENCES movements(id) ON DELETE CASCADE;
