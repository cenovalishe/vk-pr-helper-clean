// FILE: yc/__tests__/antiSpam.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/antiSpam.ts rate-limiting and lock management.
//   SCOPE: Validate checkAndLockSubmit rate limits (ok < 24h, pending < 5min, expired pending), different community submission, updateSubmitStatus status/postId/errorCode mapping, and log assertions.
//   DEPENDS: M-YC-ANTI-SPAM
//   LINKS: V-M-YC-ANTI-SPAM
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of M-YC-ANTI-SPAM tests with mock YDB state and log assertions]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as db from '../db/index';
import * as logger from '../logger';
import { checkAndLockSubmit, updateSubmitStatus, RateLimitedError } from '../antiSpam';

vi.mock('../db/index', () => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));

interface SubmitLog {
  id: number;
  vkUserId: number;
  communityId: number;
  postId?: number;
  status: string;
  errorCode?: number;
  createdAt: number;
}

let mockLogs: SubmitLog[] = [];

// Helper to extract raw values from YDB TypedValues objects
function extractValue(param: any): any {
  if (param === null || param === undefined) return null;
  if (typeof param === 'object' && 'type' in param && 'value' in param) {
    let type = param.type;
    let value = param.value;

    // Handle optionalType wrapper
    if (type && type.optionalType) {
      if (value && value.nullFlagValue !== undefined) {
        return null;
      }
      type = type.optionalType.item;
    }

    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 1) {
        const val = value[keys[0]];
        if (val && typeof val === 'object' && 'toString' in val) {
          return Number(val.toString());
        }
        return typeof val === 'string' ? val : Number(val);
      }
    }
    return typeof value === 'object' && 'toString' in value ? Number(value.toString()) : value;
  }
  return param;
}

describe('M-YC-ANTI-SPAM - YcAntiSpam', () => {
  beforeEach(() => {
    mockLogs = [];
    vi.clearAllMocks();
    vi.spyOn(logger, 'log').mockImplementation(() => {});

    // Mock transaction to simulate serializable transaction against mockLogs array
    vi.mocked(db.transaction).mockImplementation(async (callback) => {
      const tx = {
        query: vi.fn(async (yql, params) => {
          const vkUserId = extractValue(params?.$vkUserId);
          const communityId = extractValue(params?.$communityId);
          const dayLimitTime = extractValue(params?.$dayLimitTime);
          const pendingLimitTime = extractValue(params?.$pendingLimitTime);

          return mockLogs.filter(log => {
            if (log.vkUserId !== vkUserId || log.communityId !== communityId) {
              return false;
            }
            const isOkAndRecent = log.status === 'ok' && log.createdAt >= dayLimitTime;
            const isPendingAndRecent = log.status === 'pending' && log.createdAt >= pendingLimitTime;
            return isOkAndRecent || isPendingAndRecent;
          });
        }),
        execute: vi.fn(async (yql, params) => {
          const id = extractValue(params?.$id);
          const vkUserId = extractValue(params?.$vkUserId);
          const communityId = extractValue(params?.$communityId);
          const status = params?.$status; // Raw string
          const createdAt = extractValue(params?.$createdAt);

          mockLogs.push({
            id: Number(id),
            vkUserId: Number(vkUserId),
            communityId: Number(communityId),
            status: status && typeof status === 'object' ? status.value.textValue : status,
            createdAt: Number(createdAt),
          });
        })
      };
      return await callback(tx);
    });

    // Mock execute for updateSubmitStatus
    vi.mocked(db.execute).mockImplementation(async (yql, params) => {
      const id = extractValue(params?.$id);
      const statusValue = params?.$status;
      const status = statusValue && typeof statusValue === 'object' ? statusValue.value.textValue : statusValue;

      // Extract Uint64 values (sentinel 0 means "no value" per antiSpam.ts contract)
      const postId = extractValue(params?.$postId);
      const errorCode = extractValue(params?.$errorCode);

      const logRow = mockLogs.find(l => l.id === id);
      if (logRow) {
        logRow.status = status;
        logRow.postId = Number(postId);
        logRow.errorCode = Number(errorCode);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-YAS1: No recent submissions → lock acquired, pending row inserted, returns lockId', async () => {
    const lockId = await checkAndLockSubmit(111, 222);

    expect(lockId).toBeDefined();
    expect(mockLogs).toHaveLength(1);
    expect(mockLogs[0]).toMatchObject({
      vkUserId: 111,
      communityId: 222,
      status: 'pending'
    });

    expect(logger.log).toHaveBeenCalledWith(
      'YcAntiSpam',
      'checkAndLockSubmit',
      'BLOCK_LOCK_ACQUIRED',
      'Lock acquired',
      expect.objectContaining({ numericHash: 111, communityId: 222, lockId })
    );
  });

  it('scenario-YAS2: Recent ok submission (<24h) → throws RATE_LIMITED', async () => {
    mockLogs.push({
      id: 999,
      vkUserId: 111,
      communityId: 222,
      status: 'ok',
      createdAt: Date.now() - 3600 * 1000 // 1 hour ago
    });

    await expect(checkAndLockSubmit(111, 222)).rejects.toThrow(RateLimitedError);
    expect(mockLogs).toHaveLength(1); // No new pending rows inserted

    expect(logger.log).toHaveBeenCalledWith(
      'YcAntiSpam',
      'checkAndLockSubmit',
      'BLOCK_RATE_LIMIT_HIT',
      'Rate limit hit',
      expect.objectContaining({ numericHash: 111, communityId: 222 })
    );
  });

  it('scenario-YAS3: Existing pending (<5min) → throws RATE_LIMITED', async () => {
    mockLogs.push({
      id: 999,
      vkUserId: 111,
      communityId: 222,
      status: 'pending',
      createdAt: Date.now() - 60 * 1000 // 1 minute ago
    });

    await expect(checkAndLockSubmit(111, 222)).rejects.toThrow(RateLimitedError);
    expect(mockLogs).toHaveLength(1); // No new pending rows inserted

    expect(logger.log).toHaveBeenCalledWith(
      'YcAntiSpam',
      'checkAndLockSubmit',
      'BLOCK_RATE_LIMIT_HIT',
      'Rate limit hit',
      expect.objectContaining({ numericHash: 111, communityId: 222 })
    );
  });

  it('scenario-YAS4: updateSubmitStatus changes row status to ok/failed/rejected', async () => {
    const lockId = '1234567890';
    mockLogs.push({
      id: 1234567890,
      vkUserId: 111,
      communityId: 222,
      status: 'pending',
      createdAt: Date.now()
    });

    // Update status to 'ok' with postId
    await updateSubmitStatus(lockId, 'ok', 98765);
    expect(mockLogs[0]).toMatchObject({
      status: 'ok',
      postId: 98765
    });

    // Update status to 'failed' (no postId/errorCode → sentinel 0)
    await updateSubmitStatus(lockId, 'failed');
    expect(mockLogs[0].status).toBe('failed');
    expect(mockLogs[0].postId).toBe(0);
    expect(mockLogs[0].errorCode).toBe(0);

    // Update status to 'rejected' with VK errorCode 15
    await updateSubmitStatus(lockId, 'rejected', undefined, 15);
    expect(mockLogs[0]).toMatchObject({
      status: 'rejected',
      errorCode: 15
    });
  });

  it('scenario-YAS5: Expired pending (>5min) does NOT block — new lock acquired', async () => {
    mockLogs.push({
      id: 999,
      vkUserId: 111,
      communityId: 222,
      status: 'pending',
      createdAt: Date.now() - 6 * 60 * 1000 // 6 minutes ago (expired)
    });

    const lockId = await checkAndLockSubmit(111, 222);
    expect(lockId).toBeDefined();
    expect(mockLogs).toHaveLength(2); // Expired pending remains, new pending inserted
    expect(mockLogs[1]).toMatchObject({
      vkUserId: 111,
      communityId: 222,
      status: 'pending'
    });
  });

  it('scenario-YAS6: Different community — no cross-community rate limiting', async () => {
    mockLogs.push({
      id: 999,
      vkUserId: 111,
      communityId: 222,
      status: 'ok',
      createdAt: Date.now() - 3600 * 1000 // ok row in community 222
    });

    // Submitting to community 333 should succeed
    const lockId = await checkAndLockSubmit(111, 333);
    expect(lockId).toBeDefined();
    expect(mockLogs).toHaveLength(2);
  });
});
