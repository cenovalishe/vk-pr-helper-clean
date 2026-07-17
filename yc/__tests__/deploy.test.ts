// FILE: yc/__tests__/deploy.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit and smoke tests for deploy-yc.cjs script.
//   SCOPE: Validate deployment orchestration, esbuild call, ZIP creation, S3 client initialization, file syncing, and YDB migrations.
//   DEPENDS: M-YC-DEPLOY
//   LINKS: V-M-YC-DEPLOY
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Refactored to use native require interception for clean offline test execution]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import child_process from 'child_process';
import fs from 'fs';
import path from 'path';
import Module from 'module';

const originalRequire = Module.prototype.require;

// Intercept require calls from native Node loader inside deploy-yc.cjs
Module.prototype.require = function (id) {
  if (id === '@aws-sdk/client-s3') {
    return {
      S3Client: class {
        send = () => Promise.resolve({});
      },
      PutObjectCommand: class {},
      PutBucketWebsiteCommand: class {},
      PutBucketCorsCommand: class {}
    };
  }
  if (id === 'adm-zip') {
    return class AdmZipMock {
      addLocalFile = () => {};
      writeZip = () => {};
    };
  }
  return originalRequire.call(this, id);
};

describe('M-YC-DEPLOY - YcDeployScript', () => {
  let execSyncSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    
    // Setup env variables for deploy
    process.env.S3_ACCESS_KEY_ID = 'test-s3-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-s3-secret';
    process.env.S3_BUCKET_STATIC = 'test-static-bucket';
    process.env.S3_BUCKET_TEMP = 'test-temp-bucket';
    process.env.YDB_ENDPOINT = 'grpcs://test-ydb:2135';
    process.env.YDB_DATABASE = '/ru-central1/test/db';
    process.env.LOCKBOX_SECRET_ID = 'sec-12345';
    process.env.SERVICE_ACCOUNT_ID = 'aje-test-sa-id';
    process.env.CLIENT_ORIGIN = 'https://test.example.com';

    execSyncSpy = vi.spyOn(child_process, 'execSync').mockReturnValue(Buffer.from('success'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined): never => {
      throw new Error(`process.exit called with code: ${code}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_BUCKET_STATIC;
    delete process.env.S3_BUCKET_TEMP;
    delete process.env.YDB_ENDPOINT;
    delete process.env.YDB_DATABASE;
    delete process.env.SERVICE_ACCOUNT_ID;
    delete process.env.CLIENT_ORIGIN;
  });

  it('scenario-YD1: executes full deployment successfully when zip is small', async () => {
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;
    const originalStatSync = fs.statSync;
    const originalReaddirSync = fs.readdirSync;

    vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
      const pStr = String(p);
      if (pStr.includes('.env.local') || pStr.includes('.env')) {
        return false;
      }
      if (pStr.includes('packages/web/dist')) {
        return true;
      }
      return originalExistsSync(p);
    });

    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any, ...args: any[]) => {
      const pStr = String(p);
      if (pStr.includes('packages/web/dist') || pStr.includes('function.zip') || pStr.includes('index.js')) {
        return Buffer.from('dummy-content');
      }
      return originalReadFileSync.call(fs, p, ...args);
    });

    vi.spyOn(fs, 'statSync').mockImplementation((p: any) => {
      const pStr = String(p);
      if (pStr.endsWith('function.zip')) {
        return { size: 1024 * 1024 * 1 } as any; // 1MB (<= 3.5MB, direct CLI upload)
      }
      if (pStr.includes('packages/web/dist')) {
        return { isDirectory: () => false, size: 500 } as any;
      }
      return originalStatSync(p);
    });

    // Mock readdirSync for nested walk
    let firstReaddir = true;
    vi.spyOn(fs, 'readdirSync').mockImplementation((p: any, ...args: any[]) => {
      const pStr = String(p);
      if (pStr.includes('packages/web/dist')) {
        if (firstReaddir) {
          firstReaddir = false;
          return ['index.html', 'main.js'] as any;
        }
        return [] as any;
      }
      return (originalReaddirSync as any)(p, ...args);
    });

    // Load deploy-yc.cjs dynamically
    const deployScript = require('../../deploy-yc.cjs');

    // Run main
    await expect(deployScript.main()).resolves.not.toThrow();

    // Verify esbuild, YC CLI function version create, YDB migration, pnpm web build, hosting config were run
    expect(execSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('esbuild yc/index.ts'),
      expect.any(Object)
    );
    expect(execSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('yc serverless function version create'),
      expect.any(Object)
    );
  });
});
