-- =============================================================================
-- PEPTIDE INVENTORY APP — MASTER SCHEMA
-- =============================================================================
-- Single-file schema that creates the entire database from scratch.
-- Execute against a fresh Supabase project (with auth already configured).
--
-- Order:  Extensions → Enums → Sequences → Tables → PKs → Unique → FKs
--         → Functions → Triggers → Indexes → RLS Enable → RLS Policies
--
-- Generated: 2026-02-22
-- Source: Production DB mckkegmkpqdicudnfhor (NextGen Research Labs)
-- Tables: 57 | Columns: 569 | Policies: ~120 | Functions: ~25
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CUSTOM ENUMS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'viewer', 'client', 'fulfillment', 'sales_rep', 'customer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.bottle_status AS ENUM ('in_stock', 'sold', 'given_away', 'internal_use', 'lost', 'returned', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.contact_type AS ENUM ('customer', 'partner', 'internal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.movement_type AS ENUM ('sale', 'giveaway', 'internal_use', 'loss', 'return');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.price_tier AS ENUM ('retail', 'wholesale', 'at_cost');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'fulfilled', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.request_type AS ENUM ('general_inquiry', 'product_request', 'regimen_help');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SEQUENCES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.bottle_uid_seq START 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLES (ordered by dependency — parents first)
-- ─────────────────────────────────────────────────────────────────────────────

-- 4.1 Root tables (no foreign-key deps)
CREATE TABLE IF NOT EXISTS organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS supplements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    image_url text,
    purchase_link text,
    default_dosage text,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id bigint NOT NULL PRIMARY KEY,
    email text NOT NULL,
    subscribed_at timestamptz DEFAULT now() NOT NULL,
    source text DEFAULT 'website_footer'::text
);

CREATE TABLE IF NOT EXISTS resource_themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    icon text DEFAULT 'beaker'::text,
    color text DEFAULT '#10b981'::text
);

CREATE TABLE IF NOT EXISTS embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    content text,
    metadata jsonb,
    embedding vector
);

-- 4.2 Tables depending on organizations
CREATE TABLE IF NOT EXISTS profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    org_id uuid,
    full_name text,
    email text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    role text DEFAULT 'admin'::text,
    commission_rate numeric DEFAULT 0.00,
    credit_balance numeric DEFAULT 0.00,
    parent_partner_id uuid,
    partner_tier text DEFAULT 'standard'::text,
    price_multiplier numeric DEFAULT 1.0,
    parent_rep_id uuid,
    pricing_mode text DEFAULT 'percentage'::text,
    cost_plus_markup numeric DEFAULT 0
);

CREATE TABLE IF NOT EXISTS peptides (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    sku text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    retail_price numeric DEFAULT 0,
    default_dose_amount numeric,
    default_dose_unit text DEFAULT 'mcg'::text,
    default_frequency text DEFAULT 'daily'::text,
    default_timing text,
    default_concentration_mg_ml numeric,
    reconstitution_notes text,
    visible_to_user_ids uuid[]
);

CREATE TABLE IF NOT EXISTS user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    role app_role DEFAULT 'viewer'::app_role NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    brand_name text DEFAULT 'Peptide AI'::text NOT NULL,
    admin_brand_name text DEFAULT 'Peptide Admin'::text NOT NULL,
    support_email text DEFAULT ''::text,
    app_url text DEFAULT ''::text,
    logo_url text DEFAULT ''::text,
    primary_color text DEFAULT '#7c3aed'::text,
    ship_from_name text DEFAULT ''::text,
    ship_from_street text DEFAULT ''::text,
    ship_from_city text DEFAULT ''::text,
    ship_from_state text DEFAULT ''::text,
    ship_from_zip text DEFAULT ''::text,
    ship_from_country text DEFAULT 'US'::text,
    ship_from_phone text DEFAULT ''::text,
    ship_from_email text DEFAULT ''::text,
    zelle_email text DEFAULT ''::text,
    venmo_handle text DEFAULT ''::text,
    cashapp_handle text DEFAULT ''::text,
    ai_system_prompt_override text,
    session_timeout_minutes integer DEFAULT 60,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid,
    user_id uuid,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    module_type text NOT NULL,
    enabled boolean DEFAULT true,
    config jsonb DEFAULT '{}'::jsonb,
    last_run_at timestamptz,
    run_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    peptide_id uuid NOT NULL,
    quantity_ordered integer NOT NULL,
    estimated_cost_per_unit numeric,
    order_date date DEFAULT CURRENT_DATE NOT NULL,
    expected_arrival_date date,
    supplier text,
    tracking_number text,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    payment_status text DEFAULT 'unpaid'::text,
    amount_paid numeric DEFAULT 0.00,
    order_group_id text
);

CREATE TABLE IF NOT EXISTS partner_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    suggestion_text text NOT NULL,
    category text DEFAULT 'feature'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    admin_notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    work_date date NOT NULL,
    hours numeric NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4.3 Tables depending on profiles
CREATE TABLE IF NOT EXISTS contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    type contact_type DEFAULT 'customer'::contact_type NOT NULL,
    company text,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    linked_user_id uuid,
    tier text DEFAULT 'public'::text,
    invite_link text,
    assigned_rep_id uuid,
    claim_token uuid DEFAULT gen_random_uuid(),
    claim_token_expires_at timestamptz DEFAULT (now() + '7 days'::interval),
    address text,
    household_id uuid,
    household_role text,
    woo_customer_id bigint,
    source text DEFAULT 'manual'::text NOT NULL
);

-- 4.4 Tables depending on peptides + organizations
CREATE TABLE IF NOT EXISTS lots (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    peptide_id uuid NOT NULL,
    lot_number text NOT NULL,
    quantity_received integer NOT NULL,
    cost_per_unit numeric NOT NULL,
    received_date date DEFAULT CURRENT_DATE NOT NULL,
    expiry_date date,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    payment_status text DEFAULT 'unpaid'::text,
    payment_date date,
    payment_method text
);

CREATE TABLE IF NOT EXISTS peptide_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    peptide_id uuid NOT NULL,
    tier price_tier NOT NULL,
    price numeric NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS peptide_suggested_supplements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    peptide_id uuid NOT NULL,
    supplement_id uuid NOT NULL,
    reasoning text,
    created_at timestamptz DEFAULT now()
);

-- 4.5 Tables depending on lots
CREATE TABLE IF NOT EXISTS bottles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    lot_id uuid NOT NULL,
    uid text NOT NULL,
    status bottle_status DEFAULT 'in_stock'::bottle_status NOT NULL,
    location text,
    notes text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- 4.6 Tables depending on contacts
CREATE TABLE IF NOT EXISTS movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    type movement_type NOT NULL,
    contact_id uuid,
    movement_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    payment_status text DEFAULT 'unpaid'::text,
    amount_paid numeric DEFAULT 0,
    payment_method text,
    payment_date timestamptz,
    status text DEFAULT 'active'::text,
    discount_percent numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    client_id uuid NOT NULL,
    rep_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    commission_amount numeric DEFAULT 0,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    amount_paid numeric DEFAULT 0,
    payment_method text,
    payment_date timestamptz,
    shipping_address text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    commission_status text DEFAULT 'pending'::text,
    psifi_session_id text,
    psifi_transaction_id text,
    psifi_status text DEFAULT 'none'::text,
    tracking_number text,
    carrier text,
    shipping_status text DEFAULT 'pending'::text,
    ship_date timestamptz,
    shipping_cost numeric DEFAULT 0,
    label_url text,
    shippo_shipment_id text,
    shippo_transaction_id text,
    shipping_error text,
    order_source text DEFAULT 'app'::text,
    woo_order_id bigint,
    woo_status text,
    woo_date_created timestamptz,
    woo_date_modified timestamptz,
    cogs_amount numeric DEFAULT 0,
    profit_amount numeric DEFAULT 0,
    merchant_fee numeric DEFAULT 0,
    delivery_method text DEFAULT 'ship'::text
);

CREATE TABLE IF NOT EXISTS protocols (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    contact_id uuid,
    name text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    contact_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    created_by uuid,
    org_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS client_daily_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    contact_id uuid,
    log_date date NOT NULL,
    weight_lbs numeric,
    body_fat_pct numeric,
    water_intake_oz numeric,
    notes text,
    side_effects text[],
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_supplements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    contact_id uuid,
    name text NOT NULL,
    dosage text,
    frequency text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sender_aliases (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    sender_name text NOT NULL,
    contact_id uuid NOT NULL,
    payment_method text,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    peptide_id uuid,
    title text NOT NULL,
    url text NOT NULL,
    type text,
    description text,
    created_at timestamptz DEFAULT now(),
    contact_id uuid,
    content text,
    link_button_text text DEFAULT 'Open'::text,
    theme_id uuid,
    thumbnail_url text,
    is_featured boolean DEFAULT false,
    view_count integer DEFAULT 0,
    duration_seconds integer,
    duration integer
);

-- 4.7 Tables depending on movements / sales_orders
CREATE TABLE IF NOT EXISTS movement_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    movement_id uuid NOT NULL,
    bottle_id uuid,
    price_at_sale numeric,
    created_at timestamptz DEFAULT now() NOT NULL,
    description text
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    sales_order_id uuid NOT NULL,
    peptide_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    sale_id uuid,
    partner_id uuid,
    amount numeric NOT NULL,
    commission_rate numeric,
    type text,
    status text DEFAULT 'pending'::text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type request_type DEFAULT 'product_request'::request_type NOT NULL,
    status request_status DEFAULT 'pending'::request_status NOT NULL,
    subject text,
    message text,
    peptide_id uuid,
    requested_quantity integer DEFAULT 1,
    admin_notes text,
    fulfilled_movement_id uuid,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb,
    admin_attachments jsonb DEFAULT '[]'::jsonb,
    context_type text,
    context_id uuid
);

CREATE TABLE IF NOT EXISTS client_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    contact_id uuid,
    peptide_id uuid,
    batch_number text,
    vial_size_mg numeric NOT NULL,
    water_added_ml numeric,
    concentration_mg_ml numeric,
    reconstituted_at timestamptz,
    expires_at timestamptz,
    current_quantity_mg numeric NOT NULL,
    status text DEFAULT 'active'::text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    movement_id uuid,
    initial_quantity_mg numeric,
    protocol_item_id uuid,
    dose_amount_mg numeric,
    dose_days text[],
    in_fridge boolean DEFAULT false,
    dose_frequency text,
    dose_interval integer,
    dose_off_days integer,
    dose_time_of_day text
);

CREATE TABLE IF NOT EXISTS expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    category text NOT NULL,
    amount numeric NOT NULL,
    description text,
    recipient text,
    payment_method text,
    status text DEFAULT 'paid'::text,
    related_order_id uuid,
    related_sales_order_id uuid
);

CREATE TABLE IF NOT EXISTS payment_email_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL,
    gmail_message_id text NOT NULL,
    sender_name text,
    amount numeric NOT NULL,
    payment_method text NOT NULL,
    email_subject text,
    email_snippet text,
    email_date timestamptz,
    matched_contact_id uuid,
    matched_movement_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    confidence text DEFAULT 'low'::text NOT NULL,
    auto_posted_at timestamptz,
    reviewed_by uuid,
    reviewed_at timestamptz,
    notes text,
    created_at timestamptz DEFAULT now(),
    ai_suggested_contact_id uuid,
    ai_reasoning text
);

-- 4.8 Tables depending on protocols
CREATE TABLE IF NOT EXISTS protocol_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    protocol_id uuid NOT NULL,
    peptide_id uuid NOT NULL,
    dosage_amount numeric NOT NULL,
    dosage_unit text DEFAULT 'mcg'::text NOT NULL,
    frequency text NOT NULL,
    duration_weeks numeric NOT NULL,
    price_tier text DEFAULT 'retail'::text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    duration_days integer,
    cost_multiplier numeric DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS protocol_supplements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    protocol_id uuid NOT NULL,
    supplement_id uuid NOT NULL,
    dosage text,
    frequency text,
    notes text,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS protocol_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    protocol_id uuid,
    user_id uuid,
    rating smallint,
    comment text,
    created_at timestamptz DEFAULT now(),
    admin_response text,
    response_link text,
    response_at timestamptz,
    is_read_by_client boolean DEFAULT false
);

-- 4.9 Tables depending on protocol_items
CREATE TABLE IF NOT EXISTS protocol_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    protocol_item_id uuid NOT NULL,
    user_id uuid,
    taken_at timestamptz DEFAULT now(),
    status text DEFAULT 'taken'::text,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 4.10 Tables depending on client_requests
CREATE TABLE IF NOT EXISTS request_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    request_id uuid NOT NULL,
    user_id uuid NOT NULL,
    message text,
    attachments jsonb DEFAULT '[]'::jsonb,
    is_internal boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- 4.11 Tables depending on resources
CREATE TABLE IF NOT EXISTS resource_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    resource_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    resource_id uuid NOT NULL,
    user_id uuid,
    viewed_at timestamptz DEFAULT now()
);

-- 4.12 Standalone user tables (no org dependency)
CREATE TABLE IF NOT EXISTS admin_ai_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    session_ts timestamptz DEFAULT now(),
    tool_name text,
    tool_args jsonb,
    tool_result text,
    error text,
    duration_ms integer,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    title text DEFAULT 'Peptide AI'::text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    file_type text NOT NULL,
    storage_path text NOT NULL,
    status text DEFAULT 'pending'::text,
    extracted_text text,
    summary text,
    chunk_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_health_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb,
    goals jsonb DEFAULT '[]'::jsonb,
    medications jsonb DEFAULT '[]'::jsonb,
    allergies jsonb DEFAULT '[]'::jsonb,
    supplements jsonb DEFAULT '[]'::jsonb,
    lab_values jsonb DEFAULT '{}'::jsonb,
    notes text DEFAULT ''::text,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_learned_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    source text,
    source_url text,
    relevance_score double precision DEFAULT 1.0,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    type text DEFAULT 'info'::text,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS body_composition_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    date date DEFAULT CURRENT_DATE NOT NULL,
    weight numeric,
    body_fat_percentage numeric,
    muscle_mass numeric,
    visceral_fat numeric,
    water_percentage numeric,
    bmi numeric,
    bmr numeric,
    notes text,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    image_url text,
    foods jsonb DEFAULT '[]'::jsonb,
    total_calories numeric DEFAULT 0,
    total_protein numeric DEFAULT 0,
    total_carbs numeric DEFAULT 0,
    total_fat numeric DEFAULT 0,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS water_logs (
    id uuid DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    amount_oz integer NOT NULL,
    logged_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_macro_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid,
    calories_target integer DEFAULT 2000,
    protein_target integer DEFAULT 150,
    carbs_target integer DEFAULT 200,
    fat_target integer DEFAULT 65,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    water_goal_oz integer DEFAULT 64
);

CREATE TABLE IF NOT EXISTS favorite_foods (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    name text NOT NULL,
    calories numeric DEFAULT 0 NOT NULL,
    protein numeric DEFAULT 0 NOT NULL,
    carbs numeric DEFAULT 0 NOT NULL,
    fat numeric DEFAULT 0 NOT NULL,
    quantity text DEFAULT '1 serving'::text,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_template boolean DEFAULT false,
    template_name varchar(255),
    meal_type varchar(50)
);

CREATE TABLE IF NOT EXISTS discussion_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title text NOT NULL,
    content text,
    theme_id uuid,
    user_id uuid NOT NULL,
    is_pinned boolean DEFAULT false,
    message_count integer DEFAULT 0,
    last_activity_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discussion_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    topic_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    parent_id uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. UNIQUE CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_org_id_key UNIQUE (user_id, org_id);
ALTER TABLE tenant_config ADD CONSTRAINT tenant_config_org_id_key UNIQUE (org_id);
ALTER TABLE bottles ADD CONSTRAINT bottles_org_id_uid_key UNIQUE (org_id, uid);
ALTER TABLE ai_health_profiles ADD CONSTRAINT ai_health_profiles_user_id_key UNIQUE (user_id);
ALTER TABLE newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_email_key UNIQUE (email);
ALTER TABLE automation_modules ADD CONSTRAINT automation_modules_org_id_module_type_key UNIQUE (org_id, module_type);
ALTER TABLE client_daily_logs ADD CONSTRAINT client_daily_logs_contact_id_log_date_key UNIQUE (contact_id, log_date);
ALTER TABLE daily_hours ADD CONSTRAINT daily_hours_user_id_work_date_key UNIQUE (user_id, work_date);
ALTER TABLE daily_macro_goals ADD CONSTRAINT daily_macro_goals_user_id_key UNIQUE (user_id);
ALTER TABLE peptide_suggested_supplements ADD CONSTRAINT peptide_suggested_supplements_peptide_id_supplement_id_key UNIQUE (peptide_id, supplement_id);
ALTER TABLE sender_aliases ADD CONSTRAINT sender_aliases_org_id_sender_name_key UNIQUE (org_id, sender_name);
ALTER TABLE contacts ADD CONSTRAINT contacts_claim_token_unique UNIQUE (claim_token);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. FOREIGN KEYS
-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
ALTER TABLE profiles ADD CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD CONSTRAINT profiles_parent_partner_id_fkey FOREIGN KEY (parent_partner_id) REFERENCES profiles(id);
ALTER TABLE profiles ADD CONSTRAINT profiles_parent_rep_id_fkey FOREIGN KEY (parent_rep_id) REFERENCES profiles(id);

-- user_roles
ALTER TABLE user_roles ADD CONSTRAINT user_roles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- tenant_config
ALTER TABLE tenant_config ADD CONSTRAINT tenant_config_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- audit_log
ALTER TABLE audit_log ADD CONSTRAINT audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- automation_modules
ALTER TABLE automation_modules ADD CONSTRAINT automation_modules_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- peptides
ALTER TABLE peptides ADD CONSTRAINT peptides_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- contacts
ALTER TABLE contacts ADD CONSTRAINT contacts_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD CONSTRAINT contacts_assigned_rep_id_fkey FOREIGN KEY (assigned_rep_id) REFERENCES profiles(id);

-- lots
ALTER TABLE lots ADD CONSTRAINT lots_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE lots ADD CONSTRAINT lots_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id) ON DELETE RESTRICT;

-- bottles
ALTER TABLE bottles ADD CONSTRAINT bottles_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE bottles ADD CONSTRAINT bottles_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE RESTRICT;

-- peptide_pricing
ALTER TABLE peptide_pricing ADD CONSTRAINT peptide_pricing_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id) ON DELETE CASCADE;

-- peptide_suggested_supplements
ALTER TABLE peptide_suggested_supplements ADD CONSTRAINT peptide_suggested_supplements_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id) ON DELETE CASCADE;
ALTER TABLE peptide_suggested_supplements ADD CONSTRAINT peptide_suggested_supplements_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES supplements(id) ON DELETE CASCADE;

-- movements
ALTER TABLE movements ADD CONSTRAINT movements_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE movements ADD CONSTRAINT movements_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE movements ADD CONSTRAINT movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- movement_items
ALTER TABLE movement_items ADD CONSTRAINT movement_items_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES movements(id) ON DELETE CASCADE;
ALTER TABLE movement_items ADD CONSTRAINT movement_items_bottle_id_fkey FOREIGN KEY (bottle_id) REFERENCES bottles(id) ON DELETE RESTRICT;

-- sales_orders
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES contacts(id);
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_rep_id_fkey FOREIGN KEY (rep_id) REFERENCES profiles(id);

-- sales_order_items
ALTER TABLE sales_order_items ADD CONSTRAINT sales_order_items_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE;
ALTER TABLE sales_order_items ADD CONSTRAINT sales_order_items_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id);

-- commissions
ALTER TABLE commissions ADD CONSTRAINT commissions_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales_orders(id) ON DELETE CASCADE;
ALTER TABLE commissions ADD CONSTRAINT commissions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES profiles(id);

-- protocols
ALTER TABLE protocols ADD CONSTRAINT protocols_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);
ALTER TABLE protocols ADD CONSTRAINT protocols_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- protocol_items
ALTER TABLE protocol_items ADD CONSTRAINT protocol_items_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE;
ALTER TABLE protocol_items ADD CONSTRAINT protocol_items_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id) ON DELETE CASCADE;

-- protocol_supplements
ALTER TABLE protocol_supplements ADD CONSTRAINT protocol_supplements_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE;
ALTER TABLE protocol_supplements ADD CONSTRAINT protocol_supplements_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES supplements(id) ON DELETE CASCADE;

-- protocol_feedback
ALTER TABLE protocol_feedback ADD CONSTRAINT protocol_feedback_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE;

-- protocol_logs
ALTER TABLE protocol_logs ADD CONSTRAINT protocol_logs_protocol_item_id_fkey FOREIGN KEY (protocol_item_id) REFERENCES protocol_items(id) ON DELETE CASCADE;

-- contact_notes
ALTER TABLE contact_notes ADD CONSTRAINT contact_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE contact_notes ADD CONSTRAINT contact_notes_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- client_daily_logs
ALTER TABLE client_daily_logs ADD CONSTRAINT client_daily_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- client_supplements
ALTER TABLE client_supplements ADD CONSTRAINT client_supplements_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- client_inventory
ALTER TABLE client_inventory ADD CONSTRAINT client_inventory_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE client_inventory ADD CONSTRAINT client_inventory_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id);
ALTER TABLE client_inventory ADD CONSTRAINT client_inventory_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES movements(id);
ALTER TABLE client_inventory ADD CONSTRAINT client_inventory_protocol_item_id_fkey FOREIGN KEY (protocol_item_id) REFERENCES protocol_items(id) ON DELETE SET NULL;

-- client_requests
ALTER TABLE client_requests ADD CONSTRAINT client_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE client_requests ADD CONSTRAINT client_requests_profile_fk FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;
ALTER TABLE client_requests ADD CONSTRAINT client_requests_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id) ON DELETE SET NULL;
ALTER TABLE client_requests ADD CONSTRAINT client_requests_fulfilled_movement_id_fkey FOREIGN KEY (fulfilled_movement_id) REFERENCES movements(id) ON DELETE SET NULL;

-- request_replies
ALTER TABLE request_replies ADD CONSTRAINT request_replies_request_id_fkey FOREIGN KEY (request_id) REFERENCES client_requests(id) ON DELETE CASCADE;
ALTER TABLE request_replies ADD CONSTRAINT request_replies_profile_fk FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

-- orders
ALTER TABLE orders ADD CONSTRAINT orders_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE orders ADD CONSTRAINT orders_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id) ON DELETE CASCADE;

-- expenses
ALTER TABLE expenses ADD CONSTRAINT expenses_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES orders(id);
ALTER TABLE expenses ADD CONSTRAINT expenses_related_sales_order_id_fkey FOREIGN KEY (related_sales_order_id) REFERENCES sales_orders(id);

-- daily_hours
ALTER TABLE daily_hours ADD CONSTRAINT daily_hours_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);

-- partner_chat_messages
ALTER TABLE partner_chat_messages ADD CONSTRAINT partner_chat_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- partner_suggestions
ALTER TABLE partner_suggestions ADD CONSTRAINT partner_suggestions_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- payment_email_queue
ALTER TABLE payment_email_queue ADD CONSTRAINT payment_email_queue_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE payment_email_queue ADD CONSTRAINT payment_email_queue_matched_contact_id_fkey FOREIGN KEY (matched_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE payment_email_queue ADD CONSTRAINT payment_email_queue_matched_movement_id_fkey FOREIGN KEY (matched_movement_id) REFERENCES movements(id) ON DELETE SET NULL;
ALTER TABLE payment_email_queue ADD CONSTRAINT payment_email_queue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE payment_email_queue ADD CONSTRAINT payment_email_queue_ai_suggested_contact_id_fkey FOREIGN KEY (ai_suggested_contact_id) REFERENCES contacts(id);

-- sender_aliases
ALTER TABLE sender_aliases ADD CONSTRAINT sender_aliases_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sender_aliases ADD CONSTRAINT sender_aliases_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE sender_aliases ADD CONSTRAINT sender_aliases_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

-- resources
ALTER TABLE resources ADD CONSTRAINT resources_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES peptides(id) ON DELETE SET NULL;
ALTER TABLE resources ADD CONSTRAINT resources_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE resources ADD CONSTRAINT resources_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES resource_themes(id) ON DELETE SET NULL;

-- resource_comments
ALTER TABLE resource_comments ADD CONSTRAINT resource_comments_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE;

-- resource_views
ALTER TABLE resource_views ADD CONSTRAINT resource_views_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE;

-- ai_messages
ALTER TABLE ai_messages ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;

-- discussion_topics
ALTER TABLE discussion_topics ADD CONSTRAINT discussion_topics_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES resource_themes(id) ON DELETE SET NULL;

-- discussion_messages
ALTER TABLE discussion_messages ADD CONSTRAINT discussion_messages_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES discussion_topics(id) ON DELETE CASCADE;
ALTER TABLE discussion_messages ADD CONSTRAINT discussion_messages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES discussion_messages(id) ON DELETE SET NULL;

-- unique constraint that acts as conditional unique index
CREATE UNIQUE INDEX IF NOT EXISTS payment_email_queue_org_id_gmail_message_id_key ON payment_email_queue (org_id, gmail_message_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: get user's org_id from profiles
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT org_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
$$;

-- Helper: check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    );
$$;

-- Helper: check if user is admin of an org
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND org_id = _org_id AND role = 'admin'
    );
$$;

-- Helper: check if user is member of an org
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND org_id = _org_id
    );
$$;

-- Trigger function: update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Trigger function: update tenant_config timestamp
CREATE OR REPLACE FUNCTION public.update_tenant_config_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Trigger function: update topic stats on message insert/delete
CREATE OR REPLACE FUNCTION public.update_topic_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE discussion_topics
    SET
        message_count = (SELECT COUNT(*) FROM discussion_messages WHERE topic_id = NEW.topic_id),
        last_activity_at = NOW()
    WHERE id = NEW.topic_id;
    RETURN NEW;
END;
$$;

-- Auth trigger: create profile for new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Generate bottle UID from sequence
CREATE OR REPLACE FUNCTION public.generate_bottle_uid()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

-- Trigger function: auto-create bottles when a lot is inserted
CREATE OR REPLACE FUNCTION public.create_bottles_for_lot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

-- Auto-link contact by email on signup
CREATE OR REPLACE FUNCTION public.auto_link_contact_by_email(p_user_id uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_contact record;
  v_profile_id uuid;
  v_contact_role text;
BEGIN
  SELECT id, org_id, type, assigned_rep_id
  INTO v_contact
  FROM contacts
  WHERE lower(email) = lower(p_email)
    AND linked_user_id IS NULL
    AND org_id IS NOT NULL
  LIMIT 1;

  IF v_contact IS NULL THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  SELECT id INTO v_profile_id FROM profiles WHERE user_id = p_user_id;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('matched', false, 'error', 'profile_not_found');
  END IF;

  v_contact_role := CASE WHEN v_contact.type = 'partner' THEN 'sales_rep' ELSE 'client' END;

  UPDATE profiles SET
    org_id = v_contact.org_id,
    role = v_contact_role
  WHERE id = v_profile_id;

  INSERT INTO user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_contact.org_id, v_contact_role::app_role)
  ON CONFLICT (user_id, org_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE contacts SET linked_user_id = p_user_id WHERE id = v_contact.id;

  RETURN jsonb_build_object(
    'matched', true,
    'contact_id', v_contact.id,
    'org_id', v_contact.org_id,
    'role', v_contact_role
  );
END;
$$;

-- Link referral (customer or partner signup via referral)
CREATE OR REPLACE FUNCTION public.link_referral(p_user_id uuid, p_email text, p_full_name text, p_referrer_profile_id uuid, p_role text DEFAULT 'customer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_org_id UUID;
  v_is_partner BOOLEAN;
  v_app_role TEXT;
  v_contact_type contact_type;
  v_existing_contact UUID;
BEGIN
  SELECT id, org_id INTO v_referrer_id, v_referrer_org_id
  FROM profiles
  WHERE id = p_referrer_profile_id;

  IF v_referrer_id IS NULL OR v_referrer_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referrer not found or has no organization');
  END IF;

  v_is_partner := (p_role = 'partner');
  v_app_role := CASE WHEN v_is_partner THEN 'sales_rep' ELSE 'client' END;
  v_contact_type := CASE WHEN v_is_partner THEN 'partner'::contact_type ELSE 'customer'::contact_type END;

  UPDATE profiles SET
    org_id = v_referrer_org_id,
    parent_rep_id = v_referrer_id,
    role = v_app_role,
    price_multiplier = CASE WHEN v_is_partner THEN price_multiplier ELSE 0.80 END,
    pricing_mode = CASE WHEN v_is_partner THEN 'cost_multiplier' ELSE 'percentage' END,
    cost_plus_markup = CASE WHEN v_is_partner THEN 2.0 ELSE cost_plus_markup END,
    partner_tier = CASE WHEN v_is_partner THEN 'associate' ELSE partner_tier END,
    commission_rate = CASE WHEN v_is_partner THEN 0.075 ELSE commission_rate END,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO user_roles (user_id, org_id, role)
  VALUES (p_user_id, v_referrer_org_id, v_app_role::app_role)
  ON CONFLICT (user_id, org_id)
  DO UPDATE SET role = EXCLUDED.role;

  SELECT id INTO v_existing_contact
  FROM contacts
  WHERE linked_user_id = p_user_id AND org_id = v_referrer_org_id
  LIMIT 1;

  IF v_existing_contact IS NULL THEN
    INSERT INTO contacts (name, email, type, org_id, assigned_rep_id, linked_user_id)
    VALUES (
      COALESCE(NULLIF(p_full_name, ''), p_email),
      p_email,
      v_contact_type,
      v_referrer_org_id,
      v_referrer_id,
      p_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'type', CASE WHEN v_is_partner THEN 'partner' ELSE 'customer' END
  );
END;
$$;

-- Bottle stats for current user's org
CREATE OR REPLACE FUNCTION public.get_bottle_stats()
 RETURNS TABLE(status text, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.status::text,
        COUNT(*) as count
    FROM
        public.bottles b
    WHERE
        b.org_id = public.get_user_org_id(auth.uid())
    GROUP BY
        b.status;
END;
$$;

-- Peptide stock counts for current user's org
CREATE OR REPLACE FUNCTION public.get_peptide_stock_counts()
 RETURNS TABLE(peptide_id uuid, stock_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.peptide_id,
        COUNT(b.id) as stock_count
    FROM
        public.bottles b
    JOIN
        public.lots l ON b.lot_id = l.id
    WHERE
        b.status = 'in_stock'
        AND b.org_id = public.get_user_org_id(auth.uid())
    GROUP BY
        l.peptide_id;
END;
$$;

-- Inventory valuation
CREATE OR REPLACE FUNCTION public.get_inventory_valuation()
 RETURNS TABLE(total_value numeric, item_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(l.cost_per_unit), 0) as total_value,
        COUNT(b.id) as item_count
    FROM
        public.bottles b
    JOIN
        public.lots l ON b.lot_id = l.id
    WHERE
        b.status = 'in_stock'
        AND b.org_id = public.get_user_org_id(auth.uid());
END;
$$;

-- Get partner downline (recursive)
CREATE OR REPLACE FUNCTION public.get_partner_downline(root_id uuid)
 RETURNS TABLE(id uuid, full_name text, email text, partner_tier text, total_sales numeric, depth integer, path uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    resolved_profile_id uuid;
BEGIN
    SELECT p.id INTO resolved_profile_id
    FROM profiles p
    WHERE p.user_id = root_id;

    IF resolved_profile_id IS NULL THEN
        resolved_profile_id := root_id;
    END IF;

    RETURN QUERY
    WITH RECURSIVE downline AS (
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            1 as depth,
            ARRAY[p.id] as path
        FROM profiles p
        WHERE p.parent_partner_id = resolved_profile_id
           OR p.parent_rep_id = resolved_profile_id
        UNION ALL
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.partner_tier,
            d.depth + 1,
            d.path || p.id
        FROM profiles p
        JOIN downline d ON (p.parent_partner_id = d.id OR p.parent_rep_id = d.id)
        WHERE d.depth < 5
          AND NOT (p.id = ANY(d.path))
    ),
    partner_sales AS (
        SELECT
            so.rep_id,
            COALESCE(SUM(so.total_amount), 0) as vol
        FROM sales_orders so
        WHERE so.rep_id IN (SELECT dl.id FROM downline dl)
          AND so.status != 'cancelled'
        GROUP BY so.rep_id
    )
    SELECT
        d.id,
        d.full_name,
        d.email,
        d.partner_tier,
        COALESCE(ps.vol, 0.00)::numeric as total_sales,
        d.depth,
        d.path
    FROM downline d
    LEFT JOIN partner_sales ps ON ps.rep_id = d.id;
END;
$$;

-- Get household members
CREATE OR REPLACE FUNCTION public.get_household_members(p_contact_id uuid)
 RETURNS TABLE(id uuid, name text, email text, household_role text, linked_user_id uuid, claim_token uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.name,
    c.email,
    c.household_role,
    c.linked_user_id,
    c.claim_token
  FROM public.contacts c
  WHERE c.household_id = (
    SELECT household_id FROM public.contacts WHERE id = p_contact_id
  )
  AND c.household_id IS NOT NULL
  ORDER BY
    CASE WHEN c.household_role = 'owner' THEN 0 ELSE 1 END,
    c.created_at ASC;
$$;

-- Create household for a contact
CREATE OR REPLACE FUNCTION public.create_household(p_owner_contact_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_household_id UUID;
BEGIN
  SELECT household_id INTO v_household_id
  FROM public.contacts
  WHERE id = p_owner_contact_id;

  IF v_household_id IS NOT NULL THEN
    RETURN v_household_id;
  END IF;

  v_household_id := p_owner_contact_id;

  UPDATE public.contacts
  SET household_id   = v_household_id,
      household_role = 'owner'
  WHERE id = p_owner_contact_id;

  RETURN v_household_id;
END;
$$;

-- Add household member
CREATE OR REPLACE FUNCTION public.add_household_member(p_owner_contact_id uuid, p_member_name text, p_member_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_household_id UUID;
  v_org_id UUID;
  v_new_contact_id UUID;
BEGIN
  SELECT household_id, org_id
  INTO v_household_id, v_org_id
  FROM public.contacts
  WHERE id = p_owner_contact_id;

  IF v_household_id IS NULL THEN
    v_household_id := public.create_household(p_owner_contact_id);
  END IF;

  INSERT INTO public.contacts (
    name, email, org_id, type, tier,
    household_id, household_role
  )
  VALUES (
    p_member_name,
    p_member_email,
    v_org_id,
    'customer',
    'family',
    v_household_id,
    'member'
  )
  RETURNING id INTO v_new_contact_id;

  RETURN v_new_contact_id;
END;
$$;

-- Process 3-tier commission on a sale
CREATE OR REPLACE FUNCTION public.process_sale_commission(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_order record;
    v_rep_id uuid;
    v_parent_rep_id uuid;
    v_grandparent_rep_id uuid;
    v_rep_rate numeric;
    v_parent_rate numeric;
    v_grandparent_rate numeric;
    v_net_sale numeric;
    v_amount_paid numeric;
    v_amount_unpaid numeric;
    v_comm_paid numeric;
    v_comm_unpaid numeric;
    v_override_paid numeric;
    v_override_unpaid numeric;
    v_gp_override_paid numeric;
    v_gp_override_unpaid numeric;
BEGIN
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
    IF EXISTS (SELECT 1 FROM public.commissions WHERE sale_id = p_sale_id) THEN RETURN; END IF;

    v_rep_id := v_order.rep_id;
    IF v_rep_id IS NULL THEN
        SELECT id, parent_rep_id, commission_rate INTO v_rep_id, v_parent_rep_id, v_rep_rate
        FROM public.profiles WHERE id = v_order.client_id AND role IN ('sales_rep', 'admin', 'staff');
    ELSE
        SELECT parent_rep_id, commission_rate INTO v_parent_rep_id, v_rep_rate
        FROM public.profiles WHERE id = v_rep_id;
    END IF;

    IF v_rep_id IS NULL OR v_rep_rate IS NULL OR v_rep_rate <= 0 THEN RETURN; END IF;

    v_net_sale := COALESCE(v_order.total_amount, 0);
    v_amount_paid := COALESCE(v_order.amount_paid, 0);
    v_amount_unpaid := v_net_sale - v_amount_paid;
    IF v_amount_unpaid < 0 THEN v_amount_unpaid := 0; END IF;

    -- Direct rep commission
    v_comm_paid := ROUND(v_amount_paid * v_rep_rate, 2);
    v_comm_unpaid := ROUND(v_amount_unpaid * v_rep_rate, 2);
    IF v_comm_paid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
        VALUES (p_sale_id, v_rep_id, v_comm_paid, v_rep_rate, 'direct', 'available');
    END IF;
    IF v_comm_unpaid > 0 THEN
        INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
        VALUES (p_sale_id, v_rep_id, v_comm_unpaid, v_rep_rate, 'direct', 'pending');
    END IF;

    -- 2nd tier: parent override
    IF v_parent_rep_id IS NOT NULL THEN
        SELECT commission_rate, parent_rep_id INTO v_parent_rate, v_grandparent_rep_id
        FROM public.profiles WHERE id = v_parent_rep_id;
        IF v_parent_rate IS NOT NULL AND v_parent_rate > 0 THEN
            v_override_paid := ROUND(v_amount_paid * v_parent_rate, 2);
            v_override_unpaid := ROUND(v_amount_unpaid * v_parent_rate, 2);
            IF v_override_paid > 0 THEN
                INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
                VALUES (p_sale_id, v_parent_rep_id, v_override_paid, v_parent_rate, 'override', 'available');
            END IF;
            IF v_override_unpaid > 0 THEN
                INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
                VALUES (p_sale_id, v_parent_rep_id, v_override_unpaid, v_parent_rate, 'override', 'pending');
            END IF;
        END IF;

        -- 3rd tier: grandparent override
        IF v_grandparent_rep_id IS NOT NULL THEN
            SELECT commission_rate INTO v_grandparent_rate FROM public.profiles WHERE id = v_grandparent_rep_id;
            IF v_grandparent_rate IS NOT NULL AND v_grandparent_rate > 0 THEN
                v_gp_override_paid := ROUND(v_amount_paid * v_grandparent_rate, 2);
                v_gp_override_unpaid := ROUND(v_amount_unpaid * v_grandparent_rate, 2);
                IF v_gp_override_paid > 0 THEN
                    INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
                    VALUES (p_sale_id, v_grandparent_rep_id, v_gp_override_paid, v_grandparent_rate, 'third_tier_override', 'available');
                END IF;
                IF v_gp_override_unpaid > 0 THEN
                    INSERT INTO public.commissions (sale_id, partner_id, amount, commission_rate, type, status)
                    VALUES (p_sale_id, v_grandparent_rep_id, v_gp_override_unpaid, v_grandparent_rate, 'third_tier_override', 'pending');
                END IF;
            END IF;
        END IF;
    END IF;
END;
$$;

-- Convert commission to store credit
CREATE OR REPLACE FUNCTION public.convert_commission_to_credit(commission_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_amount decimal;
  v_partner_id uuid;
  v_status text;
BEGIN
  SELECT amount, partner_id, status INTO v_amount, v_partner_id, v_status
  FROM public.commissions WHERE id = commission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF;
  IF v_status != 'pending' THEN RAISE EXCEPTION 'Commission is not pending'; END IF;
  UPDATE public.commissions SET status = 'paid' WHERE id = commission_id;
  UPDATE public.profiles SET credit_balance = COALESCE(credit_balance, 0) + v_amount WHERE id = v_partner_id;
END;
$$;

-- Apply available commissions to unpaid movements
CREATE OR REPLACE FUNCTION public.apply_commissions_to_owed(partner_profile_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_total_applied decimal := 0;
  v_remaining decimal := 0;
  v_movement record;
  v_contact_id uuid;
  v_apply decimal;
  v_movements_paid int := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_remaining
  FROM commissions WHERE partner_id = partner_profile_id AND status = 'available';
  IF v_remaining <= 0 THEN
    RETURN json_build_object('applied', 0, 'movements_paid', 0, 'remaining_credit', 0);
  END IF;

  UPDATE commissions SET status = 'paid'
  WHERE partner_id = partner_profile_id AND status = 'available';

  SELECT c.id INTO v_contact_id
  FROM contacts c JOIN profiles p ON p.user_id = c.linked_user_id
  WHERE p.id = partner_profile_id LIMIT 1;

  IF v_contact_id IS NULL THEN
    UPDATE profiles SET credit_balance = COALESCE(credit_balance, 0) + v_remaining
    WHERE id = partner_profile_id;
    RETURN json_build_object('applied', 0, 'movements_paid', 0, 'remaining_credit', v_remaining);
  END IF;

  FOR v_movement IN
    SELECT m.id,
           COALESCE(SUM(mi.price_at_sale), 0) - COALESCE(m.discount_amount, 0) - COALESCE(m.amount_paid, 0) as owed,
           m.amount_paid
    FROM movements m
    JOIN movement_items mi ON mi.movement_id = m.id
    WHERE m.contact_id = v_contact_id
      AND m.payment_status IN ('unpaid', 'partial')
    GROUP BY m.id, m.discount_amount, m.amount_paid
    HAVING COALESCE(SUM(mi.price_at_sale), 0) - COALESCE(m.discount_amount, 0) - COALESCE(m.amount_paid, 0) > 0
    ORDER BY m.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_movement.owed);
    UPDATE movements
    SET amount_paid = COALESCE(amount_paid, 0) + v_apply,
        payment_status = CASE
          WHEN COALESCE(amount_paid, 0) + v_apply >= (
            SELECT COALESCE(SUM(mi2.price_at_sale), 0) FROM movement_items mi2 WHERE mi2.movement_id = movements.id
          ) - COALESCE(discount_amount, 0) THEN 'paid'
          ELSE 'partial'
        END,
        notes = COALESCE(notes, '') || E'\nCommission applied: $' || v_apply::text || ' on ' || NOW()::date::text
    WHERE id = v_movement.id;
    v_remaining := v_remaining - v_apply;
    v_total_applied := v_total_applied + v_apply;
    v_movements_paid := v_movements_paid + 1;
  END LOOP;

  IF v_remaining > 0 THEN
    UPDATE profiles SET credit_balance = COALESCE(credit_balance, 0) + v_remaining
    WHERE id = partner_profile_id;
  END IF;

  RETURN json_build_object(
    'applied', v_total_applied,
    'movements_paid', v_movements_paid,
    'remaining_credit', v_remaining
  );
END;
$$;

-- Pay order with store credit
CREATE OR REPLACE FUNCTION public.pay_order_with_credit(p_order_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_credit_balance decimal;
  v_order_total decimal;
  v_org_id uuid;
BEGIN
  SELECT credit_balance, org_id INTO v_credit_balance, v_org_id
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;

  SELECT total_amount INTO v_order_total FROM public.sales_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_credit_balance < v_order_total THEN
    RAISE EXCEPTION 'Insufficient credit balance';
  END IF;

  UPDATE public.profiles SET credit_balance = credit_balance - v_order_total WHERE id = p_user_id;
  UPDATE public.sales_orders SET
    status = 'submitted',
    payment_status = 'paid',
    amount_paid = v_order_total,
    payment_method = 'store_credit',
    payment_date = now()
  WHERE id = p_order_id;
END;
$$;

-- Vector similarity search for RAG
CREATE OR REPLACE FUNCTION public.match_documents(query_embedding vector, match_threshold double precision, match_count integer, filter jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    embeddings.id,
    embeddings.content,
    embeddings.metadata,
    1 - (embeddings.embedding <=> query_embedding) as similarity
  FROM embeddings
  WHERE 1 - (embeddings.embedding <=> query_embedding) > match_threshold
    AND (filter = '{}'::jsonb OR embeddings.metadata @> filter)
  ORDER BY embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Exec SQL (admin utility)
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER update_bottles_updated_at BEFORE UPDATE ON bottles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_requests_modtime BEFORE UPDATE ON client_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_lots_updated_at BEFORE UPDATE ON lots FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_peptides_updated_at BEFORE UPDATE ON peptides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE TRIGGER trigger_create_bottles_for_lot AFTER INSERT ON lots FOR EACH ROW EXECUTE FUNCTION create_bottles_for_lot();
CREATE OR REPLACE TRIGGER trigger_update_topic_stats AFTER INSERT OR DELETE ON discussion_messages FOR EACH ROW EXECUTE FUNCTION update_topic_stats();
CREATE OR REPLACE TRIGGER trigger_tenant_config_updated BEFORE UPDATE ON tenant_config FOR EACH ROW EXECUTE FUNCTION update_tenant_config_timestamp();

-- Auth trigger (runs on auth.users table — must be set up via Supabase dashboard or migration)
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────
-- admin_ai_logs
CREATE INDEX IF NOT EXISTS idx_admin_ai_logs_errors ON admin_ai_logs (created_at DESC) WHERE (error IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_admin_ai_logs_user_time ON admin_ai_logs (user_id, created_at DESC);

-- ai tables
CREATE INDEX IF NOT EXISTS idx_ai_convos_user ON ai_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_docs_user ON ai_documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_user ON ai_learned_insights (user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_msgs_convo ON ai_messages (conversation_id, created_at);

-- audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_org_id ON audit_log (org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log (table_name, record_id);

-- bottles
CREATE INDEX IF NOT EXISTS idx_bottles_lot_id ON bottles (lot_id);
CREATE INDEX IF NOT EXISTS idx_bottles_org_id ON bottles (org_id);
CREATE INDEX IF NOT EXISTS idx_bottles_status ON bottles (status);
CREATE INDEX IF NOT EXISTS idx_bottles_uid ON bottles (uid);

-- client tables
CREATE INDEX IF NOT EXISTS idx_client_inventory_protocol_item ON client_inventory (protocol_item_id);
CREATE INDEX IF NOT EXISTS idx_client_requests_context ON client_requests (context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON client_requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_user ON client_requests (user_id);

-- commissions
CREATE INDEX IF NOT EXISTS idx_commissions_partner ON commissions (partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_sale ON commissions (sale_id);

-- contact_notes
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact_id ON contact_notes (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_org_id ON contact_notes (org_id);

-- contacts
CREATE INDEX IF NOT EXISTS contacts_claim_token_idx ON contacts (claim_token);
CREATE INDEX IF NOT EXISTS contacts_household_id_idx ON contacts (household_id);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_rep ON contacts (assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON contacts (org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts (source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_woo_customer_org ON contacts (org_id, woo_customer_id) WHERE (woo_customer_id IS NOT NULL);

-- discussion tables
CREATE INDEX IF NOT EXISTS idx_discussion_messages_topic ON discussion_messages (topic_id);
CREATE INDEX IF NOT EXISTS idx_discussion_topics_activity ON discussion_topics (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussion_topics_theme ON discussion_topics (theme_id);

-- embeddings (vector index)
CREATE INDEX IF NOT EXISTS embeddings_embedding_idx ON embeddings USING hnsw (embedding vector_cosine_ops);

-- favorite_foods
CREATE INDEX IF NOT EXISTS favorite_foods_user_id_idx ON favorite_foods (user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_foods_templates ON favorite_foods (user_id, is_template, meal_type) WHERE (is_template = true);

-- lots
CREATE INDEX IF NOT EXISTS idx_lots_org_id ON lots (org_id);
CREATE INDEX IF NOT EXISTS idx_lots_peptide_id ON lots (peptide_id);

-- movements
CREATE INDEX IF NOT EXISTS idx_movement_items_bottle_id ON movement_items (bottle_id);
CREATE INDEX IF NOT EXISTS idx_movement_items_movement_id ON movement_items (movement_id);
CREATE INDEX IF NOT EXISTS idx_movements_contact_id ON movements (contact_id);
CREATE INDEX IF NOT EXISTS idx_movements_org_id ON movements (org_id);
CREATE INDEX IF NOT EXISTS idx_movements_status ON movements (status);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_group_id ON orders (order_group_id);
CREATE INDEX IF NOT EXISTS idx_orders_org_id ON orders (org_id);
CREATE INDEX IF NOT EXISTS idx_orders_peptide_id ON orders (peptide_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

-- partner tables
CREATE INDEX IF NOT EXISTS idx_partner_chat_user ON partner_chat_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_suggestions_org ON partner_suggestions (org_id, status, created_at DESC);

-- payment_email_queue
CREATE INDEX IF NOT EXISTS idx_payment_queue_created ON payment_email_queue (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_queue_status ON payment_email_queue (org_id, status);

-- peptides
CREATE INDEX IF NOT EXISTS idx_peptides_org_id ON peptides (org_id);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON profiles (org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_parent ON profiles (parent_partner_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id);

-- resources
CREATE INDEX IF NOT EXISTS idx_resource_views_resource ON resource_views (resource_id);
CREATE INDEX IF NOT EXISTS idx_resources_featured ON resources (is_featured) WHERE (is_featured = true);
CREATE INDEX IF NOT EXISTS idx_resources_view_count ON resources (view_count DESC);

-- sales_orders
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_client ON sales_orders (client_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_order_source ON sales_orders (order_source);
CREATE INDEX IF NOT EXISTS idx_sales_orders_org ON sales_orders (org_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_psifi_session ON sales_orders (psifi_session_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_rep ON sales_orders (rep_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_rep_id ON sales_orders (rep_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_shipping_pending ON sales_orders (status, shipping_status) WHERE ((status = 'fulfilled') AND (shipping_status = 'pending'));
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_woo_order_id ON sales_orders (woo_order_id) WHERE (woo_order_id IS NOT NULL);

-- user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_org_id ON user_roles (org_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);

-- water_logs
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs (user_id, logged_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY — Enable on all tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE admin_ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_learned_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_composition_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bottles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_macro_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE movement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE peptide_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE peptide_suggested_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE peptides ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- admin_ai_logs
CREATE POLICY "Admin can read all logs" ON admin_ai_logs FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY(ARRAY['admin'::app_role, 'staff'::app_role])));
CREATE POLICY "Service role can insert logs" ON admin_ai_logs FOR INSERT WITH CHECK (true);

-- admin_chat_messages
CREATE POLICY "Users manage own messages" ON admin_chat_messages FOR ALL USING (auth.uid() = user_id);

-- ai_conversations
CREATE POLICY "Users own conversations" ON ai_conversations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role conversations" ON ai_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ai_documents
CREATE POLICY "Users own documents" ON ai_documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role documents" ON ai_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ai_health_profiles
CREATE POLICY "Users own profile" ON ai_health_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role profiles" ON ai_health_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ai_learned_insights
CREATE POLICY "Users own insights" ON ai_learned_insights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role insights" ON ai_learned_insights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ai_messages
CREATE POLICY "Users own messages" ON ai_messages FOR ALL USING (conversation_id IN (SELECT ai_conversations.id FROM ai_conversations WHERE ai_conversations.user_id = auth.uid())) WITH CHECK (conversation_id IN (SELECT ai_conversations.id FROM ai_conversations WHERE ai_conversations.user_id = auth.uid()));
CREATE POLICY "Service role messages" ON ai_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- audit_log
CREATE POLICY "Users can view audit log in their org" ON audit_log FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "System can insert audit log" ON audit_log FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- automation_modules
CREATE POLICY "org_access_automation_modules" ON automation_modules FOR ALL USING (org_id = get_user_org_id(auth.uid()));

-- body_composition_logs
CREATE POLICY "Users can manage their own body composition logs" ON body_composition_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- bottles
CREATE POLICY "Users can view bottles in their org" ON bottles FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can insert bottles in their org" ON bottles FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can update bottles in their org" ON bottles FOR UPDATE TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can delete bottles in their org" ON bottles FOR DELETE TO authenticated USING (org_id = get_user_org_id(auth.uid()));

-- client_daily_logs
CREATE POLICY "Users can view own logs" ON client_daily_logs FOR SELECT USING (contact_id IN (SELECT contacts.id FROM contacts WHERE contacts.linked_user_id = auth.uid()));
CREATE POLICY "Users can manage own logs" ON client_daily_logs FOR ALL USING (contact_id IN (SELECT contacts.id FROM contacts WHERE contacts.linked_user_id = auth.uid()));

-- client_inventory
CREATE POLICY "Client inventory viewable by owners and staff" ON client_inventory FOR SELECT USING ((contact_id IN (SELECT contacts.id FROM contacts WHERE contacts.linked_user_id = auth.uid())) OR (EXISTS (SELECT 1 FROM profiles p JOIN contacts c ON c.org_id = p.org_id WHERE p.user_id = auth.uid() AND c.id = client_inventory.contact_id AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)))));
CREATE POLICY "Client inventory insertable by staff" ON client_inventory FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles p JOIN contacts c ON c.org_id = p.org_id WHERE p.user_id = auth.uid() AND c.id = client_inventory.contact_id AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))));
CREATE POLICY "Client inventory updatable by staff" ON client_inventory FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles p JOIN contacts c ON c.org_id = p.org_id WHERE p.user_id = auth.uid() AND c.id = client_inventory.contact_id AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))));
CREATE POLICY "Client inventory deletable by staff" ON client_inventory FOR DELETE USING (EXISTS (SELECT 1 FROM profiles p JOIN contacts c ON c.org_id = p.org_id WHERE p.user_id = auth.uid() AND c.id = client_inventory.contact_id AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))));
CREATE POLICY "Clients can update own inventory" ON client_inventory FOR UPDATE USING (contact_id IN (SELECT contacts.id FROM contacts WHERE contacts.linked_user_id = auth.uid()));
CREATE POLICY "Household members can view shared inventory" ON client_inventory FOR SELECT USING (EXISTS (SELECT 1 FROM contacts viewer JOIN contacts owner_c ON owner_c.id = client_inventory.contact_id WHERE viewer.linked_user_id = auth.uid() AND viewer.household_id IS NOT NULL AND viewer.household_id = owner_c.household_id AND viewer.id <> owner_c.id));
CREATE POLICY "Household members can update shared inventory" ON client_inventory FOR UPDATE USING (EXISTS (SELECT 1 FROM contacts viewer JOIN contacts owner_c ON owner_c.id = client_inventory.contact_id WHERE viewer.linked_user_id = auth.uid() AND viewer.household_id IS NOT NULL AND viewer.household_id = owner_c.household_id));

-- client_requests
CREATE POLICY "Clients view own" ON client_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Clients create own" ON client_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Clients update pending" ON client_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pending'::request_status);
CREATE POLICY "Admins view all" ON client_requests FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Admins manage all" ON client_requests FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Users can delete own requests" ON client_requests FOR DELETE USING (auth.uid() = user_id);

-- client_supplements
CREATE POLICY "Users can view own supplements" ON client_supplements FOR SELECT USING (contact_id IN (SELECT contacts.id FROM contacts WHERE contacts.linked_user_id = auth.uid()));
CREATE POLICY "Users can manage own supplements" ON client_supplements FOR ALL USING (contact_id IN (SELECT contacts.id FROM contacts WHERE contacts.linked_user_id = auth.uid()));

-- commissions
CREATE POLICY "Partners view own commissions" ON commissions FOR SELECT USING (partner_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Admins view all commissions" ON commissions FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'));

-- contact_notes
CREATE POLICY "Users can view notes in their org" ON contact_notes FOR SELECT USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can insert notes in their org" ON contact_notes FOR INSERT WITH CHECK (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can delete notes in their org" ON contact_notes FOR DELETE USING (org_id = get_user_org_id(auth.uid()));

-- contacts
CREATE POLICY "Users can view contacts in their org" ON contacts FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can view own contact link" ON contacts FOR SELECT USING (auth.uid() = linked_user_id);
CREATE POLICY "Staff and admins can insert contacts" ON contacts FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));
CREATE POLICY "Staff and admins can update contacts" ON contacts FOR UPDATE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));
CREATE POLICY "Admins can delete contacts" ON contacts FOR DELETE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- daily_hours
CREATE POLICY "Users can manage own hours" ON daily_hours FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all hours" ON daily_hours FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));

-- daily_macro_goals
CREATE POLICY "Users can manage their own macro goals" ON daily_macro_goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- discussion_messages
CREATE POLICY "Messages viewable by all" ON discussion_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Messages insertable by users" ON discussion_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Messages updatable by owner" ON discussion_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Messages deletable by owner" ON discussion_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- discussion_topics
CREATE POLICY "Topics viewable by all" ON discussion_topics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Topics insertable by users" ON discussion_topics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Topics updatable by owner" ON discussion_topics FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Topics deletable by owner" ON discussion_topics FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- embeddings
CREATE POLICY "Enable read access for all users" ON embeddings FOR SELECT USING (true);
CREATE POLICY "Enable insert for service role" ON embeddings FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role has full access" ON embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Clients can read global data" ON embeddings FOR SELECT TO authenticated USING ((metadata->>'type') = 'global');
CREATE POLICY "Clients can read own data" ON embeddings FOR SELECT TO authenticated USING ((metadata->>'client_id') = (auth.uid())::text);
CREATE POLICY "Clients can insert own data" ON embeddings FOR INSERT TO authenticated WITH CHECK ((metadata->>'client_id') = (auth.uid())::text);

-- expenses
CREATE POLICY "Authenticated staff can view expenses" ON expenses FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Admins can insert expenses" ON expenses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
CREATE POLICY "Admins can update expenses" ON expenses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete expenses" ON expenses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- favorite_foods
CREATE POLICY "Users can view their own favorites" ON favorite_foods FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own favorites" ON favorite_foods FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own favorites" ON favorite_foods FOR DELETE USING (auth.uid() = user_id);

-- lots
CREATE POLICY "Users can view lots in their org" ON lots FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can insert lots in their org" ON lots FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can update lots in their org" ON lots FOR UPDATE TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can delete lots in their org" ON lots FOR DELETE TO authenticated USING (org_id = get_user_org_id(auth.uid()));

-- meal_logs
CREATE POLICY "Users can view their own meal logs" ON meal_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own meal logs" ON meal_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own meal logs" ON meal_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own meal logs" ON meal_logs FOR DELETE USING (auth.uid() = user_id);

-- movement_items
CREATE POLICY "Users can view movement items in their org" ON movement_items FOR SELECT TO authenticated USING (movement_id IN (SELECT movements.id FROM movements WHERE movements.org_id = get_user_org_id(auth.uid())));
CREATE POLICY "Staff and admins can insert movement items" ON movement_items FOR INSERT TO authenticated WITH CHECK ((movement_id IN (SELECT movements.id FROM movements WHERE movements.org_id = get_user_org_id(auth.uid()))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));

-- movements
CREATE POLICY "Users can view movements in their org" ON movements FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Staff and admins can insert movements" ON movements FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));
CREATE POLICY "Staff and admins can update movements" ON movements FOR UPDATE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));
CREATE POLICY "Admins can delete movements" ON movements FOR DELETE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- newsletter_subscribers
CREATE POLICY "Allow public inserts" ON newsletter_subscribers FOR INSERT TO anon WITH CHECK (true);

-- notifications
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users and admins can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- orders
CREATE POLICY "Users can view orders in their org" ON orders FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can insert orders in their org" ON orders FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Staff and admins can update orders" ON orders FOR UPDATE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));
CREATE POLICY "Admins can delete orders" ON orders FOR DELETE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- organizations
CREATE POLICY "Users can view their organization" ON organizations FOR SELECT TO authenticated USING (is_org_member(auth.uid(), id));
CREATE POLICY "Admins can update their organization" ON organizations FOR UPDATE TO authenticated USING (is_org_admin(auth.uid(), id));
CREATE POLICY "Authenticated users without org can create organization" ON organizations FOR INSERT TO authenticated WITH CHECK (NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.org_id IS NOT NULL));

-- partner_chat_messages
CREATE POLICY "own_messages" ON partner_chat_messages FOR ALL USING (user_id = auth.uid());

-- partner_suggestions
CREATE POLICY "partner_own_suggestions" ON partner_suggestions FOR SELECT USING (partner_id = auth.uid());
CREATE POLICY "partner_insert_suggestions" ON partner_suggestions FOR INSERT WITH CHECK (partner_id = auth.uid());
CREATE POLICY "admin_all_suggestions" ON partner_suggestions FOR ALL USING (org_id = get_user_org_id(auth.uid()));

-- payment_email_queue
CREATE POLICY "org_access_payment_email_queue" ON payment_email_queue FOR ALL USING (org_id = get_user_org_id(auth.uid()));

-- peptide_pricing
CREATE POLICY "Users can view pricing in their org" ON peptide_pricing FOR SELECT TO authenticated USING (peptide_id IN (SELECT peptides.id FROM peptides WHERE peptides.org_id = get_user_org_id(auth.uid())));
CREATE POLICY "Staff and admins can manage pricing" ON peptide_pricing FOR ALL TO authenticated USING ((peptide_id IN (SELECT peptides.id FROM peptides WHERE peptides.org_id = get_user_org_id(auth.uid()))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));

-- peptide_suggested_supplements
CREATE POLICY "Public/Authenticated Read Access" ON peptide_suggested_supplements FOR SELECT USING (true);
CREATE POLICY "Admins can manage suggestions" ON peptide_suggested_supplements FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'));

-- peptides
CREATE POLICY "Users can view peptides in their org" ON peptides FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Staff and admins can insert peptides" ON peptides FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));
CREATE POLICY "Staff and admins can update peptides" ON peptides FOR UPDATE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));
CREATE POLICY "Admins can delete peptides" ON peptides FOR DELETE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- profiles
CREATE POLICY "Users can view profiles in their org" ON profiles FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can update any profile" ON profiles FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'));

-- protocol_feedback
CREATE POLICY "Users can view own feedback" ON protocol_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feedback" ON protocol_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable update access for authenticated users" ON protocol_feedback FOR UPDATE USING (auth.role() = 'authenticated');

-- protocol_items
CREATE POLICY "Users can view protocol items in their org" ON protocol_items FOR SELECT TO authenticated USING (protocol_id IN (SELECT protocols.id FROM protocols WHERE protocols.org_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert protocol items in their org" ON protocol_items FOR INSERT TO authenticated WITH CHECK (protocol_id IN (SELECT protocols.id FROM protocols WHERE protocols.org_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can update protocol items in their org" ON protocol_items FOR UPDATE TO authenticated USING (protocol_id IN (SELECT protocols.id FROM protocols WHERE protocols.org_id = get_user_org_id(auth.uid())));
CREATE POLICY "Admins can delete protocol items" ON protocol_items FOR DELETE TO authenticated USING ((protocol_id IN (SELECT protocols.id FROM protocols WHERE protocols.org_id = get_user_org_id(auth.uid()))) AND has_role(auth.uid(), 'admin'::app_role));

-- protocol_logs
CREATE POLICY "Users can view their organization's logs" ON protocol_logs FOR SELECT USING (EXISTS (SELECT 1 FROM protocol_items pi JOIN protocols p ON pi.protocol_id = p.id JOIN profiles pr ON pr.org_id = p.org_id WHERE pi.id = protocol_logs.protocol_item_id AND pr.user_id = auth.uid()));
CREATE POLICY "Users can insert logs for their organization" ON protocol_logs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM protocol_items pi JOIN protocols p ON pi.protocol_id = p.id JOIN profiles pr ON pr.org_id = p.org_id WHERE pi.id = protocol_logs.protocol_item_id AND pr.user_id = auth.uid()));

-- protocol_supplements
CREATE POLICY "Clients can view their own protocol supplements" ON protocol_supplements FOR SELECT USING ((EXISTS (SELECT 1 FROM protocols p WHERE p.id = protocol_supplements.protocol_id AND p.contact_id = auth.uid())) OR (EXISTS (SELECT 1 FROM protocols p JOIN contacts c ON p.contact_id = c.id WHERE p.id = protocol_supplements.protocol_id AND c.linked_user_id = auth.uid())));
CREATE POLICY "Admins can manage all protocol supplements" ON protocol_supplements FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- protocols
CREATE POLICY "Users can view protocols in their org" ON protocols FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can insert protocols in their org" ON protocols FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can update protocols in their org" ON protocols FOR UPDATE TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can delete protocols" ON protocols FOR DELETE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- request_replies
CREATE POLICY "Users can view replies on accessible requests" ON request_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own replies" ON request_replies FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own replies" ON request_replies FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own replies" ON request_replies FOR DELETE TO authenticated USING (user_id = auth.uid());

-- resource_comments
CREATE POLICY "Comments are viewable by authenticated users" ON resource_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create comments" ON resource_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON resource_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON resource_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- resource_themes
CREATE POLICY "Themes are viewable by everyone" ON resource_themes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage themes" ON resource_themes FOR ALL TO authenticated USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- resource_views
CREATE POLICY "Views viewable by authenticated" ON resource_views FOR SELECT TO authenticated USING (true);
CREATE POLICY "Views insertable by authenticated" ON resource_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- resources
CREATE POLICY "Enable read access for all authenticated users" ON resources FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert access for authenticated users" ON resources FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update access for authenticated users" ON resources FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete access for authenticated users" ON resources FOR DELETE USING (auth.role() = 'authenticated');

-- sales_order_items
CREATE POLICY "Users can view sales order items in their org" ON sales_order_items FOR SELECT TO authenticated USING (sales_order_id IN (SELECT sales_orders.id FROM sales_orders WHERE sales_orders.org_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert sales order items in their org" ON sales_order_items FOR INSERT TO authenticated WITH CHECK (sales_order_id IN (SELECT sales_orders.id FROM sales_orders WHERE sales_orders.org_id = get_user_org_id(auth.uid())));
CREATE POLICY "Staff and admins can update sales order items" ON sales_order_items FOR UPDATE TO authenticated USING (sales_order_id IN (SELECT sales_orders.id FROM sales_orders WHERE sales_orders.org_id = get_user_org_id(auth.uid())));

-- sales_orders
CREATE POLICY "Users can view sales orders in their org" ON sales_orders FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can insert sales orders in their org" ON sales_orders FOR INSERT TO authenticated WITH CHECK (org_id = get_user_org_id(auth.uid()));
CREATE POLICY "Staff and admins can update sales orders" ON sales_orders FOR UPDATE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)));
CREATE POLICY "Admins can delete sales orders" ON sales_orders FOR DELETE TO authenticated USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- sender_aliases
CREATE POLICY "org_access" ON sender_aliases FOR ALL USING (org_id = get_user_org_id(auth.uid()));

-- supplements
CREATE POLICY "Supplements are viewable by everyone" ON supplements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Supplements are insertable by admin" ON supplements FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Supplements are updateable by admin" ON supplements FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Supplements are deletable by admin" ON supplements FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- tenant_config
CREATE POLICY "tenant_config_read" ON tenant_config FOR SELECT USING (org_id IN (SELECT user_roles.org_id FROM user_roles WHERE user_roles.user_id = auth.uid()));
CREATE POLICY "tenant_config_admin_write" ON tenant_config FOR ALL USING (org_id IN (SELECT user_roles.org_id FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
CREATE POLICY "tenant_config_service" ON tenant_config FOR ALL USING (auth.role() = 'service_role');

-- user_roles
CREATE POLICY "Users can view roles in their org" ON user_roles FOR SELECT TO authenticated USING (org_id = get_user_org_id(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Users can create their own initial role" ON user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can manage roles in their org" ON user_roles FOR ALL TO authenticated USING (is_org_admin(auth.uid(), org_id));

-- water_logs
CREATE POLICY "Users can view own water logs" ON water_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own water logs" ON water_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own water logs" ON water_logs FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- END OF MASTER SCHEMA
-- =============================================================================
