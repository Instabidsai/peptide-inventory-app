import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);

function getCorsHeaders(req: Request) {
    const origin = req.headers.get('origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] || '');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

const SYSTEM_PROMPT = `You are the AI Builder for a peptide CRM platform. You help tenants customize their CRM by creating custom fields, entities, dashboards, automations, and reports.

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

RULES:
1. Always confirm before making changes. Show what you'll do and ask to proceed.
2. Use clear field names (snake_case, no spaces).
3. For select fields, always define the options in the "options" config as { choices: ["Option1", "Option2"] }.
4. Dashboard widgets should have sensible default positions and sizes.
5. Automation conditions must always be scoped to the tenant's org_id.
6. Reports use parameterized SQL — always include $org_id placeholder for org_id filtering.
7. Keep suggestions practical and focused on peptide business needs.
8. If a request is too complex for config (needs new API endpoints, complex UI, external integrations), use request_code_builder.`;

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

            default:
                return `Unknown tool: ${name}`;
        }
    } catch (err: any) {
        return `Tool error (${name}): ${err.message}`;
    }
}

Deno.serve(async (req) => {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const json = (body: object, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return json({ error: "Missing authorization" }, 401);

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) return json({ error: "Invalid token" }, 401);

        // Get user's org
        const { data: profile } = await supabase
            .from("profiles")
            .select("org_id, role")
            .eq("user_id", user.id)
            .single();

        if (!profile?.org_id) return json({ error: "No organization" }, 400);

        // Require admin role for builder
        const { data: userRole } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("org_id", profile.org_id)
            .single();

        const role = userRole?.role || profile.role;
        if (!["admin", "super_admin"].includes(role)) {
            return json({ error: "Admin role required for AI Builder" }, 403);
        }

        const { message, history: clientHistory } = await req.json();
        if (!message) return json({ error: "message required" }, 400);

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
                        profile.org_id,
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

        return json({ reply: response });
    } catch (err) {
        console.error("[ai-builder]", err);
        return json({ error: (err as Error).message || "Internal error" }, 500);
    }
});
