-- Add quantity tracking and protocol linking to client_inventory
-- This enables tracking bottle usage and linking bottles to specific protocol items

-- Add current_quantity_mg to track usage
ALTER TABLE public.client_inventory
ADD COLUMN IF NOT EXISTS current_quantity_mg DECIMAL(10, 2);

-- Add initial_quantity_mg to preserve original amount
ALTER TABLE public.client_inventory
ADD COLUMN IF NOT EXISTS initial_quantity_mg DECIMAL(10, 2);

-- Add protocol_item_id to link bottles to specific protocol items
ALTER TABLE public.client_inventory
ADD COLUMN IF NOT EXISTS protocol_item_id UUID REFERENCES public.protocol_items(id) ON DELETE SET NULL;

-- Create index for performance when querying by protocol_item
CREATE INDEX IF NOT EXISTS idx_client_inventory_protocol_item 
ON public.client_inventory(protocol_item_id);

-- Add comments for documentation
COMMENT ON COLUMN public.client_inventory.current_quantity_mg IS 
'Current remaining quantity in mg. NULL means bottle is unopened/full and we should use initial_quantity_mg.';

COMMENT ON COLUMN public.client_inventory.initial_quantity_mg IS 
'Initial quantity when bottle was assigned. Used for calculating usage percentage.';

COMMENT ON COLUMN public.client_inventory.protocol_item_id IS 
'Links this bottle to a specific protocol item for supply tracking. NULL means bottle is not linked to a specific protocol.';
