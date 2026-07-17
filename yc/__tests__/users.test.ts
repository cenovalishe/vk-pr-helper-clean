// FILE: yc/__tests__/users.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/users.ts YcUserStore.
//   SCOPE: Validate getOrCreateUser lookup, creation insert, and YDB query mock integration.
//   DEPENDS: M-YC-USER-STORE
//   LINKS: V-M-YC-USER-STORE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of YcUserStore tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrCreateUser } from '../users';
import { query, execute } from '../db/index';

vi.mock('../db/index', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

describe('M-YC-USER-STORE - UserStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return existing userId if user is found in database', async () => {
    vi.mocked(query).mockResolvedValueOnce([{ hashedVkId: 'test-hashed-vk-id' }]);

    const userId = await getOrCreateUser('test-hashed-vk-id');

    expect(userId).toBe('test-hashed-vk-id');
    expect(query).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('should insert and return userId if user is not found in database', async () => {
    vi.mocked(query).mockResolvedValueOnce([]);
    vi.mocked(execute).mockResolvedValueOnce(undefined);

    const userId = await getOrCreateUser('test-hashed-vk-id');

    expect(userId).toBe('test-hashed-vk-id');
    expect(query).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
