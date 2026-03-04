-- ThePeptideAI — Consolidated Schema Reference
-- Full DDL: scripts/schema-master.sql (2,214 lines, 57 tables)
-- Last updated: 2026-03-04

-- ============================================================
-- CORE MULTI-TENANCY (every table has org_id FK)
-- ============================================================

-- organizations: tenant orgs (one per merchant)
--   id (uuid PK), name, slug, created_at

-- profiles: users linked to orgs
--   id (uuid PK → auth.users), org_id (FK → organizations),
--   role (admin|staff|sales_rep|customer|vendor),
--   commission_rate (0-100), partner_tier, upline_id (self-FK → profiles),
--   first_name, last_name, email, phone

-- tenant_config: branding/payments/shipping per org (ONE ROW PER ORG — always UPDATE, never INSERT)
--   org_id (PK → organizations), brand_name, logo_url, support_email,
--   stripe_account_id, venmo_handle, cashapp_tag,
--   shipping_from_*, default_carrier

-- org_features: feature flags per org (19 features seeded at signup)
--   org_id (FK), feature_key, enabled (bool)

-- subscription_plans: SaaS tiers (Free/Starter/Professional/Enterprise)
--   id, name, stripe_price_id, monthly_price, features (jsonb)

-- user_roles: supplementary role assignments
--   user_id, role, org_id

-- ============================================================
-- INVENTORY
-- ============================================================

-- peptides: product catalog per org
--   id, org_id, name, description, retail_price, active

-- lots: inventory batches with cost tracking
--   id, org_id, peptide_id (FK → peptides), lot_number,
--   quantity, cost_per_unit, expiration_date

-- bottles: individual bottle UIDs with status tracking
--   id, org_id, lot_id (FK → lots), uid, status (available|reserved|sold|disposed)

-- inventory_movements / movements: stock movement records
--   id, org_id, bottle_id, movement_type, from_location, to_location

-- scraped_peptides: imported from WooCommerce/Shopify scraping
--   id, org_id, imported_peptide_id (FK → peptides)

-- ============================================================
-- ORDERS & FULFILLMENT
-- ============================================================

-- orders: sales orders (status changes TRIGGER commission calculation)
--   id, org_id, contact_id (FK → contacts), status, total,
--   shipping_cost, tracking_number, payment_method

-- order_items / sales_order_items: line items
--   id, order_id (FK), peptide_id, quantity, unit_price, bottle_id

-- sales_orders: alternative order representation
--   id, org_id, contact_id, status, total

-- payment_email_queue: auto-match Zelle/Venmo payments
--   id, org_id, sender, amount, matched_order_id

-- ============================================================
-- CONTACTS / CRM
-- ============================================================

-- contacts: CRM contacts (clients, partners, leads)
--   id, org_id, first_name, last_name, email, phone,
--   type (client|partner|lead), household_id

-- contact_notes: notes on contacts
--   id, contact_id (FK), content, created_by

-- households: group contacts by household
--   id, org_id, name

-- ============================================================
-- PROTOCOLS & HEALTH
-- ============================================================

-- protocols: treatment protocols
--   id, org_id, name, description, created_by

-- protocol_items / regimen_items: items in a protocol
--   id, protocol_id (FK), peptide_id, dosage, frequency

-- protocol_logs: client protocol adherence
--   id, org_id, protocol_id, user_id, logged_at

-- body_composition_logs: client body composition tracking
--   id, org_id, user_id, weight, body_fat, muscle_mass

-- client_daily_logs: daily health logs
--   id, org_id, user_id, date, notes

-- meal_logs: nutrition tracking
--   id, org_id, user_id, meal_type, calories, protein, carbs, fat

-- water_logs: hydration tracking
--   id, org_id, user_id, amount_ml

-- favorite_foods: client food preferences
--   id, org_id, user_id, food_name

-- client_supplements: supplement tracking
--   id, org_id, user_id, supplement_name, dosage

-- client_inventory: client-held inventory
--   id, org_id, user_id, peptide_id, quantity

-- ============================================================
-- PARTNERS / COMMISSIONS
-- ============================================================

-- commissions: partner commission records (created by DB TRIGGER on order insert/update)
--   id, org_id, partner_id (FK → profiles), order_id (FK → orders),
--   amount, rate, status (pending|available|paid), level (1=direct, 2+=upline)

-- pricing_tiers: retail/partner/VIP discount levels per org
--   id, org_id, tier_name, discount_percent

-- wholesale_pricing_tiers: wholesale tier config
--   id, org_id, tier_name, min_quantity, price_per_unit

-- partner_discount_codes: partner coupon codes synced to WooCommerce/Shopify
--   id, org_id, partner_id, code (unique per org), discount_percent,
--   platform_coupon_id, active (bool, soft-delete)

-- peptide_pricing: per-peptide pricing overrides
--   id, org_id, peptide_id, tier_id, price

-- ============================================================
-- AI / KNOWLEDGE
-- ============================================================

-- ai_conversations: AI chat sessions
--   id, org_id, user_id, type (client|admin|partner), messages (jsonb)

-- ai_documents: RAG knowledge base documents
--   id, org_id, title, content, embedding (vector)

-- embeddings: vector embeddings for RAG
--   id, org_id, content, embedding (vector), source

-- admin_ai_logs: admin AI chat audit trail
--   id, org_id, query, response, tool_calls

-- ============================================================
-- INTEGRATIONS
-- ============================================================

-- tenant_connections: platform OAuth connections (WooCommerce, Shopify via Composio)
--   id, org_id, platform, access_token, refresh_token, shop_url, connected_at

-- ============================================================
-- NOTIFICATIONS / COMMS
-- ============================================================

-- notifications: in-app notifications
--   id, org_id, user_id, title, message, read (bool)

-- newsletter_subscribers: email list
--   id, org_id, email

-- partner_chat_messages: partner messaging
--   id, org_id, sender_id, receiver_id, content

-- partner_suggestions: partner feedback/suggestions
--   id, org_id, partner_id, suggestion

-- client_requests: client support requests
--   id, org_id, user_id, request_type, description, status

-- ============================================================
-- COMMUNITY
-- ============================================================

-- discussion_topics: forum topics
--   id, org_id, title, user_id

-- discussion_messages: forum replies
--   id, topic_id (FK), user_id, content

-- resources: educational content
--   id, org_id, title, content, category

-- ============================================================
-- SUPPLEMENTS / ADD-ONS
-- ============================================================

-- supplements: supplement catalog
--   id, org_id, name, description, price

-- ============================================================
-- AUTOMATION
-- ============================================================

-- automation_modules: rule-based automation definitions
--   id, org_id, name, trigger, conditions (jsonb), actions (jsonb), enabled

-- ============================================================
-- AUDIT / SYSTEM
-- ============================================================

-- audit_log: system-wide audit trail
--   id, org_id, user_id, action, table_name, record_id, changes (jsonb)

-- expenses: business expense tracking
--   id, org_id, description, amount, category, date

-- ============================================================
-- SELF-HEALING SYSTEM (17 tables — see specs/self-healing.md)
-- ============================================================

-- bug_reports, error_patterns, health_checks,
-- incidents, heal_log, sentinel_runs,
-- fix_plans, client_heal_instructions, code_patches, schema_heal_log,
-- circuit_breaker_events, escalation_log, rollback_events,
-- deploy_events, performance_baselines, sentinel_meta, synthetic_checks
-- (+ deployment_rollbacks, boot_crash_reports, error_log)

-- ============================================================
-- KEY CONSTRAINTS & TRIGGERS
-- ============================================================

-- Commission trigger: ON INSERT/UPDATE to orders → creates commission records
--   Walks profiles.upline_id chain for multi-level commissions
--   Changing order.status to 'paid' marks commissions as 'available'

-- RLS: Every table has org_id-based RLS policies
--   Service role bypasses RLS (edge functions use service role)

-- tenant_config: UNIQUE on org_id (one row per org, created at provisioning)

-- partner_discount_codes: UNIQUE on (org_id, code)

-- org_features: 19 features seeded by provision-tenant edge function
