-- Add status tracking to movements table
-- This allows tracking whether inventory assignments are active, returned, or cancelled
-- while preserving financial transaction history

-- Add status column to movements table
ALTER TABLE public.movements 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add check constraint for valid values
ALTER TABLE public.movements 
DROP CONSTRAINT IF EXISTS movements_status_check;

ALTER TABLE public.movements 
ADD CONSTRAINT movements_status_check 
CHECK (status IN ('active', 'returned', 'cancelled', 'partial_return'));

-- Set existing movements to 'active' status
UPDATE public.movements 
SET status = 'active' 
WHERE status IS NULL;

-- Create index for performance when filtering by status
CREATE INDEX IF NOT EXISTS idx_movements_status 
ON public.movements(status);

-- Add comment for documentation
COMMENT ON COLUMN public.movements.status IS 
'Tracks the current status of this inventory assignment: active (bottles currently with client), returned (bottles returned to stock), cancelled (transaction voided), partial_return (some bottles returned)';
