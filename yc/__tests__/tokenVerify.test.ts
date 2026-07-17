// FILE: yc/__tests__/tokenVerify.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/auth/tokenVerify.ts.
//   SCOPE: Validate users.get fallback, user_info JWT verification, error handling, and redaction verification.
//   DEPENDS: M-YC-TOKEN-VERIFY
//   LINKS: V-M-YC-TOKEN-VERIFY
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of YcTokenVerify tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyAccessToken, InvalidTokenError } from '../auth/tokenVerify';
import * as logger from '../logger';
import { clearConfigCache } from '../config';

describe('M-YC-TOKEN-VERIFY - TokenVerify', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'log').mockImplementation(() => {});
    clearConfigCache();

    // Set all 14 config fields required by getConfig()
    process.env.VK_APP_ID = '54669660';
    process.env.VK_ID_SALT = 'test_salt';
    process.env.JWT_SECRET = 'test_jwt_secret';
    process.env.VK_OAUTH_REDIRECT_URL = 'http://localhost';
    process.env.VK_SERVICE_TOKEN = 'test_service_token';
    process.env.VK_CLIENT_SECRET = 'clientsecret';
    process.env.VK_API_VERSION = '5.131';
    process.env.CLIENT_ORIGIN = 'http://localhost';
    process.env.YDB_ENDPOINT = 'ydb_endpoint';
    process.env.YDB_DATABASE = 'ydb_db';
    process.env.S3_ACCESS_KEY_ID = 's3_key';
    process.env.S3_SECRET_ACCESS_KEY = 's3_secret';
    process.env.S3_BUCKET_STATIC = 'static';
    process.env.S3_BUCKET_TEMP = 'temp-bucket';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockOkResponse = (body: any) =>
    ({
      ok: true,
      json: async () => body
    } as Response);

  it('scenario-TV1: Valid access_token: users.get returns [{id:N}] → returns { vkUserId: N }', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockOkResponse({ response: [{ id: 42, first_name: 'X', last_name: 'Y' }] }));

    const result = await verifyAccessToken('vk1.a.validtoken');
    expect(result.vkUserId).toBe(42);
  });

  it('scenario-TV2: VK error code 5 (invalid token): throws InvalidTokenError', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockOkResponse({ error: { error_code: 5, error_msg: 'User authorization failed' } }));

    await expect(verifyAccessToken('bad')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('scenario-TV3: Empty users.get response: throws InvalidTokenError', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockOkResponse({ response: [] }));

    await expect(verifyAccessToken('some')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('scenario-TV4: Missing/null token: throws InvalidTokenError MISSING_TOKEN', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    await expect(verifyAccessToken('')).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(verifyAccessToken(null as any)).rejects.toBeInstanceOf(InvalidTokenError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('scenario-TV5: Network error: throws Error (not InvalidTokenError)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(verifyAccessToken('tok')).rejects.not.toBeInstanceOf(InvalidTokenError);
    await expect(verifyAccessToken('tok')).rejects.toThrow();
  });

  it('scenario-TV6: VK code 27 (group token, not user): throws InvalidTokenError', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockOkResponse({ error: { error_code: 27, error_msg: 'group token' } }));

    await expect(verifyAccessToken('grp')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('scenario-TV7: access_token value never in logs', async () => {
    const secret = 'vk1.a.TOP_SECRET_TOKEN_VALUE';
    global.fetch = vi.fn().mockResolvedValue(mockOkResponse({ response: [{ id: 1 }] }));

    await verifyAccessToken(secret);

    const calls = vi.mocked(logger.log).mock.calls;
    const allArgs = calls.flat();
    for (const arg of allArgs) {
      if (typeof arg === 'string') {
        expect(arg).not.toContain(secret);
      } else if (arg && typeof arg === 'object') {
        expect(JSON.stringify(arg)).not.toContain(secret);
      }
    }
  });

  describe('VK ID JWT verification (starts with eyJ)', () => {
    it('scenario-TV8: Valid JWT token: user_info returns user.user_id → returns { vkUserId }', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockOkResponse({ user: { user_id: 12345 } }));

      const result = await verifyAccessToken('eyJ.valid.jwt');
      expect(result.vkUserId).toBe(12345);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://id.vk.ru/oauth2/user_info?client_id=54669660'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('client_secret=clientsecret')
        })
      );
    });

    it('scenario-TV9: Invalid JWT token: user_info returns error → throws InvalidTokenError', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockOkResponse({ error: 'invalid_token', error_description: 'Token expired' }));

      await expect(verifyAccessToken('eyJ.invalid.jwt')).rejects.toBeInstanceOf(InvalidTokenError);
    });
  });
});
