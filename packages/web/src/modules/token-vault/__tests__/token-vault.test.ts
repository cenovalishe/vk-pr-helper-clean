// FILE: packages/web/src/modules/token-vault/__tests__/token-vault.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-TOKEN-VAULT (VK ID token storage + proactive refresh lifecycle)
//   SCOPE: store, getValidAccessToken (valid/expiring/refresh-fail), onTokenChange, isAuthenticated, clear, cascade invariant (FP-VKID-4), token redaction
//   DEPENDS: M-TOKEN-VAULT, M-VKID-CLIENT (mocked for refresh)
//   LINKS: M-TOKEN-VAULT, VerificationPlan.V-M-TOKEN-VAULT, VerificationPlan.scenario-TV1..TV8
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FAKE_TOKEN         - stub VK ID access_token for redaction checks
//   FAKE_REFRESH       - stub VK ID refresh_token for cascade + redaction checks
//   NEW_FAKE_TOKEN     - stub refreshed access_token (different from FAKE_TOKEN)
//   NEW_FAKE_REFRESH   - stub refreshed refresh_token (different from FAKE_REFRESH)
//   FAKE_DEVICE_ID     - stub device_id
//   FAKE_USER_ID       - stub user_id
//   consoleSpy         - TraceHarness console spy (info/warn/error/debug/log)
//   allCalls            - aggregated console call args for trace assertions
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Initial scaffold for Phase-VKID-MIGRATION. Implements TraceHarness pattern
//                with vi.mock M-VKID-CLIENT.refresh. Covers scenarios TV1-TV8 + forbidden patterns FP-VKID-1, FP-VKID-4.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────
// Constants (FAKE_TOKEN pattern per TraceHarness redaction-in-tests)
// ──────────────────────────────────────────────
const FAKE_TOKEN = 'fake_vkid_access_token_abc123def456';
const FAKE_REFRESH = 'fake_vkid_refresh_token_xyz789ghi012';
const FAKE_ID_TOKEN = 'fake_vkid_id_token_jwt_payload';
const FAKE_DEVICE_ID = 'fake_device_id_12345';
const FAKE_USER_ID = 42424242;
const FAKE_SCOPE = 'wall photos groups';
const NEW_FAKE_TOKEN = 'new_fake_vkid_access_token_aaa111';
const NEW_FAKE_REFRESH = 'new_fake_vkid_refresh_token_bbb222';
const NOW = Math.floor(Date.now() / 1000);

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

beforeEach(() => {
  localStorage.clear();
  consoleSpy = {
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
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

function clearConsoleSpies(): void {
  consoleSpy.info.mockClear();
  consoleSpy.warn.mockClear();
  consoleSpy.error.mockClear();
  consoleSpy.debug.mockClear();
  consoleSpy.log.mockClear();
}

function expectMarkerPresent(marker: string): void {
  const allStrings = getAllStrings();
  expect(
    allStrings.some((s) => s.includes(marker)),
    `Expected marker "${marker}" to appear in trace`,
  ).toBe(true);
}

function expectMarkerAbsent(marker: string): void {
  const allStrings = getAllStrings();
  expect(
    allStrings.some((s) => s.includes(marker)),
    `Forbidden marker "${marker}" appeared in trace (FP violation)`,
  ).toBe(false);
}

function expectNoTokenLeak(): void {
  const allStrings = getAllStrings();
  expect(allStrings.some((s) => s.includes(FAKE_TOKEN)), 'FAKE_TOKEN leaked (FP-VKID-1)').toBe(false);
  expect(allStrings.some((s) => s.includes(FAKE_REFRESH)), 'FAKE_REFRESH leaked (FP-VKID-1)').toBe(false);
}

function markerIndex(marker: string): number {
  const allStrings = getAllStrings();
  return allStrings.findIndex((s) => s.includes(marker));
}

// ──────────────────────────────────────────────
// Mock M-VKID-CLIENT (for refresh call)
// ──────────────────────────────────────────────
const mockRefresh = vi.fn();
vi.mock('@/modules/vkid-client', () => ({
  refresh: mockRefresh,
}));

// Import after mock is set up
const { store, getValidAccessToken, clear, onTokenChange, isAuthenticated } = await import('../index');

// Helper: build a token set for store()
function makeTokenSet(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    access_token: FAKE_TOKEN,
    refresh_token: FAKE_REFRESH,
    id_token: FAKE_ID_TOKEN,
    token_type: 'Bearer',
    expires_in: 3600,
    user_id: FAKE_USER_ID,
    device_id: FAKE_DEVICE_ID,
    scope: FAKE_SCOPE,
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Scenarios
// ──────────────────────────────────────────────
describe('M-TOKEN-VAULT (VK ID token storage + refresh lifecycle)', () => {
  // TV1: store (D+T)
  describe('scenario-TV1: store', () => {
    it('writes vkpr_* keys to localStorage + in-memory cache; emits BLOCK_TOKEN_STORE', () => {
      const tokenSet = makeTokenSet();
      store(tokenSet);

      expect(localStorage.getItem('vkpr_access_token')).toBe(FAKE_TOKEN);
      expect(localStorage.getItem('vkpr_refresh_token')).toBe(FAKE_REFRESH);
      expect(localStorage.getItem('vkpr_device_id')).toBe(FAKE_DEVICE_ID);
      expect(localStorage.getItem('vkpr_user_id')).toBe(String(FAKE_USER_ID));
      expect(localStorage.getItem('vkpr_scope')).toBe(FAKE_SCOPE);
      // expires_at should be approximately now + 3600
      const expiresAt = Number(localStorage.getItem('vkpr_expires_at'));
      expect(expiresAt).toBeGreaterThan(NOW);
      expect(expiresAt).toBeLessThanOrEqual(NOW + 3600 + 5); // allow 5s slack

      expect(isAuthenticated()).toBe(true);
      expectMarkerPresent('[TokenVault][store][BLOCK_TOKEN_STORE]');
    });
  });

  // TV2: getValidAccessToken — valid token, no refresh (D)
  describe('scenario-TV2: getValidAccessToken (valid, no refresh)', () => {
    it('returns FAKE_TOKEN from cache; refresh spy NOT called', async () => {
      store(makeTokenSet()); // expires_in=3600, so valid for ~1h

      const token = await getValidAccessToken();
      expect(token).toBe(FAKE_TOKEN);
      expect(mockRefresh).not.toHaveBeenCalled();
    });
  });

  // TV3: getValidAccessToken — expiring, triggers refresh (D+T, ordering)
  describe('scenario-TV3: getValidAccessToken (expiring, refresh)', () => {
    it('triggers M-VKID-CLIENT.refresh, returns NEW token, updates storage; BLOCK_TOKEN_REFRESH before BLOCK_TOKEN_STORE', async () => {
      // Store with expires_in that makes token expiring (within 5min window)
      const expiringTokenSet = makeTokenSet({ expires_in: 200 }); // 200s = within 300s window
      store(expiringTokenSet);
      clearConsoleSpies();

      mockRefresh.mockResolvedValueOnce(
        makeTokenSet({
          access_token: NEW_FAKE_TOKEN,
          refresh_token: NEW_FAKE_REFRESH,
        }),
      );

      const token = await getValidAccessToken();
      expect(token).toBe(NEW_FAKE_TOKEN);
      expect(mockRefresh).toHaveBeenCalledWith(FAKE_REFRESH, FAKE_DEVICE_ID);

      // Storage updated with new tokens
      expect(localStorage.getItem('vkpr_access_token')).toBe(NEW_FAKE_TOKEN);
      expect(localStorage.getItem('vkpr_refresh_token')).toBe(NEW_FAKE_REFRESH);

      // Trace ordering: BLOCK_TOKEN_REFRESH before BLOCK_TOKEN_STORE (assertion-3)
      expectMarkerPresent('[TokenVault][refresh][BLOCK_TOKEN_REFRESH]');
      expectMarkerPresent('[TokenVault][store][BLOCK_TOKEN_STORE]');
      const refreshIdx = markerIndex('[TokenVault][refresh][BLOCK_TOKEN_REFRESH]');
      const storeIdx = markerIndex('[TokenVault][store][BLOCK_TOKEN_STORE]');
      expect(refreshIdx).toBeGreaterThanOrEqual(0);
      expect(storeIdx).toBeGreaterThan(refreshIdx);
    });
  });

  // TV4: getValidAccessToken — refresh fails, clear (D+T, ordering)
  describe('scenario-TV4: getValidAccessToken (refresh fails, clear)', () => {
    it('returns null, clear() fires, all vkpr_* keys removed; BLOCK_TOKEN_REFRESH before BLOCK_TOKEN_CLEAR', async () => {
      const expiringTokenSet = makeTokenSet({ expires_in: 200 });
      store(expiringTokenSet);
      clearConsoleSpies();

      mockRefresh.mockRejectedValueOnce(new Error('invalid_token'));

      const token = await getValidAccessToken();
      expect(token).toBeNull();

      // All vkpr_* keys removed
      expect(localStorage.getItem('vkpr_access_token')).toBeNull();
      expect(localStorage.getItem('vkpr_refresh_token')).toBeNull();
      expect(isAuthenticated()).toBe(false);

      // Trace ordering: BLOCK_TOKEN_REFRESH (failed) before BLOCK_TOKEN_CLEAR (assertion-4)
      expectMarkerPresent('[TokenVault][clear][BLOCK_TOKEN_CLEAR]');
      const refreshIdx = markerIndex('[TokenVault][refresh][BLOCK_TOKEN_REFRESH]');
      const clearIdx = markerIndex('[TokenVault][clear][BLOCK_TOKEN_CLEAR]');
      expect(refreshIdx).toBeGreaterThanOrEqual(0);
      expect(clearIdx).toBeGreaterThan(refreshIdx);
    });
  });

  // TV5: onTokenChange subscription (D)
  describe('scenario-TV5: onTokenChange subscription', () => {
    it('callback fires with new accessToken after refresh; null after clear', async () => {
      const calls: (string | null)[] = [];
      const unsubscribe = onTokenChange((token: string | null) => {
        calls.push(token);
      });

      store(makeTokenSet({ expires_in: 200 }));
      mockRefresh.mockResolvedValueOnce(
        makeTokenSet({ access_token: NEW_FAKE_TOKEN, refresh_token: NEW_FAKE_REFRESH }),
      );
      await getValidAccessToken(); // triggers refresh → onTokenChange(NEW_FAKE_TOKEN)

      // clear → onTokenChange(null)
      clear();

      expect(calls).toContain(NEW_FAKE_TOKEN);
      expect(calls).toContain(null);

      unsubscribe();
    });
  });

  // TV6: isAuthenticated (D)
  describe('scenario-TV6: isAuthenticated', () => {
    it('true after store, false after clear', () => {
      expect(isAuthenticated()).toBe(false);
      store(makeTokenSet());
      expect(isAuthenticated()).toBe(true);
      clear();
      expect(isAuthenticated()).toBe(false);
    });
  });

  // TV7: token redaction (T-only, FP-VKID-1)
  describe('scenario-TV7: tokens never in logs (security)', () => {
    it('FAKE_TOKEN and FAKE_REFRESH do NOT appear in any console output', () => {
      store(makeTokenSet());
      // Trigger some operations that might log
      expectNoTokenLeak();
    });

    it('FAKE_TOKEN and FAKE_REFRESH absent after refresh too', async () => {
      store(makeTokenSet({ expires_in: 200 }));
      clearConsoleSpies();
      mockRefresh.mockResolvedValueOnce(
        makeTokenSet({ access_token: NEW_FAKE_TOKEN, refresh_token: NEW_FAKE_REFRESH }),
      );
      await getValidAccessToken();
      expectNoTokenLeak();
      // Also check new tokens don't leak
      const allStrings = getAllStrings();
      expect(allStrings.some((s) => s.includes(NEW_FAKE_TOKEN))).toBe(false);
      expect(allStrings.some((s) => s.includes(NEW_FAKE_REFRESH))).toBe(false);
    });
  });

  // TV8: FP-VKID-4 cascade invariant (D+T)
  describe('scenario-TV8: FP-VKID-4 cascade invariant', () => {
    it('after refresh, localStorage has only NEW refresh_token (not old); BLOCK_TOKEN_STORE fires once', async () => {
      store(makeTokenSet({ expires_in: 200 })); // old = FAKE_REFRESH
      clearConsoleSpies();

      mockRefresh.mockResolvedValueOnce(
        makeTokenSet({ access_token: NEW_FAKE_TOKEN, refresh_token: NEW_FAKE_REFRESH }),
      );
      await getValidAccessToken();

      // localStorage must have NEW refresh_token, NOT old (FP-VKID-4)
      expect(localStorage.getItem('vkpr_refresh_token')).toBe(NEW_FAKE_REFRESH);
      expect(localStorage.getItem('vkpr_refresh_token')).not.toBe(FAKE_REFRESH);

      // BLOCK_TOKEN_STORE should fire exactly once per refresh (assertion-5)
      const allStrings = getAllStrings();
      const storeMarkerCount = allStrings.filter((s) =>
        s.includes('[TokenVault][store][BLOCK_TOKEN_STORE]'),
      ).length;
      // store() called once on initial store, once after refresh = 2 total.
      // The assertion is: no duplicate store in a single refresh cycle.
      // Count store markers AFTER refresh marker:
      const refreshIdx = markerIndex('[TokenVault][refresh][BLOCK_TOKEN_REFRESH]');
      const storesAfterRefresh = allStrings
        .map((s, i) => (s.includes('[TokenVault][store][BLOCK_TOKEN_STORE]') ? i : -1))
        .filter((i) => i > refreshIdx);
      expect(storesAfterRefresh.length).toBe(1); // exactly one store after refresh
    });
  });
});

// GRACE_MARKER: [TokenVault][__tests__][BLOCK_TOKEN_VAULT_TEST_SUITE]

const _graceLogMarkers = [
  "[TokenVault][__tests__][BLOCK_TOKEN_VAULT_TEST_SUITE]"
];
