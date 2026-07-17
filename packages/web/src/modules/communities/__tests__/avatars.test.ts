// FILE: packages/web/src/modules/communities/__tests__/avatars.test.ts
// VERSION: 3.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-COMMUNITIES-AVATARS (useCommunityAvatars and fetchCommunityAvatars)
//   SCOPE: Testing caching, fallback case, and log safety (scenarios AV-1, AV-2, AV-3, AV-5, AV-6, AV-7)
//   DEPENDS: M-COMMUNITIES-AVATARS
//   LINKS: M-COMMUNITIES-AVATARS, V-M-COMMUNITIES-AVATARS
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   no exported symbols
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.0.0 - Phase-YC-6: Update tests to verify REST apiMutation /communities/avatars endpoints]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCommunityAvatars, fetchCommunityAvatars } from '../avatars';
import { apiMutation } from '@/modules/api-client';

// Mock auth hook
vi.mock('../../auth', () => ({
  useAuth: () => ({
    accessToken: 'mock-access-token',
    sessionToken: 'mock-session-token',
    isAuthenticated: true,
  }),
}));

vi.mock('@/modules/api-client', () => ({
  apiMutation: vi.fn(),
}));

describe('M-COMMUNITIES-AVATARS', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    infoSpy.mockRestore();
  });

  // AV1 legacy: Returns initials fallback (empty strings)
  it('AV-1: fetchCommunityAvatars returns initials fallback and logs groups-scope-removed', async () => {
    const result = await fetchCommunityAvatars([123, 456], 'mock-access-token');

    expect(result).toEqual({
      123: '',
      456: '',
    });

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('[Communities][CommunityAvatars][BLOCK_AVATAR_FALLBACK]'),
      expect.objectContaining({
        vkId: 123,
        reason: 'groups-scope-removed',
      }),
    );
  });

  // AV6: accessToken NEVER in logs
  it('AV-6: fetchCommunityAvatars logs NEVER include access_token substring or token values', async () => {
    await fetchCommunityAvatars([123], 'mock-access-token');

    const calls = warnSpy.mock.calls.flat();
    calls.forEach((args) => {
      const logString = typeof args === 'string' ? args : JSON.stringify(args);
      expect(logString).not.toContain('mock-access-token');
      expect(logString.toLowerCase()).not.toContain('access_token');
    });
  });

  // AV1: useCommunityAvatars calls REST /communities/avatars endpoint once with all screenNames
  it('AV-1: useCommunityAvatars calls REST /communities/avatars endpoint once with all screenNames', async () => {
    vi.mocked(apiMutation).mockResolvedValue({
      '123': 'http://example.com/avatar1.jpg',
      '456': 'http://example.com/avatar2.jpg',
    });

    const { result } = renderHook(() => useCommunityAvatars([123, 456]));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(vi.mocked(apiMutation)).toHaveBeenCalledWith(
      '/communities/avatars',
      'POST',
      { screenNames: ['123', '456'] },
      'mock-session-token'
    );
    expect(result.current.avatars.get(123)).toBe('http://example.com/avatar1.jpg');
    expect(result.current.avatars.get(456)).toBe('http://example.com/avatar2.jpg');
  });

  // AV3: Fetch failure
  it('AV-3: Fetch failure: returns empty Map, emits BLOCK_AVATAR_FALLBACK with reason=fetch-failed', async () => {
    vi.mocked(apiMutation).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCommunityAvatars([999]));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.avatars.get(999)).toBe('');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Communities][CommunityAvatars][BLOCK_AVATAR_FALLBACK]'),
      expect.objectContaining({
        vkId: 999,
        reason: 'fetch-failed',
      }),
    );
  });

  // AV5: No avatar field
  it('AV-5: No avatar field: emits BLOCK_AVATAR_FALLBACK reason=no-avatar-field', async () => {
    vi.mocked(apiMutation).mockResolvedValue({
      '888': '', // no avatar returned
    });

    const { result } = renderHook(() => useCommunityAvatars([888]));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.avatars.get(888)).toBe('');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Communities][CommunityAvatars][BLOCK_AVATAR_FALLBACK]'),
      expect.objectContaining({
        vkId: 888,
        reason: 'no-avatar-field',
      }),
    );
  });

  // AV7: Partial failure
  it('AV-7: Partial failure: 1 has no avatar -> others populate, that one shows initials fallback', async () => {
    vi.mocked(apiMutation).mockResolvedValue({
      '111': 'http://example.com/avatar111.jpg',
      '222': '', // missing
    });

    const { result } = renderHook(() => useCommunityAvatars([111, 222]));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.avatars.get(111)).toBe('http://example.com/avatar111.jpg');
    expect(result.current.avatars.get(222)).toBe('');
  });

  // Hook test (caching and initials verification)
  it('useCommunityAvatars hook returns fetched URLs and handles cache', async () => {
    vi.mocked(apiMutation).mockResolvedValue({
      '789': 'http://example.com/avatar-789.jpg',
    });

    const { result } = renderHook(() => useCommunityAvatars([789]));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.avatars.get(789)).toBe('http://example.com/avatar-789.jpg');

    // Call hook again with same ID to verify session cache
    const { result: cachedResult } = renderHook(() => useCommunityAvatars([789]));

    expect(cachedResult.current.isLoading).toBe(false);
    expect(cachedResult.current.avatars.get(789)).toBe('http://example.com/avatar-789.jpg');
    expect(vi.mocked(apiMutation)).toHaveBeenCalledTimes(1);
  });
});
