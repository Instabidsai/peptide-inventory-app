-- Phase 8: Smart Context Schema
-- Adds context awareness to client requests (e.g., "Referring to Order #123")

-- 1. Add Context Columns
ALTER TABLE public.client_requests 
ADD COLUMN IF NOT EXISTS context_type text CHECK (context_type IN ('order', 'regimen', 'product', 'general')),
ADD COLUMN IF NOT EXISTS context_id uuid;

-- 2. Add Index for faster lookups (Optional but good practice)
CREATE INDEX IF NOT EXISTS idx_client_requests_context ON public.client_requests(context_type, context_id);

-- 3. Comment
COMMENT ON COLUMN public.client_requests.context_type IS 'The type of entity this request is referencing (order, regimen, etc)';
COMMENT ON COLUMN public.client_requests.context_id IS 'The UUID of the referenced entity';
