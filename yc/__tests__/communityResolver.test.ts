// FILE: yc/__tests__/communityResolver.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/communityResolver.ts screen name resolution and avatar caching.
//   SCOPE: Validate cache hits, cache misses, partial hits, staleness (30 days), community not found errors, and logging.
//   DEPENDS: M-YC-COMMUNITY-RESOLVER
//   LINKS: V-M-YC-COMMUNITY-RESOLVER
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of community resolver unit tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveCommunityId, resolveHandler, avatarsHandler } from '../communityResolver';
import * as db from '../db/index';
import * as vkClient from '../vkapi/client';
import * as logger from '../logger';
import { clearConfigCache } from '../config';

vi.mock('../db/index', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

vi.mock('../vkapi/client', () => ({
  resolveScreenName: vi.fn(),
  groupsGetById: vi.fn()
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('M-YC-COMMUNITY-RESOLVER - YcCommunityResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'log').mockImplementation(() => {});
    clearConfigCache();

    // Populate env variables for getConfig
    delete process.env.LOCKBOX_SECRET_ID;
    process.env.VK_APP_ID = '54669660';
    process.env.VK_ID_SALT = 'test_salt';
    process.env.JWT_SECRET = 'test_jwt_secret';
    process.env.VK_OAUTH_REDIRECT_URL = 'http://localhost';
    process.env.VK_SERVICE_TOKEN = 'mock-service-token';
    process.env.VK_CLIENT_SECRET = 'test_client_secret';
    process.env.VK_API_VERSION = '5.131';
    process.env.CLIENT_ORIGIN = 'http://localhost';
    process.env.YDB_ENDPOINT = 'ydb_endpoint';
    process.env.YDB_DATABASE = 'ydb_db';
    process.env.S3_ACCESS_KEY_ID = 's3_key';
    process.env.S3_SECRET_ACCESS_KEY = 's3_secret';
    process.env.S3_BUCKET_STATIC = 'static';
    process.env.S3_BUCKET_TEMP = 'temp';
  });

  it('scenario-YCR1: resolveCommunityId cache hit → returns numericId from YDB. No VK API call', async () => {
    // Mock DB cache hit within 30 days
    vi.mocked(db.query).mockResolvedValueOnce([
      { screenName: 'my_group', numericId: 123456, resolvedAt: Date.now() - 1000 }
    ]);

    const result = await resolveCommunityId('my_group', 'token-123');

    expect(result).toBe(123456);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(vkClient.resolveScreenName).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'YcCommunityResolver',
      'resolveCommunityId',
      'BLOCK_RESOLVE_CACHE_HIT',
      expect.stringContaining('Cache hit'),
      expect.any(Object)
    );
  });

  it('scenario-YCR2: resolveCommunityId cache miss → VK utils.resolveScreenName → cache in YDB → return numericId', async () => {
    // Mock DB cache miss (empty array)
    vi.mocked(db.query).mockResolvedValueOnce([]);
    // Mock VK resolve call
    vi.mocked(vkClient.resolveScreenName).mockResolvedValueOnce({
      objectId: 789012,
      type: 'group'
    });
    vi.mocked(db.execute).mockResolvedValueOnce(undefined);

    const result = await resolveCommunityId('new_group', 'token-123');

    expect(result).toBe(789012);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(vkClient.resolveScreenName).toHaveBeenCalledWith('token-123', 'new_group');
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(
      'YcCommunityResolver',
      'resolveCommunityId',
      'BLOCK_RESOLVE_CACHE_MISS',
      expect.stringContaining('Cache miss')
    );
  });

  it('scenario-YCR2 (stale cache): resolveCommunityId stale resolvedAt → VK resolveScreenName → cache in YDB → return numericId', async () => {
    // Mock DB cache hit stale (35 days ago)
    const thirtyFiveDaysAgo = Date.now() - 35 * 24 * 60 * 60 * 1000;
    vi.mocked(db.query).mockResolvedValueOnce([
      { screenName: 'my_group', numericId: 123456, resolvedAt: thirtyFiveDaysAgo }
    ]);
    vi.mocked(vkClient.resolveScreenName).mockResolvedValueOnce({
      objectId: 123456,
      type: 'group'
    });
    vi.mocked(db.execute).mockResolvedValueOnce(undefined);

    const result = await resolveCommunityId('my_group', 'token-123');

    expect(result).toBe(123456);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(vkClient.resolveScreenName).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('scenario-YCR3: getAvatars batch fetch — cache hit for some, miss for others → partial VK call, all returned', async () => {
    const req = {
      body: { screenNames: ['group_cached', 'group_miss'] }
    } as any;
    const res = mockRes();

    // 1st cache check for 'group_cached' (hit)
    vi.mocked(db.query).mockResolvedValueOnce([
      { screenName: 'group_cached', numericId: 100, avatarUrl: 'http://cached-url', resolvedAt: Date.now() }
    ]);
    // 2nd cache check for 'group_miss' (miss)
    vi.mocked(db.query).mockResolvedValueOnce([]);

    // Mock VK groups.getById for the missed group
    vi.mocked(vkClient.groupsGetById).mockResolvedValueOnce([
      { id: 200, screen_name: 'group_miss', photo_100: 'http://miss-url' }
    ]);
    vi.mocked(db.execute).mockResolvedValueOnce(undefined);

    await avatarsHandler(req, res);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(vkClient.groupsGetById).toHaveBeenCalledWith(['group_miss']);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      group_cached: 'http://cached-url',
      group_miss: 'http://miss-url'
    });
    expect(logger.log).toHaveBeenCalledWith(
      'YcCommunityResolver',
      'avatarsHandler',
      'BLOCK_AVATAR_CACHE_HIT',
      expect.stringContaining('Cache hit'),
      expect.any(Object)
    );
  });

  it('scenario-YCR4: Community not found → 404 COMMUNITY_NOT_FOUND', async () => {
    const req = {
      body: { screenName: 'invalid_name' }
    } as any;
    const res = mockRes();

    // Mock DB cache miss
    vi.mocked(db.query).mockResolvedValueOnce([]);
    // Mock VK returning no object
    vi.mocked(vkClient.resolveScreenName).mockResolvedValueOnce({
      objectId: 0,
      type: 'unknown'
    });

    await resolveHandler(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(vkClient.resolveScreenName).toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'COMMUNITY_NOT_FOUND' });
  });

  it('should return 400 validation error on resolveHandler with empty screenName', async () => {
    const req = {
      body: { screenName: '' }
    } as any;
    const res = mockRes();

    await resolveHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
  });

  it('should return 400 validation error on avatarsHandler with invalid body', async () => {
    const req = {
      body: { screenNames: 'not-an-array' }
    } as any;
    const res = mockRes();

    await avatarsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
  });
});
