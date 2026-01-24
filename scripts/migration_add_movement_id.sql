
ALTER TABLE client_inventory 
ADD COLUMN IF NOT EXISTS movement_id UUID REFERENCES movements(id);

COMMENT ON COLUMN client_inventory.movement_id IS 'Links the inventory item to the order (movement) it came from, allowing grouping by order.';
