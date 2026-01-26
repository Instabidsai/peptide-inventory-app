-- 1. Create Request Types and Tables
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'fulfilled', 'rejected', 'archived');
CREATE TYPE public.request_type AS ENUM ('general_inquiry', 'product_request', 'regimen_help');

CREATE TABLE IF NOT EXISTS public.client_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    type public.request_type NOT NULL DEFAULT 'product_request',
    status public.request_status NOT NULL DEFAULT 'pending',
    
    subject TEXT,
    message TEXT,
    
    peptide_id UUID REFERENCES public.peptides(id) ON DELETE SET NULL,
    requested_quantity INTEGER DEFAULT 1,
    
    admin_notes TEXT,
    fulfilled_movement_id UUID REFERENCES public.movements(id) ON DELETE SET NULL,
    -- Add link to sales order if you want to track that too
    -- fulfilled_order_id UUID REFERENCES public.sales_orders(id) ON DELETE SET NULL, 
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_requests_user ON public.client_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.client_requests(status);

-- 3. RLS
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own" ON public.client_requests
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Clients create own" ON public.client_requests
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Clients update pending" ON public.client_requests
    FOR UPDATE TO authenticated 
    USING (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Admins view all" ON public.client_requests
    FOR SELECT TO authenticated 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Admins manage all" ON public.client_requests
    FOR ALL TO authenticated 
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- 4. Triggers
CREATE TRIGGER update_requests_modtime
    BEFORE UPDATE ON public.client_requests
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
