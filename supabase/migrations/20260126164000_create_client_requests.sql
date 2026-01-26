-- Create ENUMs for requests
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'fulfilled', 'rejected', 'archived');
CREATE TYPE public.request_type AS ENUM ('general_inquiry', 'product_request', 'regimen_help');

-- Create client_requests table
CREATE TABLE IF NOT EXISTS public.client_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    type public.request_type NOT NULL DEFAULT 'product_request',
    status public.request_status NOT NULL DEFAULT 'pending',
    
    subject TEXT,
    message TEXT,
    
    -- Optional linking to specific product
    peptide_id UUID REFERENCES public.peptides(id) ON DELETE SET NULL,
    requested_quantity INTEGER DEFAULT 1,
    
    -- Admin workflow
    admin_notes TEXT,
    fulfilled_movement_id UUID REFERENCES public.movements(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_client_requests_org_id ON public.client_requests(org_id);
CREATE INDEX idx_client_requests_user_id ON public.client_requests(user_id);
CREATE INDEX idx_client_requests_status ON public.client_requests(status);

-- Enable RLS
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- 1. Clients can view their own requests
CREATE POLICY "Clients can view own requests"
    ON public.client_requests FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- 2. Clients can insert their own requests (enforcing their own user_id and org_id)
CREATE POLICY "Clients can create requests"
    ON public.client_requests FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid() AND
        org_id = public.get_user_org_id(auth.uid())
    );

-- 3. Clients can update their own requests (only if pending, mostly for editing message)
CREATE POLICY "Clients can update pending requests"
    ON public.client_requests FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() AND status = 'pending')
    WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- 4. Admins/Staff can view all requests in their org
CREATE POLICY "Admins/Staff can view org requests"
    ON public.client_requests FOR SELECT
    TO authenticated
    USING (
        org_id = public.get_user_org_id(auth.uid()) AND
        (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
    );

-- 5. Admins/Staff can update requests (fulfill, note, archive)
CREATE POLICY "Admins/Staff can manage requests"
    ON public.client_requests FOR UPDATE
    TO authenticated
    USING (
        org_id = public.get_user_org_id(auth.uid()) AND
        (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
    );

-- Trigger for updated_at
CREATE TRIGGER update_client_requests_updated_at
    BEFORE UPDATE ON public.client_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
