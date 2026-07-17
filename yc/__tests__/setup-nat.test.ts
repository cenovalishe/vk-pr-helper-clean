// FILE: yc/__tests__/setup-nat.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit and mock tests for yc/scripts/setup-nat.cjs script.
//   SCOPE: Validate NAT Gateway creation, Route Table creation, routing rule creation, and subnet binding logic.
//   DEPENDS: M-YC-NAT-SETUP
//   LINKS: V-M-YC-NAT-SETUP
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of setup-nat smoke tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import child_process from 'child_process';

describe('M-YC-NAT-SETUP - YcNatSetupScript', () => {
  let execSyncSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up require cache
    delete require.cache[require.resolve('../scripts/setup-nat.cjs')];
  });

  it('scenario-YN1: exits with code 1 if YC CLI check fails (unauthenticated)', () => {
    execSyncSpy = vi.spyOn(child_process, 'execSync').mockImplementation((cmd: any) => {
      if (String(cmd).includes('yc vpc network list')) {
        throw new Error('Failed to get credentials');
      }
      return Buffer.from('');
    });

    const setupNat = require('../scripts/setup-nat.cjs');
    setupNat();

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('scenario-YN2: runs gateway and route-table creation if they do not exist', () => {
    const commandsRun: string[] = [];
    execSyncSpy = vi.spyOn(child_process, 'execSync').mockImplementation((cmd: any) => {
      commandsRun.push(String(cmd));
      if (String(cmd).includes('yc vpc network list')) {
        return Buffer.from(JSON.stringify([{ id: 'net-123', name: 'default' }]));
      }
      if (String(cmd).includes('yc vpc gateway list')) {
        return Buffer.from(JSON.stringify([])); // Empty list
      }
      if (String(cmd).includes('yc vpc gateway create')) {
        return Buffer.from(JSON.stringify({ id: 'gw-123', name: 'vk-pr-helper-nat' }));
      }
      if (String(cmd).includes('yc vpc route-table list')) {
        return Buffer.from(JSON.stringify([])); // Empty list
      }
      if (String(cmd).includes('yc vpc subnet list')) {
        return Buffer.from(JSON.stringify([
          { id: 'sub-1', name: 'subnet-a', network_id: 'net-123' },
          { id: 'sub-2', name: 'subnet-b', network_id: 'net-123' }
        ]));
      }
      return Buffer.from('success');
    });

    const setupNat = require('../scripts/setup-nat.cjs');
    setupNat();

    // Verify it didn't exit with error
    expect(exitSpy).not.toHaveBeenCalled();

    // Verify correct commands were run
    expect(commandsRun.some(c => c.includes('yc vpc gateway create'))).toBe(true);
    expect(commandsRun.some(c => c.includes('yc vpc route-table create'))).toBe(true);
    expect(commandsRun.some(c => c.includes('yc vpc subnet update'))).toBe(true);
  });

  it('scenario-YN3: skips gateway and route-table creation if they already exist, binds subnets', () => {
    const commandsRun: string[] = [];
    execSyncSpy = vi.spyOn(child_process, 'execSync').mockImplementation((cmd: any) => {
      commandsRun.push(String(cmd));
      if (String(cmd).includes('yc vpc network list')) {
        return Buffer.from(JSON.stringify([{ id: 'net-123', name: 'default' }]));
      }
      if (String(cmd).includes('yc vpc gateway list')) {
        return Buffer.from(JSON.stringify([{ id: 'gw-123', name: 'vk-pr-helper-nat' }]));
      }
      if (String(cmd).includes('yc vpc route-table list')) {
        return Buffer.from(JSON.stringify([{ id: 'rt-123', name: 'vk-pr-helper-rt' }]));
      }
      if (String(cmd).includes('yc vpc subnet list')) {
        return Buffer.from(JSON.stringify([
          { id: 'sub-1', name: 'subnet-a', network_id: 'net-123' }
        ]));
      }
      return Buffer.from('success');
    });

    const setupNat = require('../scripts/setup-nat.cjs');
    setupNat();

    expect(exitSpy).not.toHaveBeenCalled();
    // Gateway create and Route Table create should be skipped
    expect(commandsRun.some(c => c.includes('yc vpc gateway create'))).toBe(false);
    expect(commandsRun.some(c => c.includes('yc vpc route-table create'))).toBe(false);
    // Subnet update should still be run
    expect(commandsRun.some(c => c.includes('yc vpc subnet update'))).toBe(true);
  });
});
