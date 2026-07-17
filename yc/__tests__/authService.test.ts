// FILE: yc/__tests__/authService.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/auth/service.ts.
//   SCOPE: Validate login handler responses, JWT verify/sign consistency, and log protection.
//   DEPENDS: M-YC-AUTH-SERVICE
//   LINKS: V-M-YC-AUTH-SERVICE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of YcAuthService tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loginHandler, exchangeHandler, refreshHandler, hashVkId, getNumericHashFromHex, verifyJwt, signJwt } from '../auth/service';
import * as tokenVerify from '../auth/tokenVerify';
import * as logger from '../logger';
import { clearConfigCache } from '../config';
import { getOrCreateUser } from '../users';

vi.mock('../users', () => ({
  getOrCreateUser: vi.fn().mockResolvedValue('mock-user-id')
}));

describe('M-YC-AUTH-SERVICE - AuthService', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'log').mockImplementation(() => {});
    clearConfigCache();

    // Set environment variables
    process.env.VK_APP_ID = '54669660';
    process.env.VK_ID_SALT = 'test-salt-12345';
    process.env.JWT_SECRET = 'test-jwt-secret-12345';
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

    vi.mocked(getOrCreateUser).mockReset().mockResolvedValue('mock-user-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('scenario-AS1: Valid token -> Token verified, VK ID hashed, user created/found, JWT returned', async () => {
    vi.spyOn(tokenVerify, 'verifyAccessToken').mockResolvedValue({ vkUserId: 123456 });

    const req = { body: { accessToken: 'valid-vk-token' } } as any;
    const res = mockRes();

    await loginHandler(req, res);

    expect(res.json).toHaveBeenCalled();
    const sessionToken = res.json.mock.calls[0][0].sessionToken;
    expect(sessionToken).toBeDefined();

    // Verify token payload using verifyJwt
    const payload = verifyJwt(sessionToken, 'test-jwt-secret-12345');
    // userId (full HMAC hash) is no longer included in JWT payload (FZ-152: avoid leaking pseudonymous data)
    expect(payload.userId).toBeUndefined();
    expect(payload.numericHash).toBeDefined();
    // hashedVkId is no longer included in JWT payload (security: avoid leaking the hash)
    expect(payload.hashedVkId).toBeUndefined();
    // exp is now in seconds (RFC 7519)
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    expect(tokenVerify.verifyAccessToken).toHaveBeenCalledWith('valid-vk-token');
    // getOrCreateUser is called with the hashedVkId internally (not from JWT payload)
    expect(getOrCreateUser).toHaveBeenCalled();
  });

  it('scenario-AS2: Invalid token -> M-YC-TOKEN-VERIFY throws, login fails with 401', async () => {
    vi.spyOn(tokenVerify, 'verifyAccessToken').mockRejectedValue(
      new tokenVerify.InvalidTokenError('Invalid token')
    );

    const req = { body: { accessToken: 'invalid-vk-token' } } as any;
    const res = mockRes();

    await loginHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'UNAUTHORIZED' });
  });

  it('scenario-AS3: Missing VK_ID_SALT config -> status 500', async () => {
    delete process.env.VK_ID_SALT;
    const req = { body: { accessToken: 'valid-vk-token' } } as any;
    const res = mockRes();

    await loginHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'INTERNAL_ERROR' });
  });

  it('scenario-AS4: Real VK ID and access_token never leak to logs', async () => {
    vi.spyOn(tokenVerify, 'verifyAccessToken').mockResolvedValue({ vkUserId: 987654321 });

    const req = { body: { accessToken: 'secret-token-do-not-leak' } } as any;
    const res = mockRes();

    await loginHandler(req, res);

    const logSpy = vi.spyOn(logger, 'log');
    for (const call of logSpy.mock.calls) {
      const dataStr = JSON.stringify(call);
      expect(dataStr).not.toContain('secret-token-do-not-leak');
      expect(dataStr).not.toContain('987654321');
    }
  });

  it('signJwt and verifyJwt consistency', () => {
    const payload = { userId: '123', numericHash: 456 };
    const secret = 'jwt-secret';
    const token = signJwt(payload, secret);
    const decoded = verifyJwt(token, secret);
    expect(decoded.userId).toBe('123');
    expect(decoded.numericHash).toBe(456);
  });

  it('verifyJwt throws on expired token', () => {
    // exp must be in seconds (RFC 7519 / jsonwebtoken convention)
    const payload = { userId: '123', exp: Math.floor(Date.now() / 1000) - 1 };
    const secret = 'jwt-secret';
    const token = signJwt(payload, secret);
    expect(() => verifyJwt(token, secret)).toThrow();
  });

  it('hashVkId returns deterministic HMAC-SHA256 hex string', () => {
    const hash1 = hashVkId(12345, 'salt1');
    const hash2 = hashVkId(12345, 'salt1');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex length
  });

  it('getNumericHashFromHex parses first 12 chars to integer', () => {
    const hex = 'abcdef1234567890';
    const num = getNumericHashFromHex(hex);
    expect(num).toBe(parseInt('abcdef123456', 16));
  });

  describe('exchangeHandler', () => {
    it('returns tokenSet on successful code exchange', async () => {
      const tokenResponse = {
        access_token: 'fake_access_token',
        refresh_token: 'fake_refresh_token',
        id_token: 'fake_id_token',
        expires_in: 3600,
        user_id: 12345,
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => tokenResponse,
      });

      const req = {
        body: {
          code: 'auth_code',
          device_id: 'device_123',
          code_verifier: 'verifier_abc',
        },
      } as any;
      const res = mockRes();

      await exchangeHandler(req, res);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://id.vk.ru/oauth2/auth',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('grant_type=authorization_code'),
        })
      );
      expect(res.json).toHaveBeenCalledWith(tokenResponse);
    });

    it('returns 400 on missing params', async () => {
      const req = { body: {} } as any;
      const res = mockRes();

      await exchangeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'MISSING_PARAMS' });
    });

    it('returns 502 when VK exchange fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'VK server error',
      });

      const req = {
        body: {
          code: 'auth_code',
          device_id: 'device_123',
          code_verifier: 'verifier_abc',
        },
      } as any;
      const res = mockRes();

      await exchangeHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'VKID_EXCHANGE_FAILED',
        message: 'VK server error',
      });
    });
  });

  describe('refreshHandler', () => {
    it('returns tokenSet on successful token refresh', async () => {
      const tokenResponse = {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => tokenResponse,
      });

      const req = {
        body: {
          refresh_token: 'old_refresh_token',
          device_id: 'device_123',
        },
      } as any;
      const res = mockRes();

      await refreshHandler(req, res);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://id.vk.ru/oauth2/auth',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('grant_type=refresh_token'),
        })
      );
      expect(res.json).toHaveBeenCalledWith(tokenResponse);
    });

    it('returns 400 on missing params', async () => {
      const req = { body: {} } as any;
      const res = mockRes();

      await refreshHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'MISSING_PARAMS' });
    });

    it('returns 502 when VK refresh fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'VK refresh error',
      });

      const req = {
        body: {
          refresh_token: 'old_refresh_token',
          device_id: 'device_123',
        },
      } as any;
      const res = mockRes();

      await refreshHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        error: 'VKID_REFRESH_FAILED',
        message: 'VK refresh error',
      });
    });
  });
});
