// FILE: yc/__tests__/authContext.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/auth/context.ts.
//   SCOPE: Validate assertVkIdentity token verification, secret separation, and authMiddleware Express lifecycle.
//   DEPENDS: M-YC-AUTH-CTX
//   LINKS: V-M-YC-AUTH-CTX
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - Updated tests for JWT-only auth on protected endpoints (raw VK tokens rejected); removed userId from JWT payload assertions]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertVkIdentity, authMiddleware } from '../auth/context';
import * as tokenVerify from '../auth/tokenVerify';
import * as logger from '../logger';
import * as service from '../auth/service';
import { clearConfigCache } from '../config';

describe('M-YC-AUTH-CTX - AuthContext', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'log').mockImplementation(() => {});
    clearConfigCache();

    // Set configuration environment variables
    process.env.VK_APP_ID = '54669660';
    process.env.VK_ID_SALT = 'test-salt-12345';
    process.env.JWT_SECRET = 'test-jwt-secret-67890';
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

    vi.spyOn(service, 'hashVkId').mockReturnValue('mock-hex-hash');
    vi.spyOn(service, 'getNumericHashFromHex').mockReturnValue(42);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-AC1: assertVkIdentity with valid JWT: resolves numericHash', async () => {
    const payload = { numericHash: 42, exp: Math.floor(Date.now() / 1000) + 10000 };
    const validJwt = service.signJwt(payload, 'test-jwt-secret-67890');

    const result = await assertVkIdentity(validJwt);
    expect(result).toBe(42);
  });

  it('scenario-AC2: assertVkIdentity with non-JWT token: rejected (JWT-only on protected endpoints)', async () => {
    await expect(assertVkIdentity('vk1.a.valid')).rejects.toThrow('UNAUTHORIZED');
  });

  it('scenario-AC5: assertVkIdentity with valid JWT session token: resolves numericHash', async () => {
    vi.restoreAllMocks();
    vi.spyOn(logger, 'log').mockImplementation(() => {});
    
    process.env.VK_ID_SALT = 'test-salt-12345';
    process.env.JWT_SECRET = 'test-jwt-secret-67890';
    
    const payload = { numericHash: 99, exp: Math.floor(Date.now() / 1000) + 10000 };
    const validJwt = service.signJwt(payload, 'test-jwt-secret-67890');
    
    const result = await assertVkIdentity(validJwt);
    expect(result).toBe(99);
  });

  it('scenario-AC6: assertVkIdentity with JWT signed with VK_ID_SALT (incorrect secret) MUST fail', async () => {
    vi.restoreAllMocks();
    vi.spyOn(logger, 'log').mockImplementation(() => {});

    process.env.VK_ID_SALT = 'test-salt-12345';
    process.env.JWT_SECRET = 'test-jwt-secret-67890';

    const payload = { numericHash: 99, exp: Math.floor(Date.now() / 1000) + 10000 };
    const badJwt = service.signJwt(payload, 'test-salt-12345'); // signed with VK_ID_SALT

    await expect(assertVkIdentity(badJwt)).rejects.toThrow('UNAUTHORIZED');
  });

  describe('authMiddleware', () => {
    const mockNext = vi.fn();
    const mockRes = () => {
      const res: any = {};
      res.status = vi.fn().mockReturnValue(res);
      res.json = vi.fn().mockReturnValue(res);
      return res;
    };

    it('should inject req.user and call next() on valid Bearer JWT', async () => {
      const payload = { numericHash: 99, exp: Math.floor(Date.now() / 1000) + 10000 };
      const validJwt = service.signJwt(payload, 'test-jwt-secret-67890');

      const req = { headers: { authorization: `Bearer ${validJwt}` } } as any;
      const res = mockRes();

      await authMiddleware(req, res, mockNext);

      expect(req.user).toEqual({ numericHash: 99 });
      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should inject req.user and call next() on valid JWT without Bearer prefix', async () => {
      const payload = { numericHash: 99, exp: Math.floor(Date.now() / 1000) + 10000 };
      const validJwt = service.signJwt(payload, 'test-jwt-secret-67890');

      const req = { headers: { authorization: validJwt } } as any;
      const res = mockRes();

      await authMiddleware(req, res, mockNext);

      expect(req.user).toEqual({ numericHash: 99 });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject non-JWT tokens (raw VK tokens not accepted on protected endpoints)', async () => {
      const req = { headers: { authorization: 'Bearer vk1.a.valid.token' } } as any;
      const res = mockRes();

      await authMiddleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'UNAUTHORIZED' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should respond with 401 on missing Authorization header', async () => {
      const req = { headers: {} } as any;
      const res = mockRes();

      await authMiddleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'UNAUTHORIZED' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should respond with 401 on invalid JWT signature', async () => {
      const payload = { numericHash: 99, exp: Math.floor(Date.now() / 1000) + 10000 };
      const badJwt = service.signJwt(payload, 'wrong-secret');

      const req = { headers: { authorization: `Bearer ${badJwt}` } } as any;
      const res = mockRes();

      await authMiddleware(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'UNAUTHORIZED' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
