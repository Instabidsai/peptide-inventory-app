# Gemini - Project Context & Documentation

## Project Overview
**Name**: Peptide Inventory App (peptide-stock-manager)
**Description**: A comprehensive inventory management system for peptide stocks, tracking bottles, lots, movements, pricing, and contacts.
**Stack**:
-   **Frontend**: React (Vite), TypeScript
-   **Styling**: Tailwind CSS, Shadcn/UI (`@radix-ui/*`)
-   **State/Data**: Tanstack Query (`@tanstack/react-query`)
-   **Routing**: React Router DOM (v6)
-   **Backend/DB**: Supabase (PostgreSQL)

## File Structure
-   `src/components`: UI components (Shadcn/UI based).
-   `src/pages`: Application pages/routes.
-   `src/integrations`: Service integrations (Supabase is located here).
-   `src/hooks`: Custom React hooks.
-   `src/lib`: Utility functions.
-   `supabase/`: DB migrations and types location.

## Database Schema (Supabase)
Mapped from live project: `mckkegmkpqdicudnfhor`

### Core Tables
-   **`peptides`**: The base catalog of peptides (Name, Description, SKU).
-   **`lots`**: Manufacturing lots associated with a specific peptide.
    -   *Columns*: `id`, `peptide_id`, `lot_number`, `expiry_date`, `quantity_received`, `cost_per_unit`.
-   **`bottles`**: Individual units (bottles) of inventory.
    -   *Columns*: `id`, `lot_id`, `org_id`, `uid` (Unique ID), `status` (e.g., in_stock, sold), `location`, `notes`.
-   **`movements`**: Transactional history (Stock In, Stock Out, Adjustments).
    -   *Columns*: `id`, `org_id`, `contact_id`, `type`, `movement_date`, `notes`, `created_by`.
-   **`movement_items`**: Line items for movements.
    -   *Columns*: `id`, `movement_id`, `bottle_id`, `price_at_sale`.
-   **`peptide_pricing`**: Tiered pricing configurations.
    -   *Columns*: `id`, `peptide_id`, `tier`, `price`, `effective_from`.

### Management Tables
-   **`contacts`**: Customers or Suppliers.
    -   *Columns*: `id`, `org_id`, `name`, `email`, `type`, `company`.
-   **`organizations`**: Multi-tenancy support (Org details).
-   **`user_roles`**: RBAC (User Org/Role mapping).
-   **`profiles`**: User profiles.
-   **`audit_log`**: System-wide audit trail.

### RPC Functions
-   `get_user_org_id`: Helper to fetch current user's organization.
-   `generate_bottle_uid`: Logic for creating unique bottle IDs.
-   `is_org_member` / `is_org_admin`: Authorization checks.

## Development Setup
-   **Package Manager**: NPM / Bun.
-   **Run Dev**: `npm run dev`.
-   **Port**: `4550` (Strict/Dedicated).
-   **Environment**: Keys stored in `.env`.
-   **MCP Tools**: Configured (`.cursor/mcp.json`) for GitHub, Supabase, and Context7.

## Current Goals
-   [x] **Financial Tracking**:
    -   `MovementWizard`: Auto-sets price to $0 for Internal/Giveaway movements.
    -   `Peptides`: Added "Financial Stats" dialog showing Inventory Value, Avg Buy Cost, and Effective Cost (adjusted for free use).
-   [x] **UX & Setup**:
    -   Fixed "Receive Inventory" visibility (Admin Permissions).
    -   Auto-populated Peptide Catalog from local "Pure U.S. Peptides" site.
-   Continue building out the backend tables and frontend features.
-   Ensure robust tracking of inventory movements.
