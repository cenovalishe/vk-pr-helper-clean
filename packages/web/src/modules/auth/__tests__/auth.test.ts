// FILE: packages/web/src/modules/auth/__tests__/auth.test.ts
// VERSION: 4.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-AUTH v4.2.0 VK ID authentication integration (including OneTap widget)
//   SCOPE: 9 Scenarios: A1 (login success), A2 (login failure), A3 (token not in logs), A4 (token not in DOM), A5 (restore on mount), A6 (bypassAuth), A7 (token refresh re-renders useAuth), A8 (redirect callback params), A9 (handleOneTapLogin success)
//   DEPENDS: M-AUTH, M-VKID-CLIENT, M-TOKEN-VAULT, M-SESSION-MANAGER
//   LINKS: M-AUTH, V-M-AUTH
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createWrapper - helper to wrap test hook with SessionProvider and VkAuthProvider
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: v4.2.0 - Add Scenario A9 verifying handleOneTapLogin flow and trace log emission.
//   PREVIOUS_CHANGES:
//     - [v4.1.0 - Added Scenario A8 verifying redirect callback parameter handling on mount.]
//     - [v4.0.0 - Full rewrite of tests covering VK ID auth integration scenarios A1-A7 with hoisted mocks]
// END_CHANGE_SUMMARY

import { renderHook, act } from '@testing-library/react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { VkAuthProvider } from '../VkAuthProvider';
import { useAuth } from '../useAuth';

// Constants
const FAKE_TOKEN = 'fake_vk_access_token_abc123';
const FAKE_REFRESH = 'fake_vk_refresh_token_xyz789';
const FAKE_CODE = 'fake_vk_code_111';
const FAKE_DEVICE_ID = 'fake_device_id_222';
const FAKE_USER_ID = 424242;

// ──────────────────────────────────────────────
// Hoisted Mocks
// ──────────────────────────────────────────────
const {
  mockLoginClient,
  mockExchangeCode,
  mockLogoutClient,
  mockInitClient,
  mockStore,
  mockClear,
  mockGetValidAccessToken,
  mockRefreshIfExpiring,
  mockOnTokenChange,
  mockSetSession,
} = vi.hoisted(() => ({
  mockLoginClient: vi.fn(),
  mockExchangeCode: vi.fn(),
  mockLogoutClient: vi.fn(),
  mockInitClient: vi.fn(),
  mockStore: vi.fn(),
  mockClear: vi.fn(),
  mockGetValidAccessToken: vi.fn(),
  mockRefreshIfExpiring: vi.fn().mockResolvedValue(false),
  mockOnTokenChange: vi.fn().mockImplementation((cb) => {
    return () => {};
  }),
  mockSetSession: vi.fn(),
}));

vi.mock('@/modules/vkid-client', () => ({
  login: mockLoginClient,
  exchangeCode: mockExchangeCode,
  logout: mockLogoutClient,
  init: mockInitClient,
}));

vi.mock('@/modules/token-vault', () => ({
  store: mockStore,
  clear: mockClear,
  getValidAccessToken: mockGetValidAccessToken,
  refreshIfExpiring: mockRefreshIfExpiring,
  onTokenChange: mockOnTokenChange,
}));

vi.mock('@/modules/session-manager', () => ({
  useSession: () => ({
    sessionToken: 'mock_session_jwt',
    setSession: mockSetSession,
  }),
}));


// Console spy
let consoleSpy: {
  info: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
  debug: ReturnType<typeof vi.spyOn>;
};

beforeEach(() => {
  localStorage.clear();
  mockLoginClient.mockReset();
  mockExchangeCode.mockReset();
  mockLogoutClient.mockReset();
  mockInitClient.mockReset();
  mockStore.mockReset();
  mockClear.mockReset();
  mockGetValidAccessToken.mockReset();
  mockRefreshIfExpiring.mockReset();
  mockOnTokenChange.mockReset();
  mockSetSession.mockReset();

  // Set default implementations
  mockRefreshIfExpiring.mockResolvedValue(false);
  mockOnTokenChange.mockImplementation((cb) => {
    return () => {};
  });
  mockInitClient.mockImplementation(() => {});

  consoleSpy = {
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
  };

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sessionToken: 'mock_session_jwt' }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// Helper: retrieve all console log outputs as string array
function getAllLogStrings(): string[] {
  const allCalls = [
    ...consoleSpy.info.mock.calls,
    ...consoleSpy.error.mock.calls,
    ...consoleSpy.debug.mock.calls,
  ];
  return allCalls.flat().map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a)));
}

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(VkAuthProvider, { children });
  };
}

describe('M-AUTH (v4.0.0 VK ID Authentication)', () => {
  // A1: Login success via VK ID
  it('A1: Login success via VK ID updates hook, calls store, and sets session', async () => {
    mockLoginClient.mockResolvedValueOnce({ code: FAKE_CODE, device_id: FAKE_DEVICE_ID });
    mockExchangeCode.mockResolvedValueOnce({
      access_token: FAKE_TOKEN,
      refresh_token: FAKE_REFRESH,
      expires_in: 3600,
      user_id: FAKE_USER_ID,
      device_id: FAKE_DEVICE_ID,
      scope: 'wall',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    // Simulate Token Vault notification upon store
    mockStore.mockImplementationOnce((tokenSet) => {
      localStorage.setItem('vkpr_access_token', tokenSet.access_token);
      localStorage.setItem('vkpr_user_id', String(tokenSet.user_id));
      mockOnTokenChange.mock.calls.forEach(([cb]) => cb(tokenSet.access_token));
    });

    await act(async () => {
      await result.current.login();
    });

    expect(mockLoginClient).toHaveBeenCalled();
    expect(mockExchangeCode).toHaveBeenCalledWith(FAKE_CODE, FAKE_DEVICE_ID, expect.any(String));
    expect(mockStore).toHaveBeenCalledWith(expect.objectContaining({ access_token: FAKE_TOKEN }));
    expect(mockSetSession).toHaveBeenCalledWith('mock_session_jwt');

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.accessToken).toBe(FAKE_TOKEN);
    expect(result.current.userId).toBe(FAKE_USER_ID);

    // Emitted log marker assertion
    const logs = getAllLogStrings();
    expect(logs.some((l) => l.includes('[Auth][useAuth][BLOCK_VK_AUTH_FLOW]'))).toBe(true);
  });

  // A2: Login failure
  it('A2: Login failure does not call store', async () => {
    mockLoginClient.mockRejectedValueOnce(new Error('User cancelled login'));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await expect(
      act(async () => {
        await result.current.login();
      })
    ).rejects.toThrow('User cancelled login');

    expect(mockStore).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
  });

  // A3: Token never in logs
  it('A3: Token never in logs (security redaction check)', async () => {
    mockLoginClient.mockResolvedValueOnce({ code: FAKE_CODE, device_id: FAKE_DEVICE_ID });
    mockExchangeCode.mockResolvedValueOnce({
      access_token: FAKE_TOKEN,
      refresh_token: FAKE_REFRESH,
      expires_in: 3600,
      user_id: FAKE_USER_ID,
      device_id: FAKE_DEVICE_ID,
      scope: 'wall',
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.login();
    });

    const logs = getAllLogStrings();
    for (const logLine of logs) {
      expect(logLine).not.toContain(FAKE_TOKEN);
      expect(logLine).not.toContain(FAKE_REFRESH);
    }
  });

  // A4: Token never in DOM
  it('A4: Token never in DOM', async () => {
    localStorage.setItem('vkpr_access_token', FAKE_TOKEN);
    localStorage.setItem('vkpr_user_id', String(FAKE_USER_ID));

    function Consumer() {
      const { isAuthenticated, userId } = useAuth();
      return React.createElement(
        'div',
        null,
        `authenticated: ${isAuthenticated}, userId: ${userId}`
      );
    }

    render(React.createElement(VkAuthProvider, { children: React.createElement(Consumer) }));

    expect(document.body.innerHTML).not.toContain(FAKE_TOKEN);
  });

  // A5: Restore session on mount (no URL fragment parsing)
  it('A5: VkAuthProvider restores from M-TOKEN-VAULT on mount', () => {
    localStorage.setItem('vkpr_access_token', FAKE_TOKEN);
    localStorage.setItem('vkpr_user_id', String(FAKE_USER_ID));

    // Ensure URL hash does not trigger OAuth Implicit Flow parsing (abolished)
    window.location.hash = `#access_token=implicit_flow_token&user_id=9999`;

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.accessToken).toBe(FAKE_TOKEN);
    expect(result.current.userId).toBe(FAKE_USER_ID);

    window.location.hash = '';
  });

  // A6: bypassAuth removed from production code (security: no auth bypass in prod build)
  it('A6: bypassAuth is no longer exposed (security hardening)', () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    expect((result.current as any).bypassAuth).toBeUndefined();
  });

  // A7: Token refresh re-renders useAuth
  it('A7: Token refresh updates useAuth context and propagates new token', async () => {
    localStorage.setItem('vkpr_access_token', FAKE_TOKEN);
    localStorage.setItem('vkpr_user_id', String(FAKE_USER_ID));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    expect(result.current.accessToken).toBe(FAKE_TOKEN);

    // Simulate reactive refresh change from Token Vault
    const NEW_TOKEN = 'refreshed_vk_token_abc';
    act(() => {
      mockOnTokenChange.mock.calls.forEach(([cb]) => cb(NEW_TOKEN));
    });

    expect(result.current.accessToken).toBe(NEW_TOKEN);
  });

  // A8: Handle redirect callback params on mount
  it('A8: VkAuthProvider handles VK ID redirect callback query parameters on mount', async () => {
    // Set up search parameters in jsdom URL
    window.history.replaceState({}, '', `/?code=${FAKE_CODE}&device_id=${FAKE_DEVICE_ID}&state=test_state_123`);

    const historySpy = vi.spyOn(window.history, 'replaceState');

    mockExchangeCode.mockResolvedValueOnce({
      access_token: FAKE_TOKEN,
      refresh_token: FAKE_REFRESH,
      expires_in: 3600,
      user_id: FAKE_USER_ID,
      device_id: FAKE_DEVICE_ID,
      scope: 'wall photos',
    });

    mockStore.mockImplementationOnce((tokenSet) => {
      localStorage.setItem('vkpr_access_token', tokenSet.access_token);
      localStorage.setItem('vkpr_user_id', String(tokenSet.user_id));
      mockOnTokenChange.mock.calls.forEach(([cb]) => cb(tokenSet.access_token));
    });

    renderHook(() => useAuth(), { wrapper: createWrapper() });

    // Wait for the async process to run and complete up to setSession
    await vi.waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith('mock_session_jwt');
    });

    expect(mockExchangeCode).toHaveBeenCalledWith(FAKE_CODE, FAKE_DEVICE_ID, expect.any(String));
    expect(mockStore).toHaveBeenCalled();
    expect(localStorage.getItem('vkid_state_received')).toBe('test_state_123');

    // Verify history cleanup (clears code/state params)
    expect(historySpy).toHaveBeenCalledWith({}, document.title, window.location.origin + window.location.pathname);

    // Clean up
    historySpy.mockRestore();
    window.history.replaceState({}, '', '/');
  });

  // A9: handleOneTapLogin success
  it('A9: handleOneTapLogin saves tokens to vault, calls loginAction, sets session, and emits BLOCK_VK_ONETAP_SUCCESS', async () => {
    const mockTokenSet = {
      access_token: FAKE_TOKEN,
      refresh_token: FAKE_REFRESH,
      expires_in: 3600,
      user_id: FAKE_USER_ID,
      device_id: FAKE_DEVICE_ID,
      scope: 'wall photos',
      token_type: 'Bearer',
    };

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    mockStore.mockImplementationOnce((tokenSet) => {
      localStorage.setItem('vkpr_access_token', tokenSet.access_token);
      localStorage.setItem('vkpr_user_id', String(tokenSet.user_id));
      mockOnTokenChange.mock.calls.forEach(([cb]) => cb(tokenSet.access_token));
    });

    await act(async () => {
      await result.current.handleOneTapLogin(mockTokenSet);
    });

    expect(mockStore).toHaveBeenCalledWith(mockTokenSet);
    expect(mockSetSession).toHaveBeenCalledWith('mock_session_jwt');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.accessToken).toBe(FAKE_TOKEN);
    expect(result.current.userId).toBe(FAKE_USER_ID);

    // Verify trace log marker was output
    const logs = getAllLogStrings();
    expect(logs.some((l) => l.includes('[Auth][VkAuthProvider][BLOCK_VK_ONETAP_SUCCESS]'))).toBe(true);
  });
});