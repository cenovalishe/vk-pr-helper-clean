// FILE: yc/__tests__/secrets.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit and smoke tests for setup-lockbox.cjs script.
//   SCOPE: Validate Yandex Lockbox service account creation, secret creation, and role bindings.
//   DEPENDS: M-YC-SECRETS
//   LINKS: V-M-YC-SECRETS
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of secrets.test.ts unit tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import child_process from 'child_process';
import fs from 'fs';

describe('M-YC-SECRETS - YcSecretsScript', () => {
  let execSyncSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    execSyncSpy = vi.spyOn(child_process, 'execSync').mockReturnValue(Buffer.from('id: sec-12345'));
    
    // Set up dummy environment variables
    process.env.VK_APP_ID = '12345';
    process.env.VK_ID_SALT = 'salt';
    process.env.JWT_SECRET = 'secret';
    process.env.VK_OAUTH_REDIRECT_URL = 'http://localhost/callback';
    process.env.VK_SERVICE_TOKEN = 'service-token';
    process.env.VK_CLIENT_SECRET = 'client-secret';
    process.env.YDB_ENDPOINT = 'grpcs://ydb.endpoint:2135';
    process.env.YDB_DATABASE = '/ru-central1/database';
    process.env.S3_ACCESS_KEY_ID = 's3-key';
    process.env.S3_SECRET_ACCESS_KEY = 's3-secret';
    process.env.CLIENT_ORIGIN = 'http://localhost';
    process.env.VK_API_VERSION = '5.131';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-YS1: runs lockbox setup script successfully', () => {
    const originalExistsSync = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      if (String(p).includes('.env.local') || String(p).includes('.env')) {
        return false;
      }
      return originalExistsSync(p);
    });

    const setupScript = require('../scripts/setup-lockbox.cjs');
    expect(() => setupScript.main()).not.toThrow();

    expect(execSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('yc iam service-account create'),
      expect.any(Object)
    );
    expect(execSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('yc lockbox secret create'),
      expect.any(Object)
    );
    expect(execSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('yc lockbox secret add-access-binding'),
      expect.any(Object)
    );
  });
});
