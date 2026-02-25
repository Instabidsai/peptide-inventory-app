export type FeatureCategory =
  | 'core'
  | 'inventory'
  | 'sales'
  | 'partners'
  | 'ai'
  | 'clients'
  | 'finance'
  | 'customization';

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  category: FeatureCategory;
  defaultEnabled: boolean;
  /** Roles that can see this feature when it's enabled */
  roles: string[];
  /** Sidebar navigation item names controlled by this feature */
  sidebarItems: string[];
  /** Core features cannot be disabled */
  core?: boolean;
}

export const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  core: 'Core',
  ai: 'AI & Automation',
  inventory: 'Inventory',
  sales: 'Sales & Orders',
  partners: 'Partner Network',
  clients: 'Client Experience',
  finance: 'Finance',
  customization: 'Customization',
};

export const CATEGORY_ORDER: FeatureCategory[] = [
  'core',
  'ai',
  'inventory',
  'sales',
  'partners',
  'clients',
  'finance',
  'customization',
];

export const FEATURE_REGISTRY: FeatureDef[] = [
  // ── Core (always on) ──
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Main dashboard with overview metrics and quick actions.',
    category: 'core',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep', 'fulfillment'],
    sidebarItems: ['Dashboard'],
    core: true,
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Account settings, branding, integrations, and team management.',
    category: 'core',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep', 'fulfillment'],
    sidebarItems: ['Settings'],
    core: true,
  },

  // ── AI & Automation ──
  {
    key: 'ai_assistant',
    label: 'AI Assistant',
    description: 'Full-page AI chat and floating bubble for creating orders, managing contacts, and pulling reports.',
    category: 'ai',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep'],
    sidebarItems: ['AI Assistant'],
  },
  {
    key: 'automations',
    label: 'Automations',
    description: 'Automated workflows for low-stock alerts, reorder triggers, and scheduled tasks.',
    category: 'ai',
    defaultEnabled: true,
    roles: ['admin'],
    sidebarItems: ['Automations'],
  },

  // ── Inventory ──
  {
    key: 'peptide_catalog',
    label: 'Peptide Catalog',
    description: 'Manage your peptide product catalog with pricing, descriptions, and categories.',
    category: 'inventory',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep'],
    sidebarItems: ['Peptides'],
  },
  {
    key: 'lot_tracking',
    label: 'Lot Tracking',
    description: 'Track inventory lots with batch numbers, expiration dates, and supplier info.',
    category: 'inventory',
    defaultEnabled: true,
    roles: ['admin', 'staff'],
    sidebarItems: ['Lots'],
  },
  {
    key: 'bottle_tracking',
    label: 'Bottle Tracking',
    description: 'Individual bottle-level tracking with serial numbers and assignment history.',
    category: 'inventory',
    defaultEnabled: true,
    roles: ['admin', 'staff'],
    sidebarItems: ['Bottles'],
  },
  {
    key: 'supplements',
    label: 'Supplements',
    description: 'Manage supplement products alongside peptides.',
    category: 'inventory',
    defaultEnabled: true,
    roles: ['admin', 'staff'],
    sidebarItems: ['Supplements'],
  },
  {
    key: 'movements',
    label: 'Inventory Movements',
    description: 'Track stock movements between locations, adjustments, and transfers.',
    category: 'inventory',
    defaultEnabled: true,
    roles: ['admin', 'staff'],
    sidebarItems: ['Movements'],
  },
  {
    key: 'wholesale_catalog',
    label: 'Wholesale Catalog',
    description: 'Browse and order from your supplier\'s wholesale product catalog with volume-based pricing tiers.',
    category: 'inventory',
    defaultEnabled: true,
    roles: ['admin', 'staff'],
    sidebarItems: [],
  },

  // ── Sales & Orders ──
  {
    key: 'purchase_orders',
    label: 'Purchase Orders',
    description: 'Internal purchase orders for restocking inventory from suppliers.',
    category: 'sales',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep'],
    sidebarItems: ['Orders'],
  },
  {
    key: 'sales_orders',
    label: 'Sales Orders',
    description: 'Customer-facing sales orders with invoicing, payments, and fulfillment.',
    category: 'sales',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep', 'fulfillment'],
    sidebarItems: ['Sales Orders'],
  },
  {
    key: 'fulfillment',
    label: 'Fulfillment Center',
    description: 'Pick, pack, and ship orders with label printing and tracking.',
    category: 'sales',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'fulfillment'],
    sidebarItems: ['Fulfillment'],
  },

  // ── Partner Network ──
  {
    key: 'partner_network',
    label: 'Partner Network',
    description: 'Sales rep management, commission tracking, partner portal, and downline hierarchy.',
    category: 'partners',
    defaultEnabled: true,
    roles: ['admin', 'sales_rep'],
    sidebarItems: ['Partners', 'Commissions', 'Partner Portal', 'Partner Store', 'My Orders'],
  },

  // ── Client Experience ──
  {
    key: 'contacts',
    label: 'Customer Management',
    description: 'CRM customers with profiles, communication history, and household linking.',
    category: 'clients',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep'],
    sidebarItems: ['Customers'],
  },
  {
    key: 'protocols',
    label: 'Protocols',
    description: 'Create and assign peptide protocols with dosing schedules and instructions.',
    category: 'clients',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep'],
    sidebarItems: ['Protocols', 'Protocol Builder'],
  },
  {
    key: 'resources',
    label: 'Resources Library',
    description: 'Educational resources, research papers, and reference materials for your team and clients.',
    category: 'clients',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep'],
    sidebarItems: ['Resources'],
  },
  {
    key: 'client_requests',
    label: 'Client Requests',
    description: 'Manage incoming client requests, refill orders, and support tickets.',
    category: 'clients',
    defaultEnabled: true,
    roles: ['admin', 'staff'],
    sidebarItems: ['Requests'],
  },
  {
    key: 'feedback',
    label: 'Feedback',
    description: 'Collect and review feedback from clients and team members.',
    category: 'clients',
    defaultEnabled: true,
    roles: ['admin', 'staff', 'sales_rep'],
    sidebarItems: ['Feedback'],
  },
  {
    key: 'client_portal',
    label: 'Client Portal',
    description: 'Self-service portal for clients to view regimens, track health, order products, and message their provider.',
    category: 'clients',
    defaultEnabled: true,
    roles: ['client', 'customer'],
    sidebarItems: [],
  },

  // ── Finance ──
  {
    key: 'financials',
    label: 'Financial Dashboard',
    description: 'Revenue, expenses, profit margins, and financial reporting.',
    category: 'finance',
    defaultEnabled: true,
    roles: ['admin'],
    sidebarItems: ['Financials'],
  },

  // ── Customization ──
  {
    key: 'customizations',
    label: 'Customization Engine',
    description: 'Custom fields, entities, dashboards, reports, and AI-powered builder.',
    category: 'customization',
    defaultEnabled: true,
    roles: ['admin'],
    sidebarItems: ['Customizations'],
  },
];

/** Map from sidebar item name → feature key for quick lookup */
export const SIDEBAR_FEATURE_MAP: Record<string, string> = {};
for (const feature of FEATURE_REGISTRY) {
  for (const item of feature.sidebarItems) {
    SIDEBAR_FEATURE_MAP[item] = feature.key;
  }
}
