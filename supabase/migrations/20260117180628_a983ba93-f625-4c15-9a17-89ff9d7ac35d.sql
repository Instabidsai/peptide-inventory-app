-- ============================================
-- PHASE 1: Peptide Inventory Tracker Schema
-- ============================================

-- 1. Create ENUM types
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'viewer');
CREATE TYPE public.bottle_status AS ENUM ('in_stock', 'sold', 'given_away', 'internal_use', 'lost', 'returned', 'expired');
CREATE TYPE public.movement_type AS ENUM ('sale', 'giveaway', 'internal_use', 'loss', 'return');
CREATE TYPE public.contact_type AS ENUM ('customer', 'partner', 'internal');
CREATE TYPE public.price_tier AS ENUM ('retail', 'wholesale', 'at_cost');

-- 2. Create organizations table (multi-tenant root)
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create profiles table (linked to auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, org_id)
);

-- 5. Create peptides table (product master)
CREATE TABLE public.peptides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    sku TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Create peptide_pricing table
CREATE TABLE public.peptide_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peptide_id UUID REFERENCES public.peptides(id) ON DELETE CASCADE NOT NULL,
    tier public.price_tier NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Create lots table (inventory batches)
CREATE TABLE public.lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    peptide_id UUID REFERENCES public.peptides(id) ON DELETE RESTRICT NOT NULL,
    lot_number TEXT NOT NULL,
    quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
    cost_per_unit DECIMAL(10,2) NOT NULL,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Create bottles table (individual inventory units)
CREATE TABLE public.bottles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    lot_id UUID REFERENCES public.lots(id) ON DELETE RESTRICT NOT NULL,
    uid TEXT NOT NULL,
    status public.bottle_status NOT NULL DEFAULT 'in_stock',
    location TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, uid)
);

-- 9. Create contacts table
CREATE TABLE public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    type public.contact_type NOT NULL DEFAULT 'customer',
    company TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Create movements table (transaction headers)
CREATE TABLE public.movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    type public.movement_type NOT NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Create movement_items table (transaction line items)
CREATE TABLE public.movement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_id UUID REFERENCES public.movements(id) ON DELETE CASCADE NOT NULL,
    bottle_id UUID REFERENCES public.bottles(id) ON DELETE RESTRICT NOT NULL,
    price_at_sale DECIMAL(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Create audit_log table
CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- HELPER FUNCTIONS (Security Definer)
-- ============================================

-- Get user's org_id
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT org_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    );
$$;

-- Check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND org_id = _org_id AND role = 'admin'
    );
$$;

-- Check if user is org member
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND org_id = _org_id
    );
$$;

-- ============================================
-- AUTO-GENERATE BOTTLE UIDs
-- ============================================

-- Sequence for bottle UIDs
CREATE SEQUENCE IF NOT EXISTS public.bottle_uid_seq START 1;

-- Function to generate bottle UID
CREATE OR REPLACE FUNCTION public.generate_bottle_uid()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    seq_val BIGINT;
    year_part TEXT;
BEGIN
    SELECT nextval('public.bottle_uid_seq') INTO seq_val;
    year_part := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    RETURN 'B-' || year_part || '-' || LPAD(seq_val::TEXT, 7, '0');
END;
$$;

-- Function to auto-create bottles when lot is inserted
CREATE OR REPLACE FUNCTION public.create_bottles_for_lot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    i INTEGER;
BEGIN
    FOR i IN 1..NEW.quantity_received LOOP
        INSERT INTO public.bottles (org_id, lot_id, uid, status)
        VALUES (NEW.org_id, NEW.id, public.generate_bottle_uid(), 'in_stock');
    END LOOP;
    RETURN NEW;
END;
$$;

-- Trigger to create bottles on lot insert
CREATE TRIGGER trigger_create_bottles_for_lot
    AFTER INSERT ON public.lots
    FOR EACH ROW
    EXECUTE FUNCTION public.create_bottles_for_lot();

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_peptides_updated_at BEFORE UPDATE ON public.peptides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lots_updated_at BEFORE UPDATE ON public.lots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bottles_updated_at BEFORE UPDATE ON public.bottles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peptides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peptide_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bottles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Organizations: members can view their org
CREATE POLICY "Users can view their organization"
    ON public.organizations FOR SELECT
    TO authenticated
    USING (public.is_org_member(auth.uid(), id));

CREATE POLICY "Admins can update their organization"
    ON public.organizations FOR UPDATE
    TO authenticated
    USING (public.is_org_admin(auth.uid(), id));

-- Allow insert for new org creation during onboarding
CREATE POLICY "Authenticated users can create organizations"
    ON public.organizations FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Profiles
CREATE POLICY "Users can view profiles in their org"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- User Roles
CREATE POLICY "Users can view roles in their org"
    ON public.user_roles FOR SELECT
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Admins can manage roles in their org"
    ON public.user_roles FOR ALL
    TO authenticated
    USING (public.is_org_admin(auth.uid(), org_id));

-- Allow users to create their first role during onboarding
CREATE POLICY "Users can create their own initial role"
    ON public.user_roles FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Peptides
CREATE POLICY "Users can view peptides in their org"
    ON public.peptides FOR SELECT
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Staff and admins can insert peptides"
    ON public.peptides FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Staff and admins can update peptides"
    ON public.peptides FOR UPDATE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Admins can delete peptides"
    ON public.peptides FOR DELETE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Peptide Pricing
CREATE POLICY "Users can view pricing in their org"
    ON public.peptide_pricing FOR SELECT
    TO authenticated
    USING (peptide_id IN (SELECT id FROM public.peptides WHERE org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Staff and admins can manage pricing"
    ON public.peptide_pricing FOR ALL
    TO authenticated
    USING (peptide_id IN (SELECT id FROM public.peptides WHERE org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

-- Lots
CREATE POLICY "Users can view lots in their org"
    ON public.lots FOR SELECT
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Staff and admins can insert lots"
    ON public.lots FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Staff and admins can update lots"
    ON public.lots FOR UPDATE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Admins can delete lots"
    ON public.lots FOR DELETE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Bottles
CREATE POLICY "Users can view bottles in their org"
    ON public.bottles FOR SELECT
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Staff and admins can insert bottles"
    ON public.bottles FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Staff and admins can update bottles"
    ON public.bottles FOR UPDATE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Admins can delete bottles"
    ON public.bottles FOR DELETE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Contacts
CREATE POLICY "Users can view contacts in their org"
    ON public.contacts FOR SELECT
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Staff and admins can insert contacts"
    ON public.contacts FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Staff and admins can update contacts"
    ON public.contacts FOR UPDATE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Admins can delete contacts"
    ON public.contacts FOR DELETE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Movements
CREATE POLICY "Users can view movements in their org"
    ON public.movements FOR SELECT
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Staff and admins can insert movements"
    ON public.movements FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

CREATE POLICY "Admins can delete movements"
    ON public.movements FOR DELETE
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- Movement Items
CREATE POLICY "Users can view movement items in their org"
    ON public.movement_items FOR SELECT
    TO authenticated
    USING (movement_id IN (SELECT id FROM public.movements WHERE org_id = public.get_user_org_id(auth.uid())));

CREATE POLICY "Staff and admins can insert movement items"
    ON public.movement_items FOR INSERT
    TO authenticated
    WITH CHECK (movement_id IN (SELECT id FROM public.movements WHERE org_id = public.get_user_org_id(auth.uid())) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')));

-- Audit Log
CREATE POLICY "Users can view audit log in their org"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "System can insert audit log"
    ON public.audit_log FOR INSERT
    TO authenticated
    WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_org_id ON public.user_roles(org_id);
CREATE INDEX idx_peptides_org_id ON public.peptides(org_id);
CREATE INDEX idx_lots_org_id ON public.lots(org_id);
CREATE INDEX idx_lots_peptide_id ON public.lots(peptide_id);
CREATE INDEX idx_bottles_org_id ON public.bottles(org_id);
CREATE INDEX idx_bottles_lot_id ON public.bottles(lot_id);
CREATE INDEX idx_bottles_status ON public.bottles(status);
CREATE INDEX idx_bottles_uid ON public.bottles(uid);
CREATE INDEX idx_contacts_org_id ON public.contacts(org_id);
CREATE INDEX idx_movements_org_id ON public.movements(org_id);
CREATE INDEX idx_movements_contact_id ON public.movements(contact_id);
CREATE INDEX idx_movement_items_movement_id ON public.movement_items(movement_id);
CREATE INDEX idx_movement_items_bottle_id ON public.movement_items(bottle_id);
CREATE INDEX idx_audit_log_org_id ON public.audit_log(org_id);
CREATE INDEX idx_audit_log_table_record ON public.audit_log(table_name, record_id);