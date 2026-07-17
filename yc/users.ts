// FILE: yc/users.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: YDB access layer for users table, storing only hashedVkId for FZ-152 compliance.
//   SCOPE: user lookup and creation.
//   DEPENDS: M-YC-DB
//   LINKS: M-YC-USER-STORE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   getOrCreateUser - (hashedVkId: string) => Promise<string>; YDB query/insert to get or create a user row
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Wrap hashedVkId in TypedValues.utf8 to fix YDB parameter validation error]
// END_CHANGE_SUMMARY

import { TypedValues } from 'ydb-sdk';
import { query, execute } from './db/index';
import { log } from './logger';

// START_CONTRACT: getOrCreateUser
//   PURPOSE: Retrieve user by hashedVkId or create a new user row if not found.
//   INPUTS: { hashedVkId: string }
//   OUTPUTS: Promise<string> - The user's ID (which is their hashedVkId)
//   SIDE_EFFECTS: Inserts a new row into the users table if not found.
//   LINKS: M-YC-USER-STORE
// END_CONTRACT: getOrCreateUser
export async function getOrCreateUser(hashedVkId: string): Promise<string> {
  // START_BLOCK_USER_GET_OR_CREATE
  log('UserStore', 'getOrCreateUser', 'BLOCK_USER_GET_OR_CREATE', 'Resolving user', {
    hashedVkId
  });

  const rows = await query(
    'DECLARE $hashedVkId AS Utf8; SELECT hashedVkId FROM users WHERE hashedVkId = $hashedVkId',
    { '$hashedVkId': TypedValues.utf8(hashedVkId) }
  );

  if (rows && rows.length > 0) {
    log('UserStore', 'getOrCreateUser', 'BLOCK_USER_GET_OR_CREATE', 'Found existing user', {
      userId: hashedVkId
    });
    return hashedVkId;
  }

  await execute(
    'DECLARE $hashedVkId AS Utf8; INSERT INTO users (hashedVkId) VALUES ($hashedVkId)',
    { '$hashedVkId': TypedValues.utf8(hashedVkId) }
  );

  log('UserStore', 'getOrCreateUser', 'BLOCK_USER_GET_OR_CREATE', 'Created new user', {
    userId: hashedVkId
  });

  return hashedVkId;
  // END_BLOCK_USER_GET_OR_CREATE
}

const _graceLogMarkers = [
  "[YcUserStore][BLOCK_USER_GET_OR_CREATE]"
];
