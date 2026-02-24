-- ============================================================================
-- ThePeptideAI — Master Schema (auto-generated from live DB)
-- Generated: 2026-02-24
-- Supabase Project: mckkegmkpqdicudnfhor
--
-- This file documents the complete database schema.
-- It is NOT meant to be run directly — use migrations for changes.
-- Regenerate with: mcp__supabase__execute_sql queries against information_schema
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: ENUM TYPES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'viewer', 'client', 'fulfillment', 'sales_rep', 'customer', 'super_admin');
CREATE TYPE public.bottle_status AS ENUM ('in_stock', 'sold', 'given_away', 'internal_use', 'lost', 'returned', 'expired');
CREATE TYPE public.contact_type AS ENUM ('customer', 'partner', 'internal');
CREATE TYPE public.movement_type AS ENUM ('sale', 'giveaway', 'internal_use', 'loss', 'return');
CREATE TYPE public.price_tier AS ENUM ('retail', 'wholesale', 'at_cost');
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'fulfilled', 'rejected', 'archived');
CREATE TYPE public.request_type AS ENUM ('general_inquiry', 'product_request', 'regimen_help');

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: TABLES (68 tables)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Core / Auth ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid,
  full_name text,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
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

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer'::app_role,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ─── Tenant Config ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  brand_name text NOT NULL DEFAULT 'Peptide AI'::text,
  admin_brand_name text NOT NULL DEFAULT 'Peptide Admin'::text,
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
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  wholesale_tier_id uuid,
  supplier_org_id uuid,
  subdomain text,
  onboarding_path text DEFAULT 'new'::text,
  secondary_color text,
  font_family text,
  favicon_url text,
  custom_css text,
  website_url text,
  scraped_brand_data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  service text NOT NULL,
  api_key text NOT NULL,
  api_key_masked text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  billing_period text NOT NULL DEFAULT 'monthly'::text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  trial_end timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  service text NOT NULL,
  composio_connection_id text,
  status text DEFAULT 'disconnected'::text,
  state_token text,
  connected_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_name text NOT NULL,
  price_monthly integer NOT NULL,
  price_yearly integer NOT NULL,
  max_users integer DEFAULT 0,
  max_peptides integer DEFAULT 0,
  max_orders_per_month integer DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  stripe_monthly_price_id text,
  stripe_yearly_price_id text,
  sort_order integer DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  trial_days integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.org_features (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  event_type text NOT NULL,
  stripe_event_id text,
  amount_cents integer DEFAULT 0,
  currency text DEFAULT 'usd'::text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Contacts ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  type contact_type NOT NULL DEFAULT 'customer'::contact_type,
  company text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  linked_user_id uuid,
  tier text DEFAULT 'public'::text,
  invite_link text,
  assigned_rep_id uuid,
  claim_token uuid DEFAULT gen_random_uuid(),
  claim_token_expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  address text,
  household_id uuid,
  household_role text,
  woo_customer_id bigint,
  source text NOT NULL DEFAULT 'manual'::text
);

CREATE TABLE IF NOT EXISTS public.contact_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  org_id uuid NOT NULL
);

-- ─── Peptides & Inventory ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.peptides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  sku text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  retail_price numeric DEFAULT 0,
  default_dose_amount numeric,
  default_dose_unit text DEFAULT 'mcg'::text,
  default_frequency text DEFAULT 'daily'::text,
  default_timing text,
  default_concentration_mg_ml numeric,
  reconstitution_notes text,
  visible_to_user_ids uuid[],
  base_cost numeric
);

CREATE TABLE IF NOT EXISTS public.peptide_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  peptide_id uuid NOT NULL,
  tier price_tier NOT NULL,
  price numeric NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  peptide_id uuid NOT NULL,
  lot_number text NOT NULL,
  quantity_received integer NOT NULL,
  cost_per_unit numeric NOT NULL,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  payment_status text DEFAULT 'unpaid'::text,
  payment_date date,
  payment_method text
);

CREATE TABLE IF NOT EXISTS public.bottles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  lot_id uuid NOT NULL,
  uid text NOT NULL,
  status bottle_status NOT NULL DEFAULT 'in_stock'::bottle_status,
  location text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- ─── Movements (Sales, Giveaways, Internal Use, Loss, Return) ───────────

CREATE TABLE IF NOT EXISTS public.movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  type movement_type NOT NULL,
  contact_id uuid,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  payment_status text DEFAULT 'unpaid'::text,
  amount_paid numeric DEFAULT 0,
  payment_method text,
  payment_date timestamp with time zone,
  status text DEFAULT 'active'::text,
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.movement_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL,
  bottle_id uuid,
  price_at_sale numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  description text
);

-- ─── Sales Orders ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  client_id uuid NOT NULL,
  rep_id uuid,
  status text NOT NULL DEFAULT 'draft'::text,
  total_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid'::text,
  amount_paid numeric DEFAULT 0,
  payment_method text,
  payment_date timestamp with time zone,
  shipping_address text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  commission_status text DEFAULT 'pending'::text,
  psifi_session_id text,
  psifi_transaction_id text,
  psifi_status text DEFAULT 'none'::text,
  tracking_number text,
  carrier text,
  shipping_status text DEFAULT 'pending'::text,
  ship_date timestamp with time zone,
  shipping_cost numeric DEFAULT 0,
  label_url text,
  shippo_shipment_id text,
  shippo_transaction_id text,
  shipping_error text,
  order_source text DEFAULT 'app'::text,
  woo_order_id bigint,
  woo_status text,
  woo_date_created timestamp with time zone,
  woo_date_modified timestamp with time zone,
  cogs_amount numeric DEFAULT 0,
  profit_amount numeric DEFAULT 0,
  merchant_fee numeric DEFAULT 0,
  delivery_method text DEFAULT 'ship'::text,
  is_supplier_order boolean DEFAULT false,
  source_org_id uuid,
  fulfillment_type text DEFAULT 'standard'::text
);

CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL,
  peptide_id uuid NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Commissions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_id uuid,
  partner_id uuid,
  amount numeric NOT NULL,
  commission_rate numeric,
  type text,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Supplier Orders (Legacy) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  peptide_id uuid NOT NULL,
  quantity_ordered integer NOT NULL,
  estimated_cost_per_unit numeric,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_arrival_date date,
  supplier text,
  tracking_number text,
  notes text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  payment_status text DEFAULT 'unpaid'::text,
  amount_paid numeric DEFAULT 0.00,
  order_group_id text
);

-- ─── Expenses ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  amount numeric NOT NULL,
  description text,
  recipient text,
  payment_method text,
  status text DEFAULT 'paid'::text,
  related_order_id uuid,
  related_sales_order_id uuid
);

-- ─── Protocols ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.protocols (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contact_id uuid,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.protocol_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL,
  peptide_id uuid NOT NULL,
  dosage_amount numeric NOT NULL,
  dosage_unit text NOT NULL DEFAULT 'mcg'::text,
  frequency text NOT NULL,
  duration_weeks numeric NOT NULL,
  price_tier text NOT NULL DEFAULT 'retail'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  duration_days integer,
  cost_multiplier numeric DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS public.protocol_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  protocol_item_id uuid,
  user_id uuid,
  taken_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'taken'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  client_inventory_id uuid
);

CREATE TABLE IF NOT EXISTS public.protocol_supplements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  protocol_id uuid NOT NULL,
  supplement_id uuid NOT NULL,
  dosage text,
  frequency text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.protocol_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  protocol_id uuid,
  user_id uuid,
  rating smallint,
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  admin_response text,
  response_link text,
  response_at timestamp with time zone,
  is_read_by_client boolean DEFAULT false
);

-- ─── Supplements ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  purchase_link text,
  default_dosage text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.peptide_suggested_supplements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  peptide_id uuid NOT NULL,
  supplement_id uuid NOT NULL,
  reasoning text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_supplements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid,
  name text NOT NULL,
  dosage text,
  frequency text,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Client Inventory (Vials at client) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid,
  peptide_id uuid,
  batch_number text,
  vial_size_mg numeric NOT NULL,
  water_added_ml numeric,
  concentration_mg_ml numeric,
  reconstituted_at timestamp with time zone,
  expires_at timestamp with time zone,
  current_quantity_mg numeric NOT NULL,
  status text DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
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

-- ─── Resources & Education ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.resource_themes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  icon text DEFAULT 'beaker'::text,
  color text DEFAULT '#10b981'::text
);

CREATE TABLE IF NOT EXISTS public.resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  peptide_id uuid,
  title text NOT NULL,
  url text NOT NULL,
  type text,
  description text,
  created_at timestamp with time zone DEFAULT now(),
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

CREATE TABLE IF NOT EXISTS public.resource_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resource_views (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL,
  user_id uuid,
  viewed_at timestamp with time zone DEFAULT now()
);

-- ─── Notifications ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  type text DEFAULT 'info'::text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── AI System ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text DEFAULT 'Peptide AI'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  status text DEFAULT 'pending'::text,
  extracted_text text,
  summary text,
  chunk_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_health_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conditions jsonb DEFAULT '[]'::jsonb,
  goals jsonb DEFAULT '[]'::jsonb,
  medications jsonb DEFAULT '[]'::jsonb,
  allergies jsonb DEFAULT '[]'::jsonb,
  supplements jsonb DEFAULT '[]'::jsonb,
  lab_values jsonb DEFAULT '{}'::jsonb,
  notes text DEFAULT ''::text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_learned_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  source text,
  source_url text,
  relevance_score double precision DEFAULT 1.0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_ai_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  session_ts timestamp with time zone DEFAULT now(),
  tool_name text,
  tool_args jsonb,
  tool_result text,
  error text,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_builder_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  request_text text NOT NULL,
  status text DEFAULT 'pending'::text,
  layer text DEFAULT 'config'::text,
  result jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content text,
  metadata jsonb,
  embedding vector
);

-- ─── Health & Nutrition Tracking ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.body_composition_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  weight numeric,
  body_fat_percentage numeric,
  muscle_mass numeric,
  visceral_fat numeric,
  water_percentage numeric,
  bmi numeric,
  bmr numeric,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.meal_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  image_url text,
  foods jsonb DEFAULT '[]'::jsonb,
  total_calories numeric DEFAULT 0,
  total_protein numeric DEFAULT 0,
  total_carbs numeric DEFAULT 0,
  total_fat numeric DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.daily_macro_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  calories_target integer DEFAULT 2000,
  protein_target integer DEFAULT 150,
  carbs_target integer DEFAULT 200,
  fat_target integer DEFAULT 65,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  water_goal_oz integer DEFAULT 64
);

CREATE TABLE IF NOT EXISTS public.favorite_foods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  calories numeric NOT NULL DEFAULT 0,
  protein numeric NOT NULL DEFAULT 0,
  carbs numeric NOT NULL DEFAULT 0,
  fat numeric NOT NULL DEFAULT 0,
  quantity text DEFAULT '1 serving'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  is_template boolean DEFAULT false,
  template_name character varying(255),
  meal_type character varying(50)
);

CREATE TABLE IF NOT EXISTS public.water_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  amount_oz integer NOT NULL,
  logged_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_daily_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contact_id uuid,
  log_date date NOT NULL,
  weight_lbs numeric,
  body_fat_pct numeric,
  water_intake_oz numeric,
  notes text,
  side_effects text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- ─── Community / Discussions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.discussion_topics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  theme_id uuid,
  user_id uuid NOT NULL,
  is_pinned boolean DEFAULT false,
  message_count integer DEFAULT 0,
  last_activity_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  org_id uuid
);

CREATE TABLE IF NOT EXISTS public.discussion_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  parent_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- ─── Client Requests ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type request_type NOT NULL DEFAULT 'product_request'::request_type,
  status request_status NOT NULL DEFAULT 'pending'::request_status,
  subject text,
  message text,
  peptide_id uuid,
  requested_quantity integer DEFAULT 1,
  admin_notes text,
  fulfilled_movement_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  attachments jsonb DEFAULT '[]'::jsonb,
  admin_attachments jsonb DEFAULT '[]'::jsonb,
  context_type text,
  context_id uuid
);

CREATE TABLE IF NOT EXISTS public.request_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message text,
  attachments jsonb DEFAULT '[]'::jsonb,
  is_internal boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Automations ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.automation_modules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  module_type text NOT NULL,
  enabled boolean DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  last_run_at timestamp with time zone,
  run_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_automations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text DEFAULT ''::text,
  trigger_type text NOT NULL,
  trigger_config jsonb DEFAULT '{}'::jsonb,
  condition_sql text,
  action_type text NOT NULL,
  action_config jsonb DEFAULT '{}'::jsonb,
  active boolean DEFAULT true,
  last_run_at timestamp with time zone,
  run_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Custom Fields / Entities / Reports ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.custom_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  entity text NOT NULL,
  field_name text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL,
  options jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  required boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_field_values (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  field_id uuid NOT NULL,
  record_id uuid NOT NULL,
  value jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_entities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  icon text DEFAULT 'Box'::text,
  description text DEFAULT ''::text,
  schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_entity_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_dashboard_widgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  title text NOT NULL,
  widget_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer DEFAULT 0,
  size text DEFAULT 'md'::text,
  page text DEFAULT 'dashboard'::text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text DEFAULT ''::text,
  query_sql text NOT NULL,
  parameters jsonb DEFAULT '{}'::jsonb,
  chart_type text DEFAULT 'table'::text,
  chart_config jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Wholesale / Vendor ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wholesale_pricing_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_monthly_units integer NOT NULL DEFAULT 0,
  discount_pct numeric NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  markup_amount numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.vendor_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_user_id uuid,
  to_org_id uuid,
  subject text NOT NULL,
  body text NOT NULL,
  message_type text NOT NULL DEFAULT 'announcement'::text,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scraped_peptides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  price numeric,
  description text,
  image_url text,
  source_url text,
  confidence numeric DEFAULT 0,
  status text DEFAULT 'pending'::text,
  imported_peptide_id uuid,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Payment Processing ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payment_email_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  gmail_message_id text NOT NULL,
  sender_name text,
  amount numeric NOT NULL,
  payment_method text NOT NULL,
  email_subject text,
  email_snippet text,
  email_date timestamp with time zone,
  matched_contact_id uuid,
  matched_movement_id uuid,
  status text NOT NULL DEFAULT 'pending'::text,
  confidence text NOT NULL DEFAULT 'low'::text,
  auto_posted_at timestamp with time zone,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  ai_suggested_contact_id uuid,
  ai_reasoning text
);

CREATE TABLE IF NOT EXISTS public.sender_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  sender_name text NOT NULL,
  contact_id uuid NOT NULL,
  payment_method text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Partner Suggestions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  suggestion_text text NOT NULL,
  category text NOT NULL DEFAULT 'feature'::text,
  status text NOT NULL DEFAULT 'new'::text,
  admin_notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- ─── Time Tracking ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  work_date date NOT NULL,
  hours numeric NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- ─── Audit / Misc ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid,
  user_id uuid,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  user_role text,
  org_id uuid,
  page_url text,
  user_agent text,
  description text NOT NULL,
  console_errors text,
  status text NOT NULL DEFAULT 'open'::text,
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.lead_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  business_status text,
  expected_volume text,
  source text DEFAULT 'landing_page'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id bigint NOT NULL,
  email text NOT NULL,
  subscribed_at timestamp with time zone NOT NULL DEFAULT now(),
  source text DEFAULT 'website_footer'::text
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4: PRIMARY KEYS & UNIQUE CONSTRAINTS
-- ═══════════════════════════════════════════════════════════════════════════

-- Primary keys (all tables use `id` as PK)
ALTER TABLE public.admin_ai_logs ADD CONSTRAINT admin_ai_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_chat_messages ADD CONSTRAINT admin_chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_builder_tasks ADD CONSTRAINT ai_builder_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_documents ADD CONSTRAINT ai_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_health_profiles ADD CONSTRAINT ai_health_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_learned_insights ADD CONSTRAINT ai_learned_insights_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_messages ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_modules ADD CONSTRAINT automation_modules_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);
ALTER TABLE public.body_composition_logs ADD CONSTRAINT body_composition_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.bottles ADD CONSTRAINT bottles_pkey PRIMARY KEY (id);
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.client_daily_logs ADD CONSTRAINT client_daily_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.client_inventory ADD CONSTRAINT client_inventory_pkey PRIMARY KEY (id);
ALTER TABLE public.client_requests ADD CONSTRAINT client_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.client_supplements ADD CONSTRAINT client_supplements_pkey PRIMARY KEY (id);
ALTER TABLE public.commissions ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);
ALTER TABLE public.contact_notes ADD CONSTRAINT contact_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.contacts ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_automations ADD CONSTRAINT custom_automations_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_dashboard_widgets ADD CONSTRAINT custom_dashboard_widgets_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_entities ADD CONSTRAINT custom_entities_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_entity_records ADD CONSTRAINT custom_entity_records_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_field_values ADD CONSTRAINT custom_field_values_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_fields ADD CONSTRAINT custom_fields_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_reports ADD CONSTRAINT custom_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_hours ADD CONSTRAINT daily_hours_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_macro_goals ADD CONSTRAINT daily_macro_goals_pkey PRIMARY KEY (id);
ALTER TABLE public.discussion_messages ADD CONSTRAINT discussion_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.discussion_topics ADD CONSTRAINT discussion_topics_pkey PRIMARY KEY (id);
ALTER TABLE public.embeddings ADD CONSTRAINT embeddings_pkey PRIMARY KEY (id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.favorite_foods ADD CONSTRAINT favorite_foods_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_submissions ADD CONSTRAINT lead_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.lots ADD CONSTRAINT lots_pkey PRIMARY KEY (id);
ALTER TABLE public.meal_logs ADD CONSTRAINT meal_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.movement_items ADD CONSTRAINT movement_items_pkey PRIMARY KEY (id);
ALTER TABLE public.movements ADD CONSTRAINT movements_pkey PRIMARY KEY (id);
ALTER TABLE public.newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.org_features ADD CONSTRAINT org_features_pkey PRIMARY KEY (id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.partner_chat_messages ADD CONSTRAINT partner_chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.partner_suggestions ADD CONSTRAINT partner_suggestions_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_email_queue ADD CONSTRAINT payment_email_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.peptide_pricing ADD CONSTRAINT peptide_pricing_pkey PRIMARY KEY (id);
ALTER TABLE public.peptide_suggested_supplements ADD CONSTRAINT peptide_suggested_supplements_pkey PRIMARY KEY (id);
ALTER TABLE public.peptides ADD CONSTRAINT peptides_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.protocol_feedback ADD CONSTRAINT protocol_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.protocol_items ADD CONSTRAINT protocol_items_pkey PRIMARY KEY (id);
ALTER TABLE public.protocol_logs ADD CONSTRAINT protocol_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.protocol_supplements ADD CONSTRAINT protocol_supplements_pkey PRIMARY KEY (id);
ALTER TABLE public.protocols ADD CONSTRAINT protocols_pkey PRIMARY KEY (id);
ALTER TABLE public.request_replies ADD CONSTRAINT request_replies_pkey PRIMARY KEY (id);
ALTER TABLE public.resource_comments ADD CONSTRAINT resource_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.resource_themes ADD CONSTRAINT resource_themes_pkey PRIMARY KEY (id);
ALTER TABLE public.resource_views ADD CONSTRAINT resource_views_pkey PRIMARY KEY (id);
ALTER TABLE public.resources ADD CONSTRAINT resources_pkey PRIMARY KEY (id);
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_pkey PRIMARY KEY (id);
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.scraped_peptides ADD CONSTRAINT scraped_peptides_pkey PRIMARY KEY (id);
ALTER TABLE public.sender_aliases ADD CONSTRAINT sender_aliases_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.supplements ADD CONSTRAINT supplements_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_api_keys ADD CONSTRAINT tenant_api_keys_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_config ADD CONSTRAINT tenant_config_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_connections ADD CONSTRAINT tenant_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.vendor_messages ADD CONSTRAINT vendor_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.water_logs ADD CONSTRAINT water_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.wholesale_pricing_tiers ADD CONSTRAINT wholesale_pricing_tiers_pkey PRIMARY KEY (id);

-- Unique constraints
ALTER TABLE public.ai_health_profiles ADD CONSTRAINT ai_health_profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.automation_modules ADD CONSTRAINT automation_modules_org_id_module_type_key UNIQUE (org_id, module_type);
ALTER TABLE public.bottles ADD CONSTRAINT bottles_org_id_uid_key UNIQUE (org_id, uid);
ALTER TABLE public.client_daily_logs ADD CONSTRAINT client_daily_logs_contact_id_log_date_key UNIQUE (contact_id, log_date);
ALTER TABLE public.contacts ADD CONSTRAINT contacts_claim_token_unique UNIQUE (claim_token);
ALTER TABLE public.custom_entities ADD CONSTRAINT custom_entities_org_id_slug_key UNIQUE (org_id, slug);
ALTER TABLE public.custom_field_values ADD CONSTRAINT custom_field_values_org_id_field_id_record_id_key UNIQUE (org_id, field_id, record_id);
ALTER TABLE public.custom_fields ADD CONSTRAINT custom_fields_org_id_entity_field_name_key UNIQUE (org_id, entity, field_name);
ALTER TABLE public.daily_hours ADD CONSTRAINT daily_hours_user_id_work_date_key UNIQUE (user_id, work_date);
ALTER TABLE public.daily_macro_goals ADD CONSTRAINT daily_macro_goals_user_id_key UNIQUE (user_id);
ALTER TABLE public.newsletter_subscribers ADD CONSTRAINT newsletter_subscribers_email_key UNIQUE (email);
ALTER TABLE public.org_features ADD CONSTRAINT org_features_org_id_feature_key_key UNIQUE (org_id, feature_key);
ALTER TABLE public.payment_email_queue ADD CONSTRAINT payment_email_queue_org_id_gmail_message_id_key UNIQUE (org_id, gmail_message_id);
ALTER TABLE public.peptide_suggested_supplements ADD CONSTRAINT peptide_suggested_supplements_peptide_id_supplement_id_key UNIQUE (peptide_id, supplement_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.sender_aliases ADD CONSTRAINT sender_aliases_org_id_sender_name_key UNIQUE (org_id, sender_name);
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_name_key UNIQUE (name);
ALTER TABLE public.tenant_api_keys ADD CONSTRAINT tenant_api_keys_org_id_service_key UNIQUE (org_id, service);
ALTER TABLE public.tenant_config ADD CONSTRAINT tenant_config_org_id_key UNIQUE (org_id);
ALTER TABLE public.tenant_connections ADD CONSTRAINT tenant_connections_org_id_service_key UNIQUE (org_id, service);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_org_id_key UNIQUE (org_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_org_id_key UNIQUE (user_id, org_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5: FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════════════

-- Organizations refs
ALTER TABLE public.profiles ADD CONSTRAINT profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_config ADD CONSTRAINT tenant_config_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_api_keys ADD CONSTRAINT tenant_api_keys_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_connections ADD CONSTRAINT tenant_connections_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.org_features ADD CONSTRAINT org_features_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.billing_events ADD CONSTRAINT billing_events_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);
ALTER TABLE public.contacts ADD CONSTRAINT contacts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.contact_notes ADD CONSTRAINT contact_notes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);
ALTER TABLE public.peptides ADD CONSTRAINT peptides_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.lots ADD CONSTRAINT lots_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.bottles ADD CONSTRAINT bottles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.movements ADD CONSTRAINT movements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD CONSTRAINT orders_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.protocols ADD CONSTRAINT protocols_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);
ALTER TABLE public.client_requests ADD CONSTRAINT client_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.automation_modules ADD CONSTRAINT automation_modules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.custom_automations ADD CONSTRAINT custom_automations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.custom_fields ADD CONSTRAINT custom_fields_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.custom_field_values ADD CONSTRAINT custom_field_values_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.custom_entities ADD CONSTRAINT custom_entities_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.custom_entity_records ADD CONSTRAINT custom_entity_records_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.custom_dashboard_widgets ADD CONSTRAINT custom_dashboard_widgets_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.custom_reports ADD CONSTRAINT custom_reports_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.daily_hours ADD CONSTRAINT daily_hours_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_builder_tasks ADD CONSTRAINT ai_builder_tasks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.partner_chat_messages ADD CONSTRAINT partner_chat_messages_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.partner_suggestions ADD CONSTRAINT partner_suggestions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.payment_email_queue ADD CONSTRAINT payment_email_queue_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sender_aliases ADD CONSTRAINT sender_aliases_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.scraped_peptides ADD CONSTRAINT scraped_peptides_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.discussion_topics ADD CONSTRAINT discussion_topics_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);
ALTER TABLE public.vendor_messages ADD CONSTRAINT vendor_messages_to_org_id_fkey FOREIGN KEY (to_org_id) REFERENCES public.organizations(id);
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_source_org_id_fkey FOREIGN KEY (source_org_id) REFERENCES public.organizations(id);
ALTER TABLE public.tenant_config ADD CONSTRAINT tenant_config_supplier_org_id_fkey FOREIGN KEY (supplier_org_id) REFERENCES public.organizations(id);

-- Profiles / user refs
ALTER TABLE public.profiles ADD CONSTRAINT profiles_parent_partner_id_fkey FOREIGN KEY (parent_partner_id) REFERENCES public.profiles(id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_parent_rep_id_fkey FOREIGN KEY (parent_rep_id) REFERENCES public.profiles(id);
ALTER TABLE public.contacts ADD CONSTRAINT contacts_assigned_rep_id_fkey FOREIGN KEY (assigned_rep_id) REFERENCES public.profiles(id);
ALTER TABLE public.movements ADD CONSTRAINT movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_rep_id_fkey FOREIGN KEY (rep_id) REFERENCES public.profiles(id);
ALTER TABLE public.commissions ADD CONSTRAINT commissions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id);
ALTER TABLE public.payment_email_queue ADD CONSTRAINT payment_email_queue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.sender_aliases ADD CONSTRAINT sender_aliases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);
ALTER TABLE public.client_requests ADD CONSTRAINT client_requests_profile_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
ALTER TABLE public.request_replies ADD CONSTRAINT request_replies_profile_fk FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Contacts refs
ALTER TABLE public.contact_notes ADD CONSTRAINT contact_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
ALTER TABLE public.movements ADD CONSTRAINT movements_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.contacts(id);
ALTER TABLE public.protocols ADD CONSTRAINT protocols_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
ALTER TABLE public.client_inventory ADD CONSTRAINT client_inventory_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
ALTER TABLE public.client_daily_logs ADD CONSTRAINT client_daily_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
ALTER TABLE public.client_supplements ADD CONSTRAINT client_supplements_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
ALTER TABLE public.resources ADD CONSTRAINT resources_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
ALTER TABLE public.payment_email_queue ADD CONSTRAINT payment_email_queue_matched_contact_id_fkey FOREIGN KEY (matched_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.payment_email_queue ADD CONSTRAINT payment_email_queue_ai_suggested_contact_id_fkey FOREIGN KEY (ai_suggested_contact_id) REFERENCES public.contacts(id);
ALTER TABLE public.sender_aliases ADD CONSTRAINT sender_aliases_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- Peptides refs
ALTER TABLE public.lots ADD CONSTRAINT lots_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id);
ALTER TABLE public.orders ADD CONSTRAINT orders_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id) ON DELETE CASCADE;
ALTER TABLE public.peptide_pricing ADD CONSTRAINT peptide_pricing_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id) ON DELETE CASCADE;
ALTER TABLE public.protocol_items ADD CONSTRAINT protocol_items_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id) ON DELETE CASCADE;
ALTER TABLE public.client_inventory ADD CONSTRAINT client_inventory_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id);
ALTER TABLE public.client_requests ADD CONSTRAINT client_requests_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id) ON DELETE SET NULL;
ALTER TABLE public.resources ADD CONSTRAINT resources_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id) ON DELETE SET NULL;
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id);
ALTER TABLE public.peptide_suggested_supplements ADD CONSTRAINT peptide_suggested_supplements_peptide_id_fkey FOREIGN KEY (peptide_id) REFERENCES public.peptides(id) ON DELETE CASCADE;
ALTER TABLE public.scraped_peptides ADD CONSTRAINT scraped_peptides_imported_peptide_id_fkey FOREIGN KEY (imported_peptide_id) REFERENCES public.peptides(id);

-- Inventory chain: lots → bottles → movement_items
ALTER TABLE public.bottles ADD CONSTRAINT bottles_lot_id_fkey FOREIGN KEY (lot_id) REFERENCES public.lots(id);
ALTER TABLE public.movement_items ADD CONSTRAINT movement_items_bottle_id_fkey FOREIGN KEY (bottle_id) REFERENCES public.bottles(id);
ALTER TABLE public.movement_items ADD CONSTRAINT movement_items_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES public.movements(id) ON DELETE CASCADE;
ALTER TABLE public.client_inventory ADD CONSTRAINT client_inventory_movement_id_fkey FOREIGN KEY (movement_id) REFERENCES public.movements(id);
ALTER TABLE public.payment_email_queue ADD CONSTRAINT payment_email_queue_matched_movement_id_fkey FOREIGN KEY (matched_movement_id) REFERENCES public.movements(id) ON DELETE SET NULL;
ALTER TABLE public.client_requests ADD CONSTRAINT client_requests_fulfilled_movement_id_fkey FOREIGN KEY (fulfilled_movement_id) REFERENCES public.movements(id) ON DELETE SET NULL;

-- Sales orders chain
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales_orders(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_related_order_id_fkey FOREIGN KEY (related_order_id) REFERENCES public.orders(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_related_sales_order_id_fkey FOREIGN KEY (related_sales_order_id) REFERENCES public.sales_orders(id);

-- Protocols chain
ALTER TABLE public.protocol_items ADD CONSTRAINT protocol_items_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.protocols(id) ON DELETE CASCADE;
ALTER TABLE public.protocol_logs ADD CONSTRAINT protocol_logs_protocol_item_id_fkey FOREIGN KEY (protocol_item_id) REFERENCES public.protocol_items(id) ON DELETE CASCADE;
ALTER TABLE public.protocol_logs ADD CONSTRAINT protocol_logs_client_inventory_id_fkey FOREIGN KEY (client_inventory_id) REFERENCES public.client_inventory(id) ON DELETE SET NULL;
ALTER TABLE public.protocol_feedback ADD CONSTRAINT protocol_feedback_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.protocols(id) ON DELETE CASCADE;
ALTER TABLE public.protocol_supplements ADD CONSTRAINT protocol_supplements_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES public.protocols(id) ON DELETE CASCADE;
ALTER TABLE public.client_inventory ADD CONSTRAINT client_inventory_protocol_item_id_fkey FOREIGN KEY (protocol_item_id) REFERENCES public.protocol_items(id) ON DELETE SET NULL;

-- Supplements
ALTER TABLE public.protocol_supplements ADD CONSTRAINT protocol_supplements_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES public.supplements(id) ON DELETE CASCADE;
ALTER TABLE public.peptide_suggested_supplements ADD CONSTRAINT peptide_suggested_supplements_supplement_id_fkey FOREIGN KEY (supplement_id) REFERENCES public.supplements(id) ON DELETE CASCADE;

-- Resources
ALTER TABLE public.resources ADD CONSTRAINT resources_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.resource_themes(id) ON DELETE SET NULL;
ALTER TABLE public.resource_comments ADD CONSTRAINT resource_comments_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;
ALTER TABLE public.resource_views ADD CONSTRAINT resource_views_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Discussions
ALTER TABLE public.discussion_topics ADD CONSTRAINT discussion_topics_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES public.resource_themes(id) ON DELETE SET NULL;
ALTER TABLE public.discussion_messages ADD CONSTRAINT discussion_messages_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.discussion_topics(id) ON DELETE CASCADE;
ALTER TABLE public.discussion_messages ADD CONSTRAINT discussion_messages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.discussion_messages(id) ON DELETE SET NULL;

-- Requests
ALTER TABLE public.request_replies ADD CONSTRAINT request_replies_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.client_requests(id) ON DELETE CASCADE;

-- Custom entities
ALTER TABLE public.custom_entity_records ADD CONSTRAINT custom_entity_records_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.custom_entities(id) ON DELETE CASCADE;
ALTER TABLE public.custom_field_values ADD CONSTRAINT custom_field_values_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.custom_fields(id) ON DELETE CASCADE;

-- AI
ALTER TABLE public.ai_messages ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;

-- Subscriptions
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);
ALTER TABLE public.tenant_config ADD CONSTRAINT tenant_config_wholesale_tier_id_fkey FOREIGN KEY (wholesale_tier_id) REFERENCES public.wholesale_pricing_tiers(id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6: FUNCTIONS (signatures only — bodies in migrations)
-- ═══════════════════════════════════════════════════════════════════════════

-- Utility
-- handle_new_user()                          RETURNS trigger       SECURITY DEFINER
-- update_updated_at_column()                 RETURNS trigger       SECURITY DEFINER
-- update_custom_timestamp()                  RETURNS trigger
-- update_tenant_api_keys_timestamp()         RETURNS trigger
-- update_tenant_config_timestamp()           RETURNS trigger
-- update_tenant_subscriptions_timestamp()    RETURNS trigger
-- update_topic_stats()                       RETURNS trigger
-- create_bottles_for_lot()                   RETURNS trigger       SECURITY DEFINER
-- generate_bottle_uid()                      RETURNS text          SECURITY DEFINER
-- exec_sql(sql text)                         RETURNS void          SECURITY DEFINER

-- Auth / Organization helpers
-- has_role(_user_id uuid, _role app_role)              RETURNS boolean   SECURITY DEFINER
-- is_org_admin(_user_id uuid, _org_id uuid)            RETURNS boolean   SECURITY DEFINER
-- is_org_member(_user_id uuid, _org_id uuid)           RETURNS boolean   SECURITY DEFINER
-- get_user_org_id(_user_id uuid)                       RETURNS uuid      SECURITY DEFINER
-- seed_default_features(p_org_id uuid)                 RETURNS void      SECURITY DEFINER
-- check_subdomain_availability(p_subdomain text)       RETURNS boolean   SECURITY DEFINER

-- Referral & onboarding
-- link_referral(p_user_id uuid, p_email text, p_full_name text, p_referrer_profile_id uuid, p_role text) RETURNS jsonb SECURITY DEFINER
-- auto_link_contact_by_email(p_user_id uuid, p_email text)  RETURNS jsonb  SECURITY DEFINER

-- Inventory
-- get_bottle_stats()                                   RETURNS TABLE(status text, count bigint)     SECURITY DEFINER
-- get_inventory_valuation()                            RETURNS TABLE(total_value numeric, item_count bigint) SECURITY DEFINER
-- get_peptide_stock_counts()                           RETURNS TABLE(peptide_id uuid, stock_count bigint) SECURITY DEFINER
-- decrement_vial(p_vial_id uuid, p_dose_mg numeric)    RETURNS jsonb  SECURITY DEFINER

-- Sales & commissions
-- create_validated_order(p_items jsonb, p_shipping_address text, p_notes text, p_payment_method text, p_delivery_method text) RETURNS jsonb SECURITY DEFINER
-- process_sale_commission(p_sale_id uuid)              RETURNS void   SECURITY DEFINER
-- apply_commissions_to_owed(partner_profile_id uuid)   RETURNS json   SECURITY DEFINER
-- convert_commission_to_credit(commission_id uuid)     RETURNS void   SECURITY DEFINER
-- pay_order_with_credit(p_order_id uuid, p_user_id uuid) RETURNS void SECURITY DEFINER

-- Partner
-- get_partner_downline(root_id uuid)                   RETURNS TABLE(...) SECURITY DEFINER

-- Vendor
-- get_supplier_orders(p_supplier_org_id uuid)          RETURNS TABLE(...) SECURITY DEFINER

-- Contact management
-- delete_contact_cascade(p_contact_id uuid, p_org_id uuid) RETURNS jsonb SECURITY DEFINER

-- Household
-- create_household(p_owner_contact_id uuid)            RETURNS uuid   SECURITY DEFINER
-- add_household_member(p_owner_contact_id uuid, p_member_name text, p_member_email text) RETURNS uuid SECURITY DEFINER
-- get_household_members(p_contact_id uuid)             RETURNS TABLE(...) SECURITY DEFINER

-- Admin / reporting
-- get_org_counts()                                     RETURNS TABLE(org_id uuid, ...) SECURITY DEFINER
-- run_readonly_query(query_text text, p_org_id uuid)   RETURNS jsonb  SECURITY DEFINER

-- Vector search
-- match_documents(query_embedding vector, match_threshold float8, match_count int, filter jsonb) RETURNS TABLE(...)

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7: TABLE COUNTS SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Total tables: 68
-- Total functions: 36
-- Total enum types: 7
-- Total unique constraints: 22
-- Total foreign keys: ~95
--
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════
