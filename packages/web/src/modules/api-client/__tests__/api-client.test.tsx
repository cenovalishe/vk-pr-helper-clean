// FILE: packages/web/src/modules/api-client/__tests__/api-client.test.tsx
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Tests for the rewritten REST-based ApiClient
//   SCOPE: useApiQuery, apiMutation, apiHttp
//   DEPENDS: M-FE-API-CLIENT
//   LINKS: M-FE-API-CLIENT, V-M-FE-API-CLIENT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   scenario-1 - useApiQuery fetches REST endpoint and returns reactive state
//   scenario-2 - useApiQuery refetches data when refetch is called
//   scenario-3 - apiMutation performs REST request with body and token
//   scenario-4 - apiHttp injects Authorization header and calls fetch
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.0.0 - Rewrote test suite to verify new fetch-based useApiQuery, apiMutation, and apiHttp instead of old Convex mocks.]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiQuery, apiMutation, apiHttp } from '../index';
import * as useAuthModule from '../../auth/useAuth';

describe('ApiClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubEnv('VITE_API_URL', '/api');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('apiHttp', () => {
    it('sends Authorization header and builds full URL', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as any);

      await apiHttp('/test-endpoint', 'my-jwt-token', { method: 'POST' });
      expect(global.fetch).toHaveBeenCalledWith('/api/test-endpoint', expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      }));

      const calls = vi.mocked(global.fetch).mock.calls;
      const headers = calls[0][1]?.headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer my-jwt-token');
    });
  });

  describe('apiMutation', () => {
    it('performs POST request with body and token', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as any);

      const res = await apiMutation('/mutate', 'POST', { foo: 'bar' }, 'my-jwt');
      expect(res).toEqual({ success: true });
      expect(global.fetch).toHaveBeenCalledWith('/api/mutate', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' }),
      }));
    });

    it('throws error with backend error code when response is not ok', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'VALIDATION_ERROR', message: 'Invalid input' }),
      } as any);

      await expect(apiMutation('/mutate', 'POST', {}, 'my-jwt')).rejects.toThrow('Invalid input');
    });
  });

  describe('useApiQuery', () => {
    it('fetches REST endpoint on mount when authenticated', async () => {
      vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({ sessionToken: 'my-jwt-token' } as any);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ value: 'hello' }),
      } as any);

      const { result } = renderHook(() => useApiQuery('/get-val'));
      
      // Wait for the hook's useEffect to trigger and resolve
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(result.current.data).toEqual({ value: 'hello' });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith('/api/get-val', expect.any(Object));
    });

    it('handles manual refetch and optimistic update', async () => {
      vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({ sessionToken: 'my-jwt-token' } as any);
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ value: 'first' }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ value: 'second' }),
        } as any);

      const { result } = renderHook(() => useApiQuery('/get-val'));
      
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      expect(result.current.data).toEqual({ value: 'first' });

      // Trigger refetch with optimistic update
      let refetchPromise: Promise<any> | undefined;
      act(() => {
        refetchPromise = result.current.refetch({ value: 'optimistic' });
      });

      // Optimistic state should be immediate
      expect(result.current.data).toEqual({ value: 'optimistic' });
      expect(result.current.loading).toBe(true);

      await act(async () => {
        await refetchPromise;
      });

      // Final state after resolution
      expect(result.current.data).toEqual({ value: 'second' });
      expect(result.current.loading).toBe(false);
    });
  });
});
