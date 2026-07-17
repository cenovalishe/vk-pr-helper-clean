// FILE: yc/__tests__/vkApi.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/vkapi/client.ts server-side VK API client.
//   SCOPE: Validate wallPostSuggest, getWallUploadServer, saveWallPhoto, resolveScreenName, groupsGetById, rate-limit retry logic, backoff, and access token redaction.
//   DEPENDS: M-YC-VK-API
//   LINKS: V-M-YC-VK-API
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of VK API client unit tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callVk, wallPostSuggest, getWallUploadServer, saveWallPhoto, resolveScreenName, groupsGetById, VkApiError } from '../vkapi/client';
import * as logger from '../logger';
import { clearConfigCache } from '../config';

describe('M-YC-VK-API - YcVkApiClient', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'log').mockImplementation(() => {});
    clearConfigCache();

    // Populate env variables for getConfig
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

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-YVK1: wallPostSuggest calls api.vk.ru/method/wall.post with suggest=1, returns { postId }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { post_id: 12345 } })
    });

    const result = await wallPostSuggest('valid-token', {
      ownerId: -100,
      message: 'Test message',
      attachments: 'photo100_200'
    });

    expect(result).toEqual({ postId: 12345 });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://api.vk.ru/method/wall.post');
    expect(calledInit.method).toBe('POST');
    
    const params = new URLSearchParams(calledInit.body);
    expect(params.get('owner_id')).toBe('-100');
    expect(params.get('message')).toBe('Test message');
    expect(params.get('attachments')).toBe('photo100_200');
    expect(params.get('suggest')).toBe('1');
    expect(params.get('access_token')).toBe('valid-token');
    
    expect(logger.log).toHaveBeenCalledWith(
      'YcVkApi',
      'wallPostSuggest',
      'BLOCK_SUGGEST_POST',
      'Posting suggested wall post',
      { ownerId: -100 }
    );
  });

  it('scenario-YVK2: getWallUploadServer returns { uploadUrl }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { upload_url: 'https://upload.vk.ru/server' } })
    });

    const result = await getWallUploadServer('valid-token', { communityId: 999 });

    expect(result).toEqual({ uploadUrl: 'https://upload.vk.ru/server' });
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://api.vk.ru/method/photos.getWallUploadServer');
    
    const params = new URLSearchParams(calledInit.body);
    expect(params.get('group_id')).toBe('999');
  });

  it('scenario-YVK3: saveWallPhoto returns { ownerId, mediaId }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: [{ owner_id: 111, id: 222 }] })
    });

    const result = await saveWallPhoto('valid-token', {
      communityId: 999,
      server: 123,
      photo: 'photo-data',
      hash: 'hash-data'
    });

    expect(result).toEqual({ ownerId: 111, mediaId: 222 });
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://api.vk.ru/method/photos.saveWallPhoto');
    
    const params = new URLSearchParams(calledInit.body);
    expect(params.get('group_id')).toBe('999');
    expect(params.get('server')).toBe('123');
    expect(params.get('photo')).toBe('photo-data');
    expect(params.get('hash')).toBe('hash-data');
  });

  it('scenario-YVK4: resolveScreenName returns { objectId, type }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { object_id: 777, type: 'group' } })
    });

    const result = await resolveScreenName('valid-token', 'community_name');

    expect(result).toEqual({ objectId: 777, type: 'group' });
  });

  it('scenario-YVK5: groupsGetById uses VK_SERVICE_TOKEN, returns group data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: [{ id: 888, name: 'VK Group' }] })
    });

    const result = await groupsGetById(['888', '999']);

    expect(result).toEqual([{ id: 888, name: 'VK Group' }]);
    
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    const params = new URLSearchParams(calledInit.body);
    expect(params.get('access_token')).toBe('mock-service-token');
    expect(params.get('group_ids')).toBe('888,999');
    expect(params.get('fields')).toBe('photo_50,photo_100,photo_200');
  });

  it('scenario-YVK6: VK error code 6 (rate limit) → 1 retry with 500ms backoff. Second failure → throw VK_API_ERROR', async () => {
    vi.useFakeTimers();

    // First call returns rate limit error
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { error_code: 6, error_msg: 'Too many requests' } })
    });
    // Second call returns rate limit error too
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { error_code: 6, error_msg: 'Too many requests' } })
    });

    const promise = callVk('valid-token', 'wall.post', {});
    const expectPromise = expect(promise).rejects.toThrow('VK_API_ERROR: Too many requests');
    
    // Fast-forward timers to run the retry
    await vi.runAllTimersAsync();

    await expectPromise;
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('scenario-YVK6 (success on retry): VK error code 6 (rate limit) → 1 retry with 500ms backoff and success', async () => {
    vi.useFakeTimers();

    // First call returns rate limit error
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { error_code: 6, error_msg: 'Too many requests' } })
    });
    // Second call returns success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { post_id: 123 } })
    });

    const promise = callVk('valid-token', 'wall.post', {});
    
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toEqual({ post_id: 123 });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('scenario-YVK7: vkAccessToken never in logs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: { post_id: 123 } })
    });

    await callVk('super-secret-access-token', 'wall.post', {});

    // Collect all arguments passed to log
    const logCalls = vi.mocked(logger.log).mock.calls;
    for (const call of logCalls) {
      const dataStr = JSON.stringify(call);
      expect(dataStr).not.toContain('super-secret-access-token');
    }
  });
});
