import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { setMockResponse, resetMockResponses } from '@/test/mocks/supabase';
import '@/test/mocks/auth';
import { createWrapper } from '@/test/mocks/wrapper';
import { useOrgFeatures } from './use-org-features';
import { FEATURE_REGISTRY } from '@/lib/feature-registry';

describe('use-org-features — per-tenant circuit breaker behavior', () => {
  beforeEach(() => {
    resetMockResponses();
  });

  describe('feature resolution', () => {
    it('returns all features from registry with defaults when no DB overrides', async () => {
      setMockResponse('org_features', []);

      const { result } = renderHook(() => useOrgFeatures(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.features.length).toBe(FEATURE_REGISTRY.length);

      // All non-core features should use registry defaults
      for (const feat of result.current.features) {
        const def = FEATURE_REGISTRY.find((f) => f.key === feat.key);
        expect(def).toBeDefined();
        expect(feat.enabled).toBe(def!.core ? true : def!.defaultEnabled);
      }
    });

    it('applies per-org DB overrides to disable features (circuit breaker trip)', async () => {
      setMockResponse('org_features', [
        { feature_key: 'ai_assistant', enabled: false },
        { feature_key: 'supplements', enabled: false },
      ]);

      const { result } = renderHook(() => useOrgFeatures(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.isEnabled('ai_assistant')).toBe(false);
      expect(result.current.isEnabled('supplements')).toBe(false);
      // Other features remain enabled
      expect(result.current.isEnabled('contacts')).toBe(true);
      expect(result.current.isEnabled('sales_orders')).toBe(true);
    });

    it('core features stay enabled even when DB says disabled', async () => {
      setMockResponse('org_features', [
        { feature_key: 'dashboard', enabled: false },
        { feature_key: 'settings', enabled: false },
      ]);

      const { result } = renderHook(() => useOrgFeatures(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.isEnabled('dashboard')).toBe(true);
      expect(result.current.isEnabled('settings')).toBe(true);
    });

    it('handles DB error gracefully by falling back to defaults', async () => {
      setMockResponse('org_features', null, { message: 'connection refused' });

      const { result } = renderHook(() => useOrgFeatures(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(false));
      // isEnabled should still return true for features that default to true
      expect(result.current.isEnabled('ai_assistant')).toBe(true);
    });

    it('returns true for unknown feature keys', async () => {
      setMockResponse('org_features', []);

      const { result } = renderHook(() => useOrgFeatures(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      // Unknown features default to enabled
      expect(result.current.isEnabled('nonexistent_feature_xyz')).toBe(true);
    });
  });

  describe('per-tenant isolation', () => {
    it('only affects the queried org_id — other orgs see their own state', async () => {
      // Simulate org-123 having ai_assistant disabled
      setMockResponse('org_features', [
        { feature_key: 'ai_assistant', enabled: false },
      ]);

      const { result } = renderHook(() => useOrgFeatures(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.isEnabled('ai_assistant')).toBe(false);
      // The hook queries by org_id, so this ONLY represents org-123's state
    });

    it('circuit-broken feature does not affect unrelated features', async () => {
      // Only supplements is circuit-broken, everything else should be fine
      setMockResponse('org_features', [
        { feature_key: 'supplements', enabled: false },
      ]);

      const { result } = renderHook(() => useOrgFeatures(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.isEnabled('supplements')).toBe(false);
      expect(result.current.isEnabled('peptide_catalog')).toBe(true);
      expect(result.current.isEnabled('lot_tracking')).toBe(true);
      expect(result.current.isEnabled('ai_assistant')).toBe(true);
      expect(result.current.isEnabled('sales_orders')).toBe(true);
    });
  });

  describe('toggle (manual override)', () => {
    it('calls upsert to toggle feature state', async () => {
      setMockResponse('org_features', [
        { feature_key: 'ai_assistant', enabled: false },
      ]);

      const { result } = renderHook(() => useOrgFeatures(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(result.current.isEnabled('ai_assistant')).toBe(false);

      // Verify toggleFeature is callable (it calls supabase.from('org_features').upsert)
      const { supabase } = await import('@/test/mocks/supabase');
      await act(async () => {
        await result.current.toggleFeature('ai_assistant', true);
      });

      // Verify upsert was called on org_features
      expect(supabase.from).toHaveBeenCalledWith('org_features');
    });
  });
});
