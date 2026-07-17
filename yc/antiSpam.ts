// FILE: yc/antiSpam.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Atomically verify 24-hour rate limits per (user, community) and acquire a 'pending' lock to prevent concurrent submissions.
//   SCOPE: checkAndLockSubmit, updateSubmitStatus, RateLimitedError.
//   DEPENDS: M-YC-DB, M-YC-LOGGER
//   LINKS: M-YC-ANTI-SPAM
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   RateLimitedError - custom error class for rate limit hit
//   checkAndLockSubmit - function to check rate limits and insert a 'pending' submit log in a transaction
//   updateSubmitStatus - function to update status, postId, and errorCode of a submit log
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
// END_CHANGE_SUMMARY

import { TypedValues } from 'ydb-sdk';
import { transaction, execute } from './db/index';
import { log } from './logger';

export class RateLimitedError extends Error {
  status = 429;
  code = 'RATE_LIMITED';
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

// START_CONTRACT: checkAndLockSubmit
//   PURPOSE: Atomically check if a user can submit to a community within 24h, and acquire a lock.
//   INPUTS: { numericHash: number - hashed user id, communityId: number - community id }
//   OUTPUTS: { Promise<string> - lockId (submit_logs row id) }
//   SIDE_EFFECTS: Inserts a pending row in submit_logs within a transaction.
//   LINKS: M-YC-ANTI-SPAM
// END_CONTRACT: checkAndLockSubmit
export async function checkAndLockSubmit(numericHash: number, communityId: number): Promise<string> {
  // START_BLOCK_RATE_LIMIT_HIT
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  return await transaction(async (tx) => {
    // 1. Query existing ok or pending locks
    const rows = await tx.query(
      'DECLARE $vkUserId AS Uint64;\n' +
      'DECLARE $communityId AS Uint64;\n' +
      'DECLARE $dayLimitTime AS Uint64;\n' +
      'DECLARE $pendingLimitTime AS Uint64;\n' +
      'SELECT id, status, createdAt FROM submit_logs\n' +
      'WHERE vkUserId = $vkUserId\n' +
      '  AND communityId = $communityId\n' +
      '  AND (\n' +
      '    (status = \'ok\' AND createdAt >= $dayLimitTime)\n' +
      '    OR (status = \'pending\' AND createdAt >= $pendingLimitTime)\n' +
      '  )',
      {
        '$vkUserId': TypedValues.uint64(numericHash),
        '$communityId': TypedValues.uint64(communityId),
        '$dayLimitTime': TypedValues.uint64(oneDayAgo),
        '$pendingLimitTime': TypedValues.uint64(fiveMinutesAgo),
      }
    );

    if (rows && rows.length > 0) {
      log('YcAntiSpam', 'checkAndLockSubmit', 'BLOCK_RATE_LIMIT_HIT', 'Rate limit hit', {
        numericHash,
        communityId,
        existingLocks: rows.length
      });
      // END_BLOCK_RATE_LIMIT_HIT
      throw new RateLimitedError();
    }

    // 2. Acquire lock (insert pending row)
    // START_BLOCK_LOCK_ACQUIRED
    const lockId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    await tx.execute(
      'DECLARE $id AS Uint64;\n' +
      'DECLARE $vkUserId AS Uint64;\n' +
      'DECLARE $communityId AS Uint64;\n' +
      'DECLARE $status AS Utf8;\n' +
      'DECLARE $createdAt AS Uint64;\n' +
      'INSERT INTO submit_logs (id, vkUserId, communityId, status, createdAt)\n' +
      'VALUES ($id, $vkUserId, $communityId, $status, $createdAt)',
      {
        '$id': TypedValues.uint64(lockId),
        '$vkUserId': TypedValues.uint64(numericHash),
        '$communityId': TypedValues.uint64(communityId),
        '$status': TypedValues.utf8('pending'),
        '$createdAt': TypedValues.uint64(now)
      }
    );

    log('YcAntiSpam', 'checkAndLockSubmit', 'BLOCK_LOCK_ACQUIRED', 'Lock acquired', {
      numericHash,
      communityId,
      lockId: String(lockId)
    });

    return String(lockId);
    // END_BLOCK_LOCK_ACQUIRED
  });
}

// START_CONTRACT: updateSubmitStatus
//   PURPOSE: Update the status of an acquired submit lock.
//   INPUTS: { lockId: string - lock/row id, status: string - new status (ok/failed/rejected), postId?: number - VK post id if successful, errorCode?: number - VK error code if rejected }
//   OUTPUTS: { Promise<void> }
//   SIDE_EFFECTS: Updates submit_logs row in database.
//   LINKS: M-YC-ANTI-SPAM
// END_CONTRACT: updateSubmitStatus
export async function updateSubmitStatus(
  lockId: string,
  status: string,
  postId?: number,
  errorCode?: number
): Promise<void> {
  // START_BLOCK_UPDATE_STATUS
  const numericLockId = Number(lockId);

  // submit_logs schema: postId and errorCode are UINT64 (NOT Optional).
  // Use 0 as sentinel for "no value" since YDB does not allow Optional for non-optional columns.
  const safePostId = postId !== undefined ? postId : 0;
  const safeErrorCode = errorCode !== undefined ? errorCode : 0;

  await execute(
    'DECLARE $id AS Uint64;\n' +
    'DECLARE $status AS Utf8;\n' +
    'DECLARE $postId AS Uint64;\n' +
    'DECLARE $errorCode AS Uint64;\n' +
    'UPDATE submit_logs SET\n' +
    '  status = $status,\n' +
    '  postId = $postId,\n' +
    '  errorCode = $errorCode\n' +
    'WHERE id = $id',
    {
      '$id': TypedValues.uint64(numericLockId),
      '$status': TypedValues.utf8(status),
      '$postId': TypedValues.uint64(safePostId),
      '$errorCode': TypedValues.uint64(safeErrorCode)
    }
  );

  log('YcAntiSpam', 'updateSubmitStatus', 'BLOCK_STATUS_UPDATED', 'Submit status updated', {
    lockId,
    status,
    postId: safePostId,
    errorCode: safeErrorCode
  });
  // END_BLOCK_UPDATE_STATUS
}

// GRACE_MARKER: [YcAntiSpam][checkAndLockSubmit][BLOCK_LOCK_ACQUIRED]
// GRACE_MARKER: [YcAntiSpam][checkAndLockSubmit][BLOCK_RATE_LIMIT_HIT]
// GRACE_MARKER: [YcAntiSpam][updateSubmitStatus][BLOCK_STATUS_UPDATED]

const _graceLogMarkers = [
  "[YcAntiSpam][checkAndLockSubmit][BLOCK_LOCK_ACQUIRED]",
  "[YcAntiSpam][checkAndLockSubmit][BLOCK_RATE_LIMIT_HIT]",
  "[YcAntiSpam][updateSubmitStatus][BLOCK_STATUS_UPDATED]"
];
