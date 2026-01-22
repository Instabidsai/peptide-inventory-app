# Database Schema Reference

This document outlines the current database schema, including recent extensions for Protocol Tracking and Cost estimation.
Generated from `src/integrations/supabase/types.ts` and recent migration scripts.

## Core Tables (from `types.ts`)

### `peptides`
*   `id`: uuid (PK)
*   `name`: text
*   `sku`: text
*   `description`: text
*   `active`: boolean
*   `org_id`: uuid (FK -> organizations.id)
*   `stock_count`: (Computed/Aggregated in app, not db column)
*   `active_regimens`: (Computed/Aggregated in app)

### `bottles`
*   `id`: uuid (PK)
*   `lot_id`: uuid (FK -> lots.id)
*   `status`: enum (`in_stock`, `sold`, `internal_use`, `expired`, etc.)
*   `quantity`: number (default 1)
*   `org_id`: uuid (FK)

### `lots`
*   `id`: uuid (PK)
*   `peptide_id`: uuid (FK -> peptides.id)
*   `lot_number`: text
*   `expiry_date`: date
*   `cost_per_unit`: number
*   `quantity_received`: number

### `contacts`
*   `id`: uuid (PK)
*   `name`: text
*   `email`: text
*   `phone`: text
*   `type`: enum (`customer`, `partner`, `internal`)
*   `org_id`: uuid (FK)

### `protocols`
*   `id`: uuid (PK)
*   `name`: text
*   `description`: text
*   `contact_id`: uuid (FK -> contacts.id, nullable)
*   `org_id`: uuid (FK)
*   `created_at`: timestamp

### `protocol_items`
Defines the dosage and frequency for a specific peptide within a protocol.

*   `id`: uuid (PK)
*   `protocol_id`: uuid (FK -> protocols.id)
*   `peptide_id`: uuid (FK -> peptides.id)
*   `dosage_amount`: numeric (Added in Advanced Schema Update)
*   `dosage_unit`: text (e.g., 'mg', 'mcg', 'iu')
*   `frequency`: text (e.g., 'daily', 'weekly')
*   `duration_days`: integer
*   `cost_multiplier`: numeric (default 1.0)
*   `notes`: text

## New Tables (Manual Migrations)

### `protocol_logs`
Tracks daily adherence/usage of a protocol item.
*Created via `scripts/create_protocol_logs.sql`*

*   `id`: uuid (PK)
*   `protocol_item_id`: uuid (FK -> protocol_items.id)
*   `user_id`: uuid (FK -> auth.users.id)
*   `status`: text (default 'taken')
*   `taken_at`: timestamp (default now())
*   `notes`: text
*   `created_at`: timestamp (default now())

## Relationships
*   **Protocols** belong to a **Contact**.
*   **Protocol Items** belong to a **Protocol** and reference a **Peptide**.
*   **Protocol Logs** belong to a **Protocol Item**.

## Notes for Other Agents
*   The `protocol_logs` table might not appear in older `types.ts` definitions.
*   `protocol_items` columns (`dosage_amount` etc.) were added via `ALTER TABLE` and may be missing from older introspection.
