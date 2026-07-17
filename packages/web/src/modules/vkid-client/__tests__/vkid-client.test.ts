// @vitest-environment jsdom
// FILE: packages/web/src/modules/vkid-client/__tests__/vkid-client.test.ts
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-VKID-CLIENT (VK ID SDK wrapper: Authorization Code Flow + PKCE + OneTap widget)
//   SCOPE: PKCE generation, login, renderOneTap, exchangeCode, refresh, logout, state validation (CSRF), token redaction
//   DEPENDS: M-VKID-CLIENT, @vkid/sdk (mocked)
//   LINKS: M-VKID-CLIENT, VerificationPlan.V-M-VKID-CLIENT, VerificationPlan.scenario-VKID1..VKID10
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FAKE_TOKEN         - stub VK ID access_token for redaction checks
//   FAKE_REFRESH       - stub VK ID refresh_token for redaction checks
//   FAKE_CODE          - stub authorization code
//   FAKE_DEVICE_ID     - stub device_id
//   mockVKIDSDK         - vi.mock factory for @vkid/sdk
//   consoleSpy         - TraceHarness console spy (info/warn/error/debug/log)
//   allCalls            - aggregated console call args for trace assertions
//   mockOneTapRender   - mock function for rendering OneTap
//   mockOneTapOn       - mock function for widget events subscription
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - Update tests to call init() before VK ID SDK operations to satisfy ensureInitialized check
//   PREVIOUS_CHANGES:
//     - [v1.2.1 - Fix CSRF state tests to use dynamic state from init() instead of hardcoded backdoor value
//     - [v1.2.0 - Add tests for renderOneTap (VKID9 and VKID10 scenarios)]
//     - [v1.1.0 - Expose top-level ConfigAuthMode and ConfigResponseMode in @vkid/sdk mock]
//     - [v1.0.0 - Initial scaffold for Phase-VKID-MIGRATION. Implements TraceHarness pattern with vi.mock('@vkid/sdk')]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────
// Constants (FAKE_TOKEN pattern per TraceHarness redaction-in-tests)
// ──────────────────────────────────────────────
const FAKE_TOKEN = 'fake_vkid_access_token_abc123def456';
const FAKE_REFRESH = 'fake_vkid_refresh_token_xyz789ghi012';
const FAKE_ID_TOKEN = 'fake_vkid_id_token_jwt_payload';
const FAKE_CODE = 'fake_authorization_code_abc123';
const FAKE_DEVICE_ID = 'fake_device_id_12345';
const FAKE_USER_ID = 42424242;
const TEST_APP_ID = 1234567;
const TEST_REDIRECT_URL = 'http://localhost/auth';
const TEST_SCOPE = 'wall photos groups';

// ──────────────────────────────────────────────
// TraceHarness: console spy setup
// ──────────────────────────────────────────────
let consoleSpy: {
  info: ReturnType<typeof vi.spyOn>;
  warn: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
  debug: ReturnType<typeof vi.spyOn>;
  log: ReturnType<typeof vi.spyOn>;
};

let fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  consoleSpy = {
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  };
  mockOneTapRender.mockReturnThis();
  mockOneTapOn.mockReturnThis();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: aggregate all console call args into string array for trace assertions
function getAllStrings(): string[] {
  const allCalls = [
    ...consoleSpy.info.mock.calls,
    ...consoleSpy.warn.mock.calls,
    ...consoleSpy.error.mock.calls,
    ...consoleSpy.debug.mock.calls,
    ...consoleSpy.log.mock.calls,
  ];
  return allCalls.flat().map((a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a)));
}

// Helper: assert a marker appears in collected strings
function expectMarkerPresent(marker: string): void {
  const allStrings = getAllStrings();
  expect(
    allStrings.some((s) => s.includes(marker)),
    `Expected marker "${marker}" to appear in trace`,
  ).toBe(true);
}

// Helper: assert a marker does NOT appear (forbidden pattern check)
function expectMarkerAbsent(marker: string): void {
  const allStrings = getAllStrings();
  expect(
    allStrings.some((s) => s.includes(marker)),
    `Forbidden marker "${marker}" appeared in trace (FP violation)`,
  ).toBe(false);
}

// Helper: assert a token value does NOT appear in logs (FP-VKID-1)
function expectNoTokenLeak(): void {
  const allStrings = getAllStrings();
  expect(
    allStrings.some((s) => s.includes(FAKE_TOKEN)),
    `FAKE_TOKEN leaked into logs (FP-VKID-1)`,
  ).toBe(false);
  expect(
    allStrings.some((s) => s.includes(FAKE_REFRESH)),
    `FAKE_REFRESH leaked into logs (FP-VKID-1)`,
  ).toBe(false);
}

// Helper: get index of a marker in trace (for ordering assertions)
function markerIndex(marker: string): number {
  const allStrings = getAllStrings();
  return allStrings.findIndex((s) => s.includes(marker));
}

// ──────────────────────────────────────────────
// Mock @vkid/sdk
// The SDK is browser-only; in Node test env we mock it entirely.
// ──────────────────────────────────────────────
const mockConfigInit = vi.fn();
const mockAuthLogin = vi.fn();
const mockAuthExchangeCode = vi.fn();
const mockAuthRefreshToken = vi.fn();
const mockAuthLogout = vi.fn();
const mockOneTapRender = vi.fn().mockReturnThis();
const mockOneTapOn = vi.fn().mockReturnThis();

class MockOneTap {
  render = mockOneTapRender;
  on = mockOneTapOn;
}

vi.mock('@vkid/sdk', () => ({
  Config: {
    init: mockConfigInit,
  },
  ConfigAuthMode: { InNewTab: 'new_tab', Redirect: 'redirect' },
  ConfigResponseMode: { Callback: 'callback', Redirect: 'redirect' },
  Auth: {
    login: mockAuthLogin,
    exchangeCode: mockAuthExchangeCode,
    refreshToken: mockAuthRefreshToken,
    logout: mockAuthLogout,
  },
  OneTap: MockOneTap,
  OneTapInternalEvents: {
    LOGIN_SUCCESS: 'onetap: success login',
    SHOW_FULL_AUTH: 'onetap: show full auth',
    START_AUTHORIZE: 'onetap: start authorize',
    NOT_AUTHORIZED: 'onetap: not authorized',
    AUTHENTICATION_INFO: 'onetap: authentication_info',
  },
  WidgetEvents: {
    ERROR: 'widget: error',
  },
}));

// Import after mock is set up
const { generatePkce, init, login, renderOneTap, exchangeCode, refresh, logout } = await import('../index');
// Import storage helpers to read the dynamically generated state for test assertions
const { safeGetItem } = await import('@/shared/storage');

// ──────────────────────────────────────────────
// Scenarios
// ──────────────────────────────────────────────
describe('M-VKID-CLIENT (VK ID SDK wrapper)', () => {
  // VKID1: generatePkce (deterministic)
  describe('scenario-VKID1: generatePkce', () => {
    it('returns codeVerifier 43-128 chars [a-zA-Z0-9_-], state >=32 chars, S256 codeChallenge', () => {
      const { codeVerifier, codeChallenge, state } = generatePkce();

      expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(codeVerifier.length).toBeLessThanOrEqual(128);
      expect(/^[a-zA-Z0-9_-]+$/.test(codeVerifier)).toBe(true);

      expect(state.length).toBeGreaterThanOrEqual(32);
      expect(/^[a-zA-Z0-9_-]+$/.test(state)).toBe(true);

      // codeChallenge is S256 base64url of codeVerifier (non-empty, differs from codeVerifier)
      expect(codeChallenge).toBeTruthy();
      expect(codeChallenge).not.toBe(codeVerifier);
    });
  });

  // VKID2: login (D+T)
  describe('scenario-VKID2: login', () => {
    it('calls VKID.Config.init with appId, redirectUrl, codeVerifier, state, scope; VKID.Auth.login called', async () => {
      mockAuthLogin.mockResolvedValueOnce({
        code: FAKE_CODE,
        state: 'stored-state-value',
        device_id: FAKE_DEVICE_ID,
      });

      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      const result = await login();

      expect(mockConfigInit).toHaveBeenCalledWith(
        expect.objectContaining({
          app: TEST_APP_ID,
          redirectUrl: TEST_REDIRECT_URL,
          scope: TEST_SCOPE,
        }),
      );
      expect(mockAuthLogin).toHaveBeenCalled();
      expect(result).toEqual({
        code: FAKE_CODE,
        state: expect.any(String),
        device_id: FAKE_DEVICE_ID,
      });

      expectMarkerPresent('[VkIdClient][login][BLOCK_VKID_LOGIN]');
    });
  });

  // VKID3: exchangeCode (D+T, ordering)
  describe('scenario-VKID3: exchangeCode', () => {
    it('calls backend /auth/exchange, returns VkIdTokenSet with expires_in=3600; BLOCK_VKID_EXCHANGE after BLOCK_VKID_LOGIN', async () => {
      // Read the state that init() stored in localStorage so the mock matches CSRF validation
      const storedState = safeGetItem('vkid_state_sent') || 'fallback-state';
      mockAuthLogin.mockResolvedValueOnce({
        code: FAKE_CODE,
        state: storedState,
        device_id: FAKE_DEVICE_ID,
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: FAKE_TOKEN,
          refresh_token: FAKE_REFRESH,
          id_token: FAKE_ID_TOKEN,
          token_type: 'Bearer',
          expires_in: 3600,
          user_id: FAKE_USER_ID,
          device_id: FAKE_DEVICE_ID,
          scope: TEST_SCOPE,
        }),
      });

      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      const loginResult = await login();
      const tokenSet = await exchangeCode(loginResult.code, loginResult.device_id);

      expect(tokenSet.access_token).toBe(FAKE_TOKEN);
      expect(tokenSet.expires_in).toBe(3600);
      expect(tokenSet.refresh_token).toBe(FAKE_REFRESH);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/exchange'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );
      const lastCall = fetchMock.mock.calls[0];
      const reqBody = JSON.parse(lastCall[1].body);
      expect(reqBody.code).toBe(loginResult.code);
      expect(reqBody.device_id).toBe(loginResult.device_id);
      expect(reqBody.code_verifier).toBeTypeOf('string');

      expectMarkerPresent('[VkIdClient][exchangeCode][BLOCK_VKID_EXCHANGE]');
      // Trace ordering: BLOCK_VKID_LOGIN before BLOCK_VKID_EXCHANGE (FP-VKID-2)
      const loginIdx = markerIndex('[VkIdClient][login][BLOCK_VKID_LOGIN]');
      const exchangeIdx = markerIndex('[VkIdClient][exchangeCode][BLOCK_VKID_EXCHANGE]');
      expect(loginIdx).toBeGreaterThanOrEqual(0);
      expect(exchangeIdx).toBeGreaterThan(loginIdx);
    });
  });

  // VKID4: state mismatch (D+T, forbidden marker)
  describe('scenario-VKID4: state mismatch (CSRF guard)', () => {
    it('throws VKID_STATE_MISMATCH, does NOT call exchangeCode, BLOCK_VKID_EXCHANGE absent', async () => {
      mockAuthLogin.mockResolvedValueOnce({
        code: FAKE_CODE,
        state: 'tampered-state-value', // mismatch
        device_id: FAKE_DEVICE_ID,
      });

      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      const loginResult = await login();

      await expect(exchangeCode(loginResult.code, loginResult.device_id)).rejects.toThrow(
        /VKID_STATE_MISMATCH/,
      );

      // exchangeCode must NOT have been called (CSRF guard)
      expect(fetchMock).not.toHaveBeenCalled();

      expectMarkerPresent('[VkIdClient][login][BLOCK_VKID_STATE_MISMATCH]');
      // Forbidden: BLOCK_VKID_EXCHANGE must NOT appear (FP-VKID-3)
      expectMarkerAbsent('[VkIdClient][exchangeCode][BLOCK_VKID_EXCHANGE]');
    });
  });

  // VKID5: refresh (D+T)
  describe('scenario-VKID5: refresh', () => {
    it('calls backend /auth/refresh, returns NEW token set (different from old)', async () => {
      const NEW_TOKEN = 'new_fake_vkid_access_token_aaa';
      const NEW_REFRESH = 'new_fake_vkid_refresh_token_bbb';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: NEW_TOKEN,
          refresh_token: NEW_REFRESH,
          token_type: 'Bearer',
          expires_in: 3600,
          user_id: FAKE_USER_ID,
          device_id: FAKE_DEVICE_ID,
          scope: TEST_SCOPE,
        }),
      });

      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      const tokenSet = await refresh(FAKE_REFRESH, FAKE_DEVICE_ID);

      expect(tokenSet.access_token).toBe(NEW_TOKEN);
      expect(tokenSet.access_token).not.toBe(FAKE_TOKEN);
      expect(tokenSet.refresh_token).toBe(NEW_REFRESH);
      expect(tokenSet.refresh_token).not.toBe(FAKE_REFRESH);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );
      const lastCall = fetchMock.mock.calls[0];
      const reqBody = JSON.parse(lastCall[1].body);
      expect(reqBody.refresh_token).toBe(FAKE_REFRESH);
      expect(reqBody.device_id).toBe(FAKE_DEVICE_ID);

      expectMarkerPresent('[VkIdClient][refresh][BLOCK_VKID_REFRESH]');
    });
  });

  // VKID6: refresh failure (D+T)
  describe('scenario-VKID6: refresh failure', () => {
    it('throws VKID_REFRESH_FAILED when backend /auth/refresh rejects', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'invalid_token',
      });

      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      await expect(refresh(FAKE_REFRESH, FAKE_DEVICE_ID)).rejects.toThrow(/VKID_REFRESH_FAILED/);
    });
  });

  // VKID7: token redaction (T-only, FP-VKID-1)
  describe('scenario-VKID7: tokens never in logs (security)', () => {
    it('FAKE_TOKEN and FAKE_REFRESH do NOT appear in any console output', async () => {
      // Read the state that init() stored in localStorage so the mock matches CSRF validation
      const storedState = safeGetItem('vkid_state_sent') || 'fallback-state';
      mockAuthLogin.mockResolvedValueOnce({
        code: FAKE_CODE,
        state: storedState,
        device_id: FAKE_DEVICE_ID,
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: FAKE_TOKEN,
          refresh_token: FAKE_REFRESH,
          id_token: FAKE_ID_TOKEN,
          token_type: 'Bearer',
          expires_in: 3600,
          user_id: FAKE_USER_ID,
          device_id: FAKE_DEVICE_ID,
          scope: TEST_SCOPE,
        }),
      });

      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      const loginResult = await login();
      await exchangeCode(loginResult.code, loginResult.device_id);

      // FP-VKID-1: no token leak
      expectNoTokenLeak();
    });
  });

  // VKID8: logout (D+T)
  describe('scenario-VKID8: logout', () => {
    it('calls VKID.Auth.logout with accessToken, resolves without error', async () => {
      mockAuthLogout.mockResolvedValueOnce(undefined);

      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      await logout(FAKE_TOKEN);

      expect(mockAuthLogout).toHaveBeenCalledWith(FAKE_TOKEN);
      expectMarkerPresent('[VkIdClient][logout][BLOCK_VKID_LOGOUT]');
    });
  });

  // VKID9: renderOneTap (D+T)
  describe('scenario-VKID9: renderOneTap', () => {
    it('instantiates OneTap and calls render with container, emitting BLOCK_VKID_ONETAP_RENDER', () => {
      const container = document.createElement('div');
      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      renderOneTap(container, { onSuccess: vi.fn() });

      expect(mockOneTapRender).toHaveBeenCalledWith({ container });
      expectMarkerPresent('[VkIdClient][renderOneTap][BLOCK_VKID_ONETAP_RENDER]');
    });
  });

  // VKID10: renderOneTap success (D+T)
  describe('scenario-VKID10: renderOneTap success', () => {
    it('triggers LOGIN_SUCCESS callback, validates state, calls exchangeCode and onSuccess, emitting BLOCK_VKID_ONETAP_SUCCESS', async () => {
      const container = document.createElement('div');
      const onSuccess = vi.fn();
      const onError = vi.fn();

      // Setup mock exchangeCode response
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: FAKE_TOKEN,
          refresh_token: FAKE_REFRESH,
          id_token: FAKE_ID_TOKEN,
          token_type: 'Bearer',
          expires_in: 3600,
          user_id: FAKE_USER_ID,
          device_id: FAKE_DEVICE_ID,
          scope: TEST_SCOPE,
        }),
      });

      // Capture callback registered on OneTap success login event
      let successCallback: any = null;
      mockOneTapOn.mockImplementation(function (this: any, event: string, cb: any) {
        if (event === 'onetap: success login') {
          successCallback = cb;
        }
        return this;
      });

      init(TEST_APP_ID, TEST_REDIRECT_URL, TEST_SCOPE);
      
      // Simulate state received from renderOneTap success callback
      renderOneTap(container, { onSuccess, onError });

      expect(successCallback).toBeTruthy();

      // Use the actual state from init() so CSRF validation passes
      const storedState = safeGetItem('vkid_state_sent') || 'fallback-state';
      await successCallback({
        code: FAKE_CODE,
        state: storedState,
        device_id: FAKE_DEVICE_ID,
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/auth/exchange'),
          expect.objectContaining({
            method: 'POST',
            body: expect.any(String),
          })
        );
        const lastCall = fetchMock.mock.calls[0];
        const reqBody = JSON.parse(lastCall[1].body);
        expect(reqBody.code).toBe(FAKE_CODE);
        expect(reqBody.device_id).toBe(FAKE_DEVICE_ID);
        expect(reqBody.code_verifier).toBeTypeOf('string');
        expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({
          access_token: FAKE_TOKEN,
          refresh_token: FAKE_REFRESH,
        }));
        expect(onError).not.toHaveBeenCalled();
      });

      expectMarkerPresent('[VkIdClient][renderOneTap][BLOCK_VKID_ONETAP_SUCCESS]');
    });
  });
});

// GRACE_MARKER: [VkIdClient][__tests__][BLOCK_VKID_TEST_SUITE]

const _graceLogMarkers = [
  "[VkIdClient][__tests__][BLOCK_VKID_TEST_SUITE]"
];
