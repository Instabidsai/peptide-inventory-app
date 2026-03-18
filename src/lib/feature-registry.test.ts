import { describe, it, expect } from 'vitest';
import { FEATURE_REGISTRY, SIDEBAR_FEATURE_MAP, CATEGORY_ORDER, CATEGORY_LABELS } from './feature-registry';

/**
 * The FEATURE_CIRCUIT_MAP in sentinel-worker maps features to error categories.
 * This test verifies the registry is complete and consistent so circuit breakers
 * can find the right feature to disable.
 */

// Mirror of the sentinel-worker FEATURE_CIRCUIT_MAP — kept in sync
const FEATURE_CIRCUIT_MAP: Record<string, string[]> = {
  ai_assistant: ['edge_function', 'ai_error'],
  automations: ['edge_function', 'ai_error'],
  client_health_ai: ['edge_function', 'ai_error'],
  peptide_catalog: ['database'],
  lot_tracking: ['database'],
  bottle_tracking: ['database'],
  supplements: ['database'],
  movements: ['database'],
  wholesale_catalog: ['database'],
  purchase_orders: ['database', 'validation'],
  sales_orders: ['database', 'validation'],
  fulfillment: ['database', 'edge_function'],
  partner_network: ['database'],
  health_tracking: ['database'],
  dose_tracking: ['database'],
  contacts: ['database'],
  protocols: ['database'],
  resources: ['database'],
  client_requests: ['database'],
  feedback: ['database'],
  client_portal: ['validation', 'edge_function'],
  financials: ['database'],
  payment_pool: ['database', 'edge_function'],
  crypto_payments: ['validation'],
  saas_mode: ['validation'],
  ruo_disclaimer: ['validation'],
  view_as_user: ['validation'],
  customizations: ['database', 'edge_function'],
  external_referral_links: ['database', 'edge_function'],
};

describe('feature-registry', () => {
  it('has unique feature keys', () => {
    const keys = FEATURE_REGISTRY.map((f) => f.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('every feature has a valid category', () => {
    for (const f of FEATURE_REGISTRY) {
      expect(CATEGORY_ORDER).toContain(f.category);
      expect(CATEGORY_LABELS[f.category]).toBeDefined();
    }
  });

  it('core features have core=true', () => {
    const coreFeatures = FEATURE_REGISTRY.filter((f) => f.core);
    expect(coreFeatures.length).toBeGreaterThanOrEqual(2);
    for (const f of coreFeatures) {
      expect(f.defaultEnabled).toBe(true);
    }
  });

  it('sidebar feature map covers all sidebar items', () => {
    const allSidebarItems = FEATURE_REGISTRY.flatMap((f) => f.sidebarItems);
    for (const item of allSidebarItems) {
      expect(SIDEBAR_FEATURE_MAP[item]).toBeDefined();
    }
  });

  it('every non-core feature is in FEATURE_CIRCUIT_MAP', () => {
    const nonCore = FEATURE_REGISTRY.filter((f) => !f.core);
    const mappedKeys = new Set(Object.keys(FEATURE_CIRCUIT_MAP));

    const unmapped: string[] = [];
    for (const f of nonCore) {
      if (!mappedKeys.has(f.key)) {
        unmapped.push(f.key);
      }
    }

    expect(unmapped).toEqual([]);
  });

  it('FEATURE_CIRCUIT_MAP only references valid feature keys', () => {
    const registryKeys = new Set(FEATURE_REGISTRY.map((f) => f.key));
    const invalidKeys: string[] = [];

    for (const key of Object.keys(FEATURE_CIRCUIT_MAP)) {
      if (!registryKeys.has(key)) {
        invalidKeys.push(key);
      }
    }

    expect(invalidKeys).toEqual([]);
  });

  it('every circuit map entry has at least one error category', () => {
    for (const [key, categories] of Object.entries(FEATURE_CIRCUIT_MAP)) {
      expect(categories.length).toBeGreaterThan(0);
    }
  });

  it('seed_default_features keys match registry', () => {
    // These are the keys the seed_default_features RPC inserts.
    // They MUST match the registry keys exactly.
    const seedKeys = [
      'dashboard', 'settings',
      'ai_assistant', 'client_health_ai', 'automations',
      'peptide_catalog', 'lot_tracking', 'bottle_tracking',
      'supplements', 'movements', 'wholesale_catalog',
      'purchase_orders', 'sales_orders', 'fulfillment',
      'partner_network',
      'health_tracking', 'dose_tracking',
      'contacts', 'protocols', 'resources',
      'client_requests', 'feedback', 'client_portal',
      'financials', 'payment_pool', 'crypto_payments',
      'saas_mode', 'ruo_disclaimer', 'view_as_user',
      'customizations',
      'external_referral_links',
    ];

    const registryKeys = new Set(FEATURE_REGISTRY.map((f) => f.key));

    const missingFromRegistry: string[] = [];
    for (const key of seedKeys) {
      if (!registryKeys.has(key)) {
        missingFromRegistry.push(key);
      }
    }
    expect(missingFromRegistry).toEqual([]);

    // Every registry key should be in the seed
    const seedSet = new Set(seedKeys);
    const missingFromSeed: string[] = [];
    for (const key of registryKeys) {
      if (!seedSet.has(key)) {
        missingFromSeed.push(key);
      }
    }
    expect(missingFromSeed).toEqual([]);
  });
});
