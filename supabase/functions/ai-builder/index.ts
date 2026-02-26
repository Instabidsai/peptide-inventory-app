import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authenticateRequest, AuthError } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { withErrorReporting } from "../_shared/error-reporter.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `You are the AI Builder for a peptide CRM platform. You help tenants customize their CRM by creating custom fields, entities, dashboards, automations, reports, and managing their entire business configuration.

You operate in TWO layers:
- Layer 1 (Config Engine): You write configuration to the database. The app renders it dynamically. This is instant, safe, and covers 90% of requests.
- Layer 2 (Code Builder): For complex features that can't be done with config alone, you escalate to the code builder queue. Use this sparingly.

CAPABILITIES:
1. Add custom fields to existing entities (peptides, contacts, sales_orders, lots, bottles)
2. Create entirely new entity types with custom schemas
3. Add dashboard widgets (tables, charts, stats, lists)
4. Create automation rules (cron, event, threshold triggers)
5. Create saved reports with visualizations
6. Query existing data (read-only)
7. Show the current schema and customizations
8. Escalate to code builder for complex requests
9. Update branding (colors, fonts, logo, favicon)
10. Manage peptide catalog (add, update, remove products + import scraped peptides)
11. Toggle feature flags (enable/disable modules like AI chat, fulfillment, partner network)
12. Manage payment methods (Stripe connection info)
13. Import contacts from CSV-like data
14. Configure storefront settings (store name, welcome message, layout)

RULES:
1. Always confirm before making changes. Show what you'll do and ask to proceed.
2. Use clear field names (snake_case, no spaces).
3. For select fields, always define the options in the "options" config as { choices: ["Option1", "Option2"] }.
4. Dashboard widgets should have sensible default positions and sizes.
5. Automation conditions must always be scoped to the tenant's org_id.
6. Reports use parameterized SQL — always include $org_id placeholder for org_id filtering.
7. Keep suggestions practical and focused on peptide business needs.
8. If a request is too complex for config (needs new API endpoints, complex UI, external integrations), use request_code_builder.
9. For branding changes, validate hex colors and sanitize font names.
10. When importing contacts, validate emails and deduplicate by email address.`;

const tools = [
    {
        type: "function" as const,
        function: {
            name: "add_custom_field",
            description: "Add a custom field to an existing entity type (peptides, contacts, sales_orders, lots, bottles).",
            parameters: {
                type: "object",
                properties: {
                    entity: { type: "string", enum: ["peptides", "contacts", "sales_orders", "lots", "bottles"] },
                    field_name: { type: "string", description: "snake_case name, e.g. 'priority_level'" },
                    label: { type: "string", description: "Display label, e.g. 'Priority Level'" },
                    field_type: { type: "string", enum: ["text", "number", "date", "boolean", "select", "url", "email", "textarea"] },
                    required: { type: "boolean" },
                    options: { type: "object", description: "Config object. For select: { choices: ['High','Medium','Low'] }. For number: { min: 0, max: 100 }." },
                },
                required: ["entity", "field_name", "label", "field_type"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "create_custom_entity",
            description: "Create a brand new entity type with its own schema. Users can then add records to it.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Display name, e.g. 'Suppliers'" },
                    slug: { type: "string", description: "URL-safe slug, e.g. 'suppliers'" },
                    icon: { type: "string", description: "Lucide icon name, e.g. 'Truck'" },
                    description: { type: "string" },
                    fields: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                label: { type: "string" },
                                type: { type: "string", enum: ["text", "number", "date", "boolean", "select", "url", "email", "textarea"] },
                                required: { type: "boolean" },
                                config: { type: "object" },
                            },
                            required: ["name", "label", "type"],
                        },
                    },
                },
                required: ["name", "slug", "fields"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "add_dashboard_widget",
            description: "Add a widget to the tenant's dashboard. Types: table (data grid), chart (bar/line/pie), stat (single number), list (simple list).",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    widget_type: { type: "string", enum: ["table", "chart", "stat", "list"] },
                    config: {
                        type: "object",
                        description: "Widget config. For stat: { query: 'SELECT count(*) as value FROM peptides WHERE org_id = $org_id', subtitle: 'Total Peptides' }. For table: { query: 'SELECT name, status FROM lots WHERE org_id = $org_id LIMIT 10' }. For list: { query: '...', label_field: 'name', value_field: 'count' }.",
                    },
                    size: { type: "string", enum: ["sm", "md", "lg", "full"], description: "Widget size. sm=1col, md=2col, lg=3col, full=full width. Default: md." },
                    position: { type: "number", description: "Sort order (0 = first). Default: 0." },
                    page: { type: "string", description: "Which page to show on. Default: 'dashboard'." },
                },
                required: ["title", "widget_type", "config"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "create_automation",
            description: "Create an automation rule. Triggers: cron (scheduled), event (on insert/update/delete), threshold (when a value crosses a limit).",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    trigger_type: { type: "string", enum: ["cron", "event", "threshold"] },
                    trigger_config: {
                        type: "object",
                        description: "For cron: { schedule: '0 8 * * *' }. For event: { table: 'lots', event: 'INSERT' }. For threshold: { table: 'bottles', field: 'status', condition: 'count_where_eq', value: 5 }.",
                    },
                    condition_sql: { type: "string", description: "Optional WHERE clause (org_id is auto-appended)." },
                    action_type: { type: "string", enum: ["notification", "email", "webhook", "update_field", "create_record"] },
                    action_config: {
                        type: "object",
                        description: "For notification: { title: '...', body: '...' }. For email: { to: '...', subject: '...', template: '...' }. For webhook: { url: '...', method: 'POST' }.",
                    },
                },
                required: ["name", "trigger_type", "trigger_config", "action_type", "action_config"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "create_report",
            description: "Create a saved report with query and visualization.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    query_sql: { type: "string", description: "SELECT query. Use $org_id placeholder for org_id. Must be SELECT only." },
                    parameters: { type: "object", description: "Default parameter values, e.g. { date_range: '30d' }." },
                    chart_type: { type: "string", enum: ["table", "bar", "line", "pie", "stat", "area"] },
                    chart_config: { type: "object", description: "For charts: { x_key: 'name', y_key: 'count', colors: ['#10b981'] }." },
                },
                required: ["name", "query_sql", "chart_type"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "list_schema",
            description: "Show all existing entities, custom fields, custom entities, and customizations for this tenant.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "query_data",
            description: "Run a read-only query on tenant data. Only SELECT statements allowed. Use $org_id as placeholder for the tenant's organization ID.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "SQL SELECT query. Use $org_id as placeholder for the tenant's organization ID." },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "request_code_builder",
            description: "Escalate a complex request to the code builder (Claude Code). Use this for features that cannot be done with configuration alone.",
            parameters: {
                type: "object",
                properties: {
                    description: { type: "string", description: "Detailed description of what needs to be built." },
                },
                required: ["description"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "update_branding",
            description: "Update the tenant's brand settings: colors, font, logo, favicon, or brand name.",
            parameters: {
                type: "object",
                properties: {
                    primary_color: { type: "string", description: "Hex color, e.g. '#10b981'" },
                    secondary_color: { type: "string", description: "Hex color for accent/secondary" },
                    font_family: { type: "string", description: "Google Font name, e.g. 'Inter', 'Montserrat'" },
                    logo_url: { type: "string", description: "URL to the logo image" },
                    favicon_url: { type: "string", description: "URL to the favicon" },
                    brand_name: { type: "string", description: "Company/brand display name" },
                },
                required: [],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "manage_catalog",
            description: "Add, update, or remove peptides from the catalog. Also import pending scraped peptides.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["add", "update", "remove", "import_scraped", "list"] },
                    peptide_id: { type: "string", description: "UUID of existing peptide (for update/remove)" },
                    name: { type: "string", description: "Peptide name, e.g. 'BPC-157'" },
                    price: { type: "number", description: "Price in dollars" },
                    description: { type: "string" },
                    category: { type: "string" },
                    sku: { type: "string" },
                    active: { type: "boolean", description: "Whether the peptide is visible in the store" },
                },
                required: ["action"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "toggle_feature",
            description: "Enable or disable a feature module for this tenant. Features: ai_chat, ai_builder, client_store, fulfillment, partner_network, commissions, white_label, custom_domain.",
            parameters: {
                type: "object",
                properties: {
                    feature_key: { type: "string", enum: ["ai_chat", "ai_builder", "client_store", "fulfillment", "partner_network", "commissions", "white_label", "custom_domain"] },
                    enabled: { type: "boolean" },
                },
                required: ["feature_key", "enabled"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "manage_payment_methods",
            description: "View or update the tenant's payment configuration (Stripe keys, payment methods enabled).",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["view", "update"] },
                    stripe_publishable_key: { type: "string" },
                    payment_methods: {
                        type: "array",
                        items: { type: "string", enum: ["card", "us_bank_account", "cashapp", "crypto"] },
                        description: "Which payment methods to enable",
                    },
                },
                required: ["action"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "import_contacts",
            description: "Import contacts into the CRM. Provide an array of contact objects with name and email (minimum). Deduplicates by email.",
            parameters: {
                type: "object",
                properties: {
                    contacts: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                email: { type: "string" },
                                phone: { type: "string" },
                                company: { type: "string" },
                                notes: { type: "string" },
                            },
                            required: ["name", "email"],
                        },
                    },
                },
                required: ["contacts"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "configure_store",
            description: "Update the client-facing store configuration: welcome message, layout, visibility settings.",
            parameters: {
                type: "object",
                properties: {
                    store_name: { type: "string", description: "Display name for the store" },
                    welcome_message: { type: "string", description: "Welcome text shown to customers" },
                    show_prices: { type: "boolean", description: "Whether to show prices publicly" },
                    require_login: { type: "boolean", description: "Whether customers must log in to browse" },
                    layout: { type: "string", enum: ["grid", "list"], description: "Product layout style" },
                },
                required: [],
            },
        },
    },
];

async function executeTool(
    name: string,
    args: any,
    supabase: any,
    orgId: string,
    userId: string
): Promise<string> {
    try {
        switch (name) {
            case "add_custom_field": {
                // Check for duplicate
                const { data: existing } = await supabase
                    .from("custom_fields")
                    .select("id")
                    .eq("org_id", orgId)
                    .eq("entity", args.entity)
                    .eq("field_name", args.field_name)
                    .single();

                if (existing) {
                    return `Field '${args.field_name}' already exists on ${args.entity}. Use a different name.`;
                }

                // Get next sort order
                const { data: fields } = await supabase
                    .from("custom_fields")
                    .select("sort_order")
                    .eq("org_id", orgId)
                    .eq("entity", args.entity)
                    .order("sort_order", { ascending: false })
                    .limit(1);

                const nextOrder = (fields?.[0]?.sort_order ?? -1) + 1;

                const { error } = await supabase
                    .from("custom_fields")
                    .insert({
                        org_id: orgId,
                        entity: args.entity,
                        field_name: args.field_name,
                        label: args.label,
                        field_type: args.field_type,
                        options: args.options || {},
                        required: args.required || false,
                        sort_order: nextOrder,
                        active: true,
                    })
                    .select()
                    .single();

                if (error) return `Error adding field: ${error.message}`;
                return `Custom field added: "${args.label}" (${args.field_type}) on ${args.entity}. It will appear on all ${args.entity} forms immediately.`;
            }

            case "create_custom_entity": {
                const schema = (args.fields || []).map((f: any) => ({
                    name: f.name,
                    label: f.label,
                    type: f.type,
                    required: f.required || false,
                    config: f.config || {},
                }));

                const { error } = await supabase
                    .from("custom_entities")
                    .insert({
                        org_id: orgId,
                        name: args.name,
                        slug: args.slug,
                        icon: args.icon || "Box",
                        description: args.description || "",
                        schema,
                        active: true,
                    })
                    .select()
                    .single();

                if (error) return `Error creating entity: ${error.message}`;
                return `Custom entity "${args.name}" created with ${schema.length} fields. It will appear in your sidebar at /custom/${args.slug}. You can now add records to it.`;
            }

            case "add_dashboard_widget": {
                const { error } = await supabase
                    .from("custom_dashboard_widgets")
                    .insert({
                        org_id: orgId,
                        title: args.title,
                        widget_type: args.widget_type,
                        config: args.config,
                        position: args.position ?? 0,
                        size: args.size || "md",
                        page: args.page || "dashboard",
                        active: true,
                    })
                    .select()
                    .single();

                if (error) return `Error adding widget: ${error.message}`;
                return `Dashboard widget "${args.title}" (${args.widget_type}, size: ${args.size || "md"}) added to ${args.page || "dashboard"} page. It will render on your next page load.`;
            }

            case "create_automation": {
                const { error } = await supabase
                    .from("custom_automations")
                    .insert({
                        org_id: orgId,
                        name: args.name,
                        description: args.description || "",
                        trigger_type: args.trigger_type,
                        trigger_config: args.trigger_config,
                        condition_sql: args.condition_sql || null,
                        action_type: args.action_type,
                        action_config: args.action_config,
                        active: true,
                    })
                    .select()
                    .single();

                if (error) return `Error creating automation: ${error.message}`;
                return `Automation "${args.name}" created and active. Trigger: ${args.trigger_type}, Action: ${args.action_type}. You can toggle it on/off from the Customizations page.`;
            }

            case "create_report": {
                // Validate SELECT only
                const trimmed = args.query_sql.trim().toUpperCase();
                if (!trimmed.startsWith("SELECT")) {
                    return "Error: Reports only support SELECT queries. No INSERT, UPDATE, or DELETE allowed.";
                }

                const { error } = await supabase
                    .from("custom_reports")
                    .insert({
                        org_id: orgId,
                        name: args.name,
                        description: args.description || "",
                        query_sql: args.query_sql,
                        parameters: args.parameters || {},
                        chart_type: args.chart_type,
                        chart_config: args.chart_config || {},
                        created_by: userId,
                    })
                    .select()
                    .single();

                if (error) return `Error creating report: ${error.message}`;
                return `Report "${args.name}" created with ${args.chart_type} visualization. View it from the Reports section.`;
            }

            case "list_schema": {
                // Core entities
                const coreEntities = ["peptides", "contacts", "sales_orders", "lots", "bottles"];

                // Custom fields per entity
                const { data: customFields } = await supabase
                    .from("custom_fields")
                    .select("entity, field_name, label, field_type, required")
                    .eq("org_id", orgId)
                    .eq("active", true)
                    .order("entity")
                    .order("sort_order");

                // Custom entities
                const { data: customEntities } = await supabase
                    .from("custom_entities")
                    .select("name, slug, icon, schema")
                    .eq("org_id", orgId)
                    .eq("active", true);

                // Dashboard widgets
                const { data: widgets } = await supabase
                    .from("custom_dashboard_widgets")
                    .select("title, widget_type, page, active")
                    .eq("org_id", orgId);

                // Automations
                const { data: automations } = await supabase
                    .from("custom_automations")
                    .select("name, trigger_type, action_type, active")
                    .eq("org_id", orgId);

                // Reports
                const { data: reports } = await supabase
                    .from("custom_reports")
                    .select("name, chart_type")
                    .eq("org_id", orgId);

                let result = "=== YOUR CRM SCHEMA ===\n\n";

                result += "CORE ENTITIES:\n";
                for (const entity of coreEntities) {
                    const fields = customFields?.filter((f: any) => f.entity === entity) || [];
                    result += `  ${entity}${fields.length ? ` (+${fields.length} custom fields)` : ""}\n`;
                    for (const f of fields) {
                        result += `    - ${f.label} (${f.field_type})${f.required ? " *required" : ""}\n`;
                    }
                }

                if (customEntities?.length) {
                    result += "\nCUSTOM ENTITIES:\n";
                    for (const e of customEntities) {
                        const fieldCount = Array.isArray(e.schema) ? e.schema.length : 0;
                        result += `  ${e.name} (/${e.slug}) — ${fieldCount} fields\n`;
                    }
                }

                if (widgets?.length) {
                    result += "\nDASHBOARD WIDGETS:\n";
                    for (const w of widgets) {
                        result += `  ${w.title} (${w.widget_type}) on ${w.page} — ${w.active ? "active" : "inactive"}\n`;
                    }
                }

                if (automations?.length) {
                    result += "\nAUTOMATIONS:\n";
                    for (const a of automations) {
                        result += `  ${a.name} — ${a.trigger_type} → ${a.action_type} — ${a.active ? "active" : "inactive"}\n`;
                    }
                }

                if (reports?.length) {
                    result += "\nREPORTS:\n";
                    for (const r of reports) {
                        result += `  ${r.name} (${r.chart_type})\n`;
                    }
                }

                if (!customFields?.length && !customEntities?.length && !widgets?.length && !automations?.length && !reports?.length) {
                    result += "\nNo customizations yet. Tell me what you'd like to add!";
                }

                return result;
            }

            case "query_data": {
                const query = args.query.trim();
                if (!query.toUpperCase().startsWith("SELECT")) {
                    return "Error: Only SELECT queries are allowed.";
                }

                // Use the run_readonly_query RPC which handles $org_id replacement safely
                const { data, error } = await supabase.rpc("run_readonly_query", {
                    query_text: query,
                    p_org_id: orgId,
                });

                if (error) {
                    return `Query error: ${error.message}. Make sure the table exists and the query syntax is correct.`;
                }

                if (!data || (Array.isArray(data) && data.length === 0)) {
                    return "Query returned no results.";
                }

                // Format as text table
                const rows = Array.isArray(data) ? data : [data];
                if (rows.length === 0) return "No results.";

                const keys = Object.keys(rows[0]);
                const header = keys.join(" | ");
                const lines = rows.slice(0, 50).map((row: any) =>
                    keys.map((k) => String(row[k] ?? "null")).join(" | ")
                );

                return `${header}\n${"—".repeat(header.length)}\n${lines.join("\n")}${rows.length > 50 ? `\n... and ${rows.length - 50} more rows` : ""}`;
            }

            case "request_code_builder": {
                const { error } = await supabase
                    .from("ai_builder_tasks")
                    .insert({
                        org_id: orgId,
                        request_text: args.description,
                        status: "pending",
                        layer: "builder",
                        created_by: userId,
                    })
                    .select()
                    .single();

                if (error) return `Error submitting build request: ${error.message}`;
                return `Build request submitted. This has been queued for the code builder. You'll be notified when it's ready. The code builder can create custom API endpoints, complex UI components, and external integrations.`;
            }

            case "update_branding": {
                const updates: Record<string, unknown> = {};
                const hexRe = /^#[0-9a-fA-F]{3,6}$/;

                if (args.primary_color) {
                    if (!hexRe.test(args.primary_color)) return "Invalid primary_color — use hex format like '#10b981'.";
                    updates.primary_color = args.primary_color;
                }
                if (args.secondary_color) {
                    if (!hexRe.test(args.secondary_color)) return "Invalid secondary_color — use hex format.";
                    updates.secondary_color = args.secondary_color;
                }
                if (args.font_family) updates.font_family = args.font_family.slice(0, 100);
                if (args.logo_url) updates.logo_url = args.logo_url;
                if (args.favicon_url) updates.favicon_url = args.favicon_url;
                if (args.brand_name) updates.brand_name = args.brand_name.slice(0, 200);

                if (Object.keys(updates).length === 0) return "No branding fields provided. Specify at least one: primary_color, secondary_color, font_family, logo_url, favicon_url, or brand_name.";

                const { error } = await supabase
                    .from("tenant_config")
                    .update(updates)
                    .eq("org_id", orgId);

                if (error) return `Error updating branding: ${error.message}`;
                const fields = Object.keys(updates).join(", ");
                return `Branding updated: ${fields}. Changes take effect on next page load for your subdomain visitors.`;
            }

            case "manage_catalog": {
                switch (args.action) {
                    case "list": {
                        const { data, error } = await supabase
                            .from("peptides")
                            .select("id, name, price, category, sku, active")
                            .eq("org_id", orgId)
                            .order("name")
                            .limit(100);

                        if (error) return `Error listing catalog: ${error.message}`;
                        if (!data?.length) return "Your catalog is empty. Use action 'add' to add peptides, or 'import_scraped' to import from your website scan.";

                        return `Catalog (${data.length} products):\n` +
                            data.map((p: any) => `  ${p.name} — $${p.price ?? "N/A"} — ${p.active ? "active" : "inactive"} (${p.id})`).join("\n");
                    }
                    case "add": {
                        if (!args.name) return "Peptide name is required.";
                        const { error } = await supabase
                            .from("peptides")
                            .insert({
                                org_id: orgId,
                                name: args.name,
                                price: args.price ?? null,
                                description: args.description || "",
                                category: args.category || "general",
                                sku: args.sku || "",
                                active: args.active !== false,
                            });

                        if (error) return `Error adding peptide: ${error.message}`;
                        return `Added "${args.name}" to your catalog${args.price ? ` at $${args.price}` : ""}. It's now visible in your store.`;
                    }
                    case "update": {
                        if (!args.peptide_id) return "peptide_id is required for updates.";
                        const updates: Record<string, unknown> = {};
                        if (args.name) updates.name = args.name;
                        if (args.price !== undefined) updates.price = args.price;
                        if (args.description !== undefined) updates.description = args.description;
                        if (args.category) updates.category = args.category;
                        if (args.sku !== undefined) updates.sku = args.sku;
                        if (args.active !== undefined) updates.active = args.active;

                        if (Object.keys(updates).length === 0) return "No fields to update.";

                        const { error } = await supabase
                            .from("peptides")
                            .update(updates)
                            .eq("id", args.peptide_id)
                            .eq("org_id", orgId);

                        if (error) return `Error updating peptide: ${error.message}`;
                        return `Peptide ${args.peptide_id} updated: ${Object.keys(updates).join(", ")}.`;
                    }
                    case "remove": {
                        if (!args.peptide_id) return "peptide_id is required.";
                        // Soft-delete by setting active = false
                        const { error } = await supabase
                            .from("peptides")
                            .update({ active: false })
                            .eq("id", args.peptide_id)
                            .eq("org_id", orgId);

                        if (error) return `Error removing peptide: ${error.message}`;
                        return `Peptide ${args.peptide_id} deactivated. It's hidden from the store but data is preserved.`;
                    }
                    case "import_scraped": {
                        // Import all pending scraped peptides into real peptides table
                        const { data: scraped, error: fetchErr } = await supabase
                            .from("scraped_peptides")
                            .select("*")
                            .eq("org_id", orgId)
                            .eq("status", "pending");

                        if (fetchErr) return `Error fetching scraped peptides: ${fetchErr.message}`;
                        if (!scraped?.length) return "No pending scraped peptides to import. Use the website scraper during onboarding first.";

                        let imported = 0;
                        for (const sp of scraped) {
                            const { data: newPeptide, error: insErr } = await supabase
                                .from("peptides")
                                .insert({
                                    org_id: orgId,
                                    name: sp.name,
                                    price: sp.price,
                                    description: sp.description || "",
                                    active: true,
                                })
                                .select("id")
                                .single();

                            if (!insErr && newPeptide) {
                                await supabase
                                    .from("scraped_peptides")
                                    .update({ status: "accepted", imported_peptide_id: newPeptide.id })
                                    .eq("id", sp.id);
                                imported++;
                            }
                        }

                        return `Imported ${imported} of ${scraped.length} scraped peptides into your catalog. They're now live in your store.`;
                    }
                    default:
                        return `Unknown catalog action: ${args.action}. Use: list, add, update, remove, or import_scraped.`;
                }
            }

            case "toggle_feature": {
                const { data: existing } = await supabase
                    .from("org_features")
                    .select("id")
                    .eq("org_id", orgId)
                    .eq("feature_key", args.feature_key)
                    .single();

                if (existing) {
                    const { error } = await supabase
                        .from("org_features")
                        .update({ enabled: args.enabled })
                        .eq("id", existing.id);

                    if (error) return `Error toggling feature: ${error.message}`;
                } else {
                    const { error } = await supabase
                        .from("org_features")
                        .insert({ org_id: orgId, feature_key: args.feature_key, enabled: args.enabled });

                    if (error) return `Error creating feature flag: ${error.message}`;
                }

                return `Feature "${args.feature_key}" is now ${args.enabled ? "ENABLED" : "DISABLED"}. Changes take effect immediately.`;
            }

            case "manage_payment_methods": {
                if (args.action === "view") {
                    const { data } = await supabase
                        .from("tenant_config")
                        .select("stripe_account_id, payment_methods_enabled")
                        .eq("org_id", orgId)
                        .single();

                    if (!data) return "No payment config found.";
                    const methods = data.payment_methods_enabled || ["card"];
                    return `Payment Config:\n  Stripe: ${data.stripe_account_id ? "Connected" : "Not connected"}\n  Methods: ${Array.isArray(methods) ? methods.join(", ") : methods}`;
                }

                const updates: Record<string, unknown> = {};
                if (args.stripe_publishable_key) updates.stripe_publishable_key = args.stripe_publishable_key;
                if (args.payment_methods) updates.payment_methods_enabled = args.payment_methods;

                if (Object.keys(updates).length === 0) return "No payment fields to update.";

                const { error } = await supabase
                    .from("tenant_config")
                    .update(updates)
                    .eq("org_id", orgId);

                if (error) return `Error updating payment config: ${error.message}`;
                return `Payment configuration updated: ${Object.keys(updates).join(", ")}.`;
            }

            case "import_contacts": {
                if (!args.contacts?.length) return "No contacts provided.";
                if (args.contacts.length > 500) return "Maximum 500 contacts per import.";

                // Get existing emails to deduplicate
                const emails = args.contacts.map((c: any) => c.email.toLowerCase());
                const { data: existing } = await supabase
                    .from("contacts")
                    .select("email")
                    .eq("org_id", orgId)
                    .in("email", emails);

                const existingEmails = new Set((existing || []).map((e: any) => e.email?.toLowerCase()));
                const newContacts = args.contacts.filter(
                    (c: any) => !existingEmails.has(c.email.toLowerCase())
                );

                if (newContacts.length === 0) {
                    return `All ${args.contacts.length} contacts already exist in your CRM. No duplicates imported.`;
                }

                const rows = newContacts.map((c: any) => ({
                    org_id: orgId,
                    name: c.name,
                    email: c.email.toLowerCase(),
                    phone: c.phone || null,
                    company: c.company || null,
                    notes: c.notes || null,
                    status: "active",
                }));

                const { error } = await supabase.from("contacts").insert(rows);
                if (error) return `Error importing contacts: ${error.message}`;

                const skipped = args.contacts.length - newContacts.length;
                return `Imported ${newContacts.length} contacts.${skipped > 0 ? ` Skipped ${skipped} duplicates.` : ""}`;
            }

            case "configure_store": {
                const updates: Record<string, unknown> = {};
                if (args.store_name !== undefined) updates.store_name = args.store_name;
                if (args.welcome_message !== undefined) updates.store_welcome_message = args.welcome_message;
                if (args.show_prices !== undefined) updates.store_show_prices = args.show_prices;
                if (args.require_login !== undefined) updates.store_require_login = args.require_login;
                if (args.layout !== undefined) updates.store_layout = args.layout;

                if (Object.keys(updates).length === 0) return "No store settings provided.";

                const { error } = await supabase
                    .from("tenant_config")
                    .update(updates)
                    .eq("org_id", orgId);

                if (error) return `Error updating store config: ${error.message}`;
                return `Store settings updated: ${Object.keys(updates).join(", ")}. Changes are live for your customers.`;
            }

            default:
                return `Unknown tool: ${name}`;
        }
    } catch (err: any) {
        return `Tool error (${name}): ${err.message}`;
    }
}

Deno.serve(withErrorReporting("ai-builder", async (req) => {
    const corsHeaders = getCorsHeaders(req);
    const preflight = handleCors(req);
    if (preflight) return preflight;

    try {
        const { user, orgId, supabase } = await authenticateRequest(req, {
            requireRole: ["admin", "super_admin"],
        });

        const { message, history: clientHistory } = await req.json();
        if (!message) return jsonResponse({ error: "message required" }, 400, corsHeaders);

        // Build conversation history
        const conversationMessages = [
            { role: "system" as const, content: SYSTEM_PROMPT },
            ...(clientHistory || []).map((m: any) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
            })),
            { role: "user" as const, content: message },
        ];

        let response: string | undefined;
        let loopCount = 0;
        const maxLoops = 6;

        while (loopCount < maxLoops) {
            loopCount++;

            const completion = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: conversationMessages,
                    tools,
                    tool_choice: "auto",
                    temperature: 0.3,
                }),
            });

            const data = await completion.json();

            if (data.error) {
                console.error("[ai-builder] OpenAI error:", data.error);
                response = "Sorry, there was an API error. Please try again.";
                break;
            }

            const choice = data.choices?.[0];
            if (!choice) {
                response = "Sorry, I couldn't process that request.";
                break;
            }

            if (choice.finish_reason === "tool_calls" || choice.message?.tool_calls) {
                conversationMessages.push(choice.message);

                for (const tc of choice.message.tool_calls) {
                    const tcArgs = JSON.parse(tc.function.arguments);
                    const result = await executeTool(
                        tc.function.name,
                        tcArgs,
                        supabase,
                        orgId,
                        user.id
                    );
                    conversationMessages.push({
                        role: "tool" as any,
                        tool_call_id: tc.id,
                        content: result,
                    } as any);
                }
                continue;
            }

            response = choice.message?.content || "No response.";
            break;
        }

        if (!response) response = "Processing took too long. Please try again.";

        return jsonResponse({ reply: response }, 200, corsHeaders);
    } catch (err) {
        if (err instanceof AuthError) {
            return jsonResponse({ error: err.message }, err.status, corsHeaders);
        }
        console.error("[ai-builder]", err);
        return jsonResponse({ error: (err as Error).message || "Internal error" }, 500, corsHeaders);
    }
}));
