/**
 * Dynamic Composio tool injection for AI agents.
 * When a tenant connects a service (Gmail, Slack, Trello, etc.) via Composio,
 * this module adds corresponding AI tools so the agent can USE those connections.
 */

const COMPOSIO_API_KEY = Deno.env.get("COMPOSIO_API_KEY") || "";
const COMPOSIO_EXECUTE_URL = "https://backend.composio.dev/api/v2/actions";

// ── Service → AI Tool Definitions ────────────────────────────
// Each connected service unlocks specific tools the AI can use.
// Tool names are prefixed with the service to avoid collisions.

interface ComposioToolDef {
  toolName: string;
  description: string;
  parameters: Record<string, any>;
  composioAction: string; // The Composio action name (e.g. GMAIL_SEND_EMAIL)
  inputMapper: (args: Record<string, any>) => Record<string, any>; // Map AI args → Composio input
}

const SERVICE_TOOLS: Record<string, ComposioToolDef[]> = {
  gmail: [
    {
      toolName: "gmail_send_email",
      description: "Send an email via the connected Gmail account. Use for customer communications, invoices, follow-ups.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body (plain text or simple HTML)" },
        },
        required: ["to", "subject", "body"],
      },
      composioAction: "GMAIL_SEND_EMAIL",
      inputMapper: (args) => ({ recipient_email: args.to, subject: args.subject, body: args.body }),
    },
    {
      toolName: "gmail_search_emails",
      description: "Search the connected Gmail inbox. Use to find customer emails, payment confirmations, supplier communications.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query (e.g. 'from:customer@example.com', 'subject:payment', 'newer_than:7d')" },
          max_results: { type: "number", description: "Max emails to return (default 10)" },
        },
        required: ["query"],
      },
      composioAction: "GMAIL_FETCH_EMAILS",
      inputMapper: (args) => ({ query: args.query, max_results: args.max_results || 10 }),
    },
  ],

  slack: [
    {
      toolName: "slack_send_message",
      description: "Send a message to a Slack channel. Use for team notifications, order alerts, inventory updates.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Channel name (e.g. '#orders') or channel ID" },
          message: { type: "string", description: "The message text to send" },
        },
        required: ["channel", "message"],
      },
      composioAction: "SLACK_SEND_MESSAGE",
      inputMapper: (args) => ({ channel: args.channel, text: args.message }),
    },
    {
      toolName: "slack_list_channels",
      description: "List available Slack channels to find where to send messages.",
      parameters: { type: "object", properties: {} },
      composioAction: "SLACK_LIST_ALL_CHANNELS",
      inputMapper: () => ({}),
    },
  ],

  discord: [
    {
      toolName: "discord_send_message",
      description: "Send a message to a Discord channel. Use for community updates, announcements.",
      parameters: {
        type: "object",
        properties: {
          channel_id: { type: "string", description: "Discord channel ID" },
          message: { type: "string", description: "Message content" },
        },
        required: ["channel_id", "message"],
      },
      composioAction: "DISCORD_SEND_MESSAGE",
      inputMapper: (args) => ({ channel_id: args.channel_id, content: args.message }),
    },
  ],

  sheets: [
    {
      toolName: "sheets_read_data",
      description: "Read data from a Google Sheets spreadsheet. Use for importing data, checking reports, syncing inventory.",
      parameters: {
        type: "object",
        properties: {
          spreadsheet_id: { type: "string", description: "The Google Sheets spreadsheet ID (from the URL)" },
          range: { type: "string", description: "Cell range (e.g. 'Sheet1!A1:D10', 'Orders!A:F')" },
        },
        required: ["spreadsheet_id", "range"],
      },
      composioAction: "GOOGLESHEETS_BATCH_GET",
      inputMapper: (args) => ({ spreadsheet_id: args.spreadsheet_id, ranges: args.range }),
    },
    {
      toolName: "sheets_write_data",
      description: "Write/append data to a Google Sheets spreadsheet. Use for exporting reports, logging data.",
      parameters: {
        type: "object",
        properties: {
          spreadsheet_id: { type: "string", description: "The spreadsheet ID" },
          range: { type: "string", description: "Target range (e.g. 'Sheet1!A1')" },
          values: { type: "string", description: "JSON array of arrays, e.g. [[\"Name\",\"Price\"],[\"BPC-157\",\"45\"]]" },
        },
        required: ["spreadsheet_id", "range", "values"],
      },
      composioAction: "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
      inputMapper: (args) => ({
        spreadsheet_id: args.spreadsheet_id,
        range: args.range,
        values: typeof args.values === "string" ? JSON.parse(args.values) : args.values,
        value_input_option: "USER_ENTERED",
      }),
    },
  ],

  drive: [
    {
      toolName: "drive_search_files",
      description: "Search Google Drive for files by name or content. Use to find documents, invoices, reports.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (file name or content keywords)" },
        },
        required: ["query"],
      },
      composioAction: "GOOGLEDRIVE_FIND_FILE",
      inputMapper: (args) => ({ query: args.query }),
    },
  ],

  notion: [
    {
      toolName: "notion_create_page",
      description: "Create a new page in Notion. Use for documenting processes, SOPs, meeting notes.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Page title" },
          content: { type: "string", description: "Page content (text)" },
          parent_page_id: { type: "string", description: "Optional: parent page ID to nest under" },
        },
        required: ["title", "content"],
      },
      composioAction: "NOTION_CREATE_NOTION_PAGE",
      inputMapper: (args) => ({ title: args.title, content: args.content, parent_page_id: args.parent_page_id }),
    },
    {
      toolName: "notion_search",
      description: "Search Notion for pages and databases by keyword.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keyword" },
        },
        required: ["query"],
      },
      composioAction: "NOTION_SEARCH_NOTION_PAGE",
      inputMapper: (args) => ({ query: args.query }),
    },
  ],

  trello: [
    {
      toolName: "trello_create_card",
      description: "Create a Trello card. Use for task tracking, order follow-ups, inventory to-dos.",
      parameters: {
        type: "object",
        properties: {
          board_name: { type: "string", description: "Board name (e.g. 'Orders', 'Inventory')" },
          list_name: { type: "string", description: "List name (e.g. 'To Do', 'In Progress')" },
          title: { type: "string", description: "Card title" },
          description: { type: "string", description: "Card description" },
        },
        required: ["title"],
      },
      composioAction: "TRELLO_ADD_CARDS",
      inputMapper: (args) => ({ name: args.title, desc: args.description || "" }),
    },
    {
      toolName: "trello_list_boards",
      description: "List all Trello boards to see available boards and their IDs.",
      parameters: { type: "object", properties: {} },
      composioAction: "TRELLO_GET_MEMBERS_ME_BOARDS",
      inputMapper: () => ({}),
    },
  ],

  hubspot: [
    {
      toolName: "hubspot_create_contact",
      description: "Create a contact in HubSpot CRM. Use for syncing customers to your CRM.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          firstname: { type: "string" },
          lastname: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
        },
        required: ["email"],
      },
      composioAction: "HUBSPOT_CREATE_CONTACT",
      inputMapper: (args) => ({ properties: args }),
    },
  ],

  calendly: [
    {
      toolName: "calendly_list_events",
      description: "List upcoming Calendly events/appointments.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "number", description: "Number of events to return (default 10)" },
        },
      },
      composioAction: "CALENDLY_LIST_EVENTS",
      inputMapper: (args) => ({ count: args.count || 10 }),
    },
  ],

  stripe: [
    {
      toolName: "stripe_list_recent_payments",
      description: "List recent Stripe payments/charges. Use to verify payments, check transaction history.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of payments to return (default 10)" },
        },
      },
      composioAction: "STRIPE_LIST_CHARGES",
      inputMapper: (args) => ({ limit: args.limit || 10 }),
    },
    {
      toolName: "stripe_create_payment_link",
      description: "Create a Stripe payment link for quick invoicing. Send the link to a customer to collect payment.",
      parameters: {
        type: "object",
        properties: {
          product_name: { type: "string", description: "Product/service name" },
          amount_cents: { type: "number", description: "Amount in cents (e.g. 4500 for $45.00)" },
          currency: { type: "string", description: "Currency code (default: usd)" },
        },
        required: ["product_name", "amount_cents"],
      },
      composioAction: "STRIPE_CREATE_PAYMENT_LINK",
      inputMapper: (args) => ({
        line_items: [{ price_data: { currency: args.currency || "usd", product_data: { name: args.product_name }, unit_amount: args.amount_cents }, quantity: 1 }],
      }),
    },
  ],

  mailchimp: [
    {
      toolName: "mailchimp_list_audiences",
      description: "List Mailchimp audiences/lists for email marketing.",
      parameters: { type: "object", properties: {} },
      composioAction: "MAILCHIMP_LIST_AUDIENCES",
      inputMapper: () => ({}),
    },
  ],

  asana: [
    {
      toolName: "asana_create_task",
      description: "Create a task in Asana for project tracking.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Task name" },
          notes: { type: "string", description: "Task description" },
          project_id: { type: "string", description: "Asana project ID" },
        },
        required: ["name"],
      },
      composioAction: "ASANA_CREATE_TASK",
      inputMapper: (args) => ({ name: args.name, notes: args.notes || "", projects: args.project_id ? [args.project_id] : [] }),
    },
  ],

  zendesk: [
    {
      toolName: "zendesk_create_ticket",
      description: "Create a Zendesk support ticket. Use for customer support tracking.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Ticket subject" },
          description: { type: "string", description: "Ticket description/body" },
          requester_email: { type: "string", description: "Customer email" },
        },
        required: ["subject", "description"],
      },
      composioAction: "ZENDESK_CREATE_TICKET",
      inputMapper: (args) => ({ subject: args.subject, description: args.description, requester: args.requester_email ? { email: args.requester_email } : undefined }),
    },
  ],

  intercom: [
    {
      toolName: "intercom_send_message",
      description: "Send a message to a customer via Intercom live chat.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Intercom user/contact ID" },
          message: { type: "string", description: "Message body" },
        },
        required: ["user_id", "message"],
      },
      composioAction: "INTERCOM_SEND_MESSAGE",
      inputMapper: (args) => ({ user_id: args.user_id, body: args.message }),
    },
  ],
};

// ── Load connected services → tool definitions ───────────────

interface ConnectedService {
  service: string;
  composio_connection_id: string | null;
}

export async function loadComposioTools(supabase: any, orgId: string): Promise<{
  tools: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, any> } }>;
  connectionMap: Map<string, string>; // toolName → composio_connection_id
  serviceList: string[]; // connected service names for system prompt
}> {
  const result = {
    tools: [] as Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, any> } }>,
    connectionMap: new Map<string, string>(),
    serviceList: [] as string[],
  };

  if (!COMPOSIO_API_KEY) return result;

  try {
    const { data: connections } = await supabase
      .from("tenant_connections")
      .select("service, composio_connection_id")
      .eq("org_id", orgId)
      .eq("status", "connected");

    if (!connections || connections.length === 0) return result;

    for (const conn of connections as ConnectedService[]) {
      const serviceDefs = SERVICE_TOOLS[conn.service];
      if (!serviceDefs || !conn.composio_connection_id) continue;

      result.serviceList.push(conn.service);

      for (const def of serviceDefs) {
        result.tools.push({
          type: "function" as const,
          function: {
            name: def.toolName,
            description: def.description,
            parameters: def.parameters,
          },
        });
        result.connectionMap.set(def.toolName, conn.composio_connection_id);
      }
    }
  } catch (err) {
    console.error("[composio-tools] Failed to load connected services:", (err as Error).message);
  }

  return result;
}

// ── Execute a Composio tool ──────────────────────────────────

export async function executeComposioTool(
  toolName: string,
  args: Record<string, any>,
  connectionId: string,
): Promise<string> {
  // Find the tool definition to get the Composio action name and input mapper
  for (const serviceDefs of Object.values(SERVICE_TOOLS)) {
    for (const def of serviceDefs) {
      if (def.toolName === toolName) {
        const composioInput = def.inputMapper(args);

        try {
          const res = await fetch(`${COMPOSIO_EXECUTE_URL}/${def.composioAction}/execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": COMPOSIO_API_KEY,
            },
            body: JSON.stringify({
              connectedAccountId: connectionId,
              input: composioInput,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            return `Error executing ${toolName}: Composio API returned ${res.status} — ${errText}`;
          }

          const data = await res.json();
          // Composio responses vary — extract the useful part
          const resultData = data?.data || data?.response_data || data;
          return JSON.stringify(resultData, null, 2).slice(0, 3000); // Truncate large responses
        } catch (err) {
          return `Error executing ${toolName}: ${(err as Error).message}`;
        }
      }
    }
  }

  return `Error: Unknown Composio tool '${toolName}'`;
}

// ── System prompt addition for connected services ────────────

export function getComposioSystemPromptSection(serviceList: string[]): string {
  if (serviceList.length === 0) return "";

  const serviceDescriptions: Record<string, string> = {
    gmail: "Gmail (send emails, search inbox)",
    slack: "Slack (send messages to channels)",
    discord: "Discord (send messages to channels)",
    sheets: "Google Sheets (read/write spreadsheet data)",
    drive: "Google Drive (search files)",
    notion: "Notion (create pages, search docs)",
    trello: "Trello (create cards, list boards)",
    hubspot: "HubSpot (create/manage CRM contacts)",
    calendly: "Calendly (view appointments)",
    stripe: "Stripe (view payments, create payment links)",
    mailchimp: "Mailchimp (manage email marketing audiences)",
    asana: "Asana (create project tasks)",
    zendesk: "Zendesk (create support tickets)",
    intercom: "Intercom (send customer messages)",
  };

  const connected = serviceList
    .map(s => serviceDescriptions[s] || s)
    .join("\n- ");

  return `

CONNECTED INTEGRATIONS (the merchant has connected these — you can use them):
- ${connected}

When the merchant asks you to do something involving a connected service, USE the corresponding tool. For example:
- "Email John the invoice" → use gmail_send_email
- "Post an update in Slack" → use slack_send_message
- "Create a Trello card for this order" → use trello_create_card
- "Check recent Stripe payments" → use stripe_list_recent_payments
- "Add this to our Google Sheet" → use sheets_write_data`;
}

// ── Check if a tool name is a Composio tool ─────────────────

export function isComposioTool(toolName: string): boolean {
  for (const serviceDefs of Object.values(SERVICE_TOOLS)) {
    for (const def of serviceDefs) {
      if (def.toolName === toolName) return true;
    }
  }
  return false;
}
