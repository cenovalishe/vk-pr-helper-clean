// FILE: yc/__tests__/config.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/config.ts configuration loader.
//   SCOPE: Validate local dev environment loading, Lockbox REST API mocks, missing secret validation, and caching.
//   DEPENDS: M-YC-CONFIG
//   LINKS: V-M-YC-CONFIG
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of config loader tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getConfig, clearConfigCache } from '../config';

const originalEnv = { ...process.env };

const validEnvKeys = {
  VK_APP_ID: '54669660',
  VK_ID_SALT: 'test_salt',
  JWT_SECRET: 'test_jwt_secret',
  VK_OAUTH_REDIRECT_URL: 'http://localhost',
  VK_SERVICE_TOKEN: 'test_service_token',
  VK_CLIENT_SECRET: 'test_client_secret',
  VK_API_VERSION: '5.131',
  CLIENT_ORIGIN: 'http://localhost',
  YDB_ENDPOINT: 'test_ydb_endpoint',
  YDB_DATABASE: 'test_ydb_database',
  S3_ACCESS_KEY_ID: 'test_s3_key_id',
  S3_SECRET_ACCESS_KEY: 'test_s3_secret',
  S3_BUCKET_STATIC: 'test_static_bucket',
  S3_BUCKET_TEMP: 'test_temp_bucket'
};

beforeEach(() => {
  process.env = { ...originalEnv };
  clearConfigCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
});

describe('M-YC-CONFIG - YcConfig Loader', () => {
  it('should successfully load valid env keys in local dev mode (no Lockbox)', async () => {
    // Setup env keys
    Object.assign(process.env, validEnvKeys);
    delete process.env.LOCKBOX_SECRET_ID;

    const config = await getConfig();
    expect(config.vkAppId).toBe('54669660');
    expect(config.vkIdSalt).toBe('test_salt');
    expect(config.jwtSecret).toBe('test_jwt_secret');
    expect(config.s3BucketTemp).toBe('test_temp_bucket');
  });

  it('should throw MISSING_SECRET if any key is missing in local dev mode', async () => {
    Object.assign(process.env, validEnvKeys);
    delete process.env.LOCKBOX_SECRET_ID;
    
    // Remove one required key
    delete process.env.JWT_SECRET;

    await expect(getConfig()).rejects.toThrow('MISSING_SECRET');
  });

  it('should attempt to load secrets from Lockbox if LOCKBOX_SECRET_ID is defined', async () => {
    process.env.LOCKBOX_SECRET_ID = 'sec-12345';
    
    // Mock global fetch for metadata server + Lockbox payload
    const mockFetch = vi.spyOn(global, 'fetch');
    
    // First call: metadata token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'fake-iam-token' })
    } as Response);

    // Second call: Lockbox payload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: Object.entries(validEnvKeys).map(([key, value]) => ({
          key,
          textValue: value
        }))
      })
    } as Response);

    const config = await getConfig();
    
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('computeMetadata');
    expect(mockFetch.mock.calls[1][0]).toContain('sec-12345/payload');
    expect(config.vkAppId).toBe('54669660');
    expect(config.jwtSecret).toBe('test_jwt_secret');
  });

  it('should throw LOCKBOX_ACCESS_DENIED if metadata token fetch fails', async () => {
    process.env.LOCKBOX_SECRET_ID = 'sec-12345';
    
    const mockFetch = vi.spyOn(global, 'fetch');
    mockFetch.mockResolvedValueOnce({
      ok: false
    } as Response);

    await expect(getConfig()).rejects.toThrow('LOCKBOX_ACCESS_DENIED');
  });

  it('should throw LOCKBOX_ACCESS_DENIED if Lockbox REST endpoint returns error status', async () => {
    process.env.LOCKBOX_SECRET_ID = 'sec-12345';
    
    const mockFetch = vi.spyOn(global, 'fetch');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'fake-iam-token' })
    } as Response);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403
    } as Response);

    await expect(getConfig()).rejects.toThrow('LOCKBOX_ACCESS_DENIED');
  });

  it('should cache configuration on successful load', async () => {
    Object.assign(process.env, validEnvKeys);
    delete process.env.LOCKBOX_SECRET_ID;

    const first = await getConfig();
    
    // Delete keys from environment - should still return from cache
    process.env.VK_APP_ID = 'different';
    
    const second = await getConfig();
    expect(second.vkAppId).toBe(first.vkAppId);
  });
});
