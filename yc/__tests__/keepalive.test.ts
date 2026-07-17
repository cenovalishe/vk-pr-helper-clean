// FILE: yc/__tests__/keepalive.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit and smoke tests for yc/scripts/create-keepalive.cjs script.
//   SCOPE: Validate trigger creation command construction, CLI profile checks, and error handling.
//   DEPENDS: M-YC-KEEPALIVE
//   LINKS: V-M-YC-KEEPALIVE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of keepalive creation smoke tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import child_process from 'child_process';

describe('M-YC-KEEPALIVE - YcKeepaliveScript', () => {
  let execSyncSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    execSyncSpy = vi.spyOn(child_process, 'execSync').mockImplementation((cmd: any) => {
      if (String(cmd).includes('trigger get')) {
        throw new Error('trigger not found');
      }
      return Buffer.from('success');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-YK1: runs trigger creation command successfully when YC CLI is active', async () => {
    const keepaliveScript = require('../scripts/create-keepalive.cjs');

    // Run main
    expect(() => keepaliveScript.main()).not.toThrow();

    // Verify YC CLI trigger create command was run
    expect(execSyncSpy).toHaveBeenCalledWith(
      expect.stringContaining('yc serverless trigger create timer'),
      expect.any(Object)
    );
  });
});
