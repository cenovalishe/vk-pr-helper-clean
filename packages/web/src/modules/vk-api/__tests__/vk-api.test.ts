// FILE: packages/web/src/modules/vk-api/__tests__/vk-api.test.ts
// VERSION: 4.0.0
// START_MODULE_CONTRACT
//   PURPOSE: VK API REST integration unit tests.
//   SCOPE: Verifies suggestPost and uploadPhotos REST flow, mocking global fetch.
//   DEPENDS: M-VK-API
//   LINKS: M-VK-API, V-M-VK-API
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Unit tests for suggestPost and uploadPhotos REST API integration
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v4.0.0 - Phase-YC-6: Update VK integration tests to verify REST API and S3 uploads]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { suggestPost } from '../suggest-post';
import { createLogger } from '@/shared/logger';

// Mock the logger properly
vi.mock('@/shared/logger', () => {
  const info = vi.fn();
  const error = vi.fn();
  const debug = vi.fn();
  const warn = vi.fn();
  return {
    createLogger: vi.fn(() => ({ info, error, debug, warn })),
  };
});

// Mock fetch globally
global.fetch = vi.fn();

describe('M-VK-API REST Integration', () => {
  const mockLogger = createLogger('VkApi');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // V-1: Text-only suggest post
  it('V-1: Text-only suggest post: /submit called with communityId, text, empty images', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, postId: 12345 }),
    });

    const result = await suggestPost(
      { communityId: 100, text: 'Hello VK!' },
      'vk_token_123',
      'jwt_token_456'
    );

    expect(result.success).toBe(true);
    expect(result.postId).toBe(12345);

    // Verify fetch call
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as Mock).mock.calls[0];
    expect(url).toContain('/submit');
    expect(options.method).toBe('POST');
    expect(options.headers.get('Authorization')).toBe('Bearer jwt_token_456');
    expect(options.headers.get('x-vk-token')).toBe('vk_token_123');

    const body = JSON.parse(options.body);
    expect(body.communityId).toBe(100);
    expect(body.text).toBe('Hello VK!');
    expect(body.images).toEqual([]);

    // Verify log marker
    expect(mockLogger.info).toHaveBeenCalledWith(
      'suggestPost',
      'BLOCK_SUGGEST_POST',
      expect.any(String),
      expect.any(Object)
    );
  });

  // V-2: Post with images
  it('V-2: Post with images: upload flow completes for each image -> /submit includes S3 keys', async () => {
    // 1. presign
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ presignedUrl: 'https://s3.yandex.ru/put-url-1', s3Key: 'key-1' }),
    });

    // 2. PUT to Object Storage
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    // 3. /submit call
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, postId: 12346 }),
    });

    const fakeFile = new File(['abc'], 'test.jpg', { type: 'image/jpeg' });
    const result = await suggestPost(
      { communityId: 100, text: 'With image', images: [fakeFile] },
      'vk_token_123',
      'jwt_token_456'
    );

    expect(result.success).toBe(true);
    expect(result.postId).toBe(12346);
    expect(global.fetch).toHaveBeenCalledTimes(3);

    // 1st: presign
    const [presignUrl, presignOpt] = (global.fetch as Mock).mock.calls[0];
    expect(presignUrl).toContain('/vkUpload/presign');
    expect(JSON.parse(presignOpt.body)).toEqual({ contentType: 'image/jpeg' });

    // 2nd: PUT to S3
    const [s3Url, s3Opt] = (global.fetch as Mock).mock.calls[1];
    expect(s3Url).toBe('https://s3.yandex.ru/put-url-1');
    expect(s3Opt.method).toBe('PUT');
    expect(s3Opt.body).toBe(fakeFile);

    // 3rd: /submit
    const [submitUrl, submitOpt] = (global.fetch as Mock).mock.calls[2];
    expect(submitUrl).toContain('/submit');
    const submitBody = JSON.parse(submitOpt.body);
    expect(submitBody.images).toEqual([
      { s3Key: 'key-1', name: 'test.jpg', type: 'image/jpeg' }
    ]);

    // Verify log markers
    expect(mockLogger.info).toHaveBeenCalledWith(
      'uploadPhotos',
      'BLOCK_IMAGE_UPLOAD',
      expect.any(String),
      expect.any(Object)
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'suggestPost',
      'BLOCK_SUGGEST_POST',
      expect.any(String),
      expect.any(Object)
    );
  });

  // V-3: VK API rejection error via backend
  it('V-3: VK API rejection via /submit: returns success: false and maps error', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: { code: 'REJECTED', errorCode: 15, message: 'Access denied' }
      }),
    });

    const result = await suggestPost(
      { communityId: 100, text: 'Error test' },
      'vk_token_123',
      'jwt_token_456'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VK_API_ERROR');
    expect(result.error?.message).toBe('Access denied');
    expect(result.error?.vkErrorCode).toBe(15);
  });

  // V-4: No auth tokens -> returns UNAUTHORIZED
  it('V-4: No auth tokens -> returns UNAUTHORIZED, does not fetch', async () => {
    const result1 = await suggestPost({ communityId: 100, text: 'No vk token' }, '', 'jwt_token_456');
    expect(result1.success).toBe(false);
    expect(result1.error?.code).toBe('UNAUTHORIZED');

    const result2 = await suggestPost({ communityId: 100, text: 'No jwt' }, 'vk_token_123', '');
    expect(result2.success).toBe(false);
    expect(result2.error?.code).toBe('UNAUTHORIZED');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  // V-5: Upload to Object Storage fails
  it('V-5: Upload fails: aborts submit flow and propagates error', async () => {
    // 1. presign success
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ presignedUrl: 'https://s3.yandex.ru/put-url-1', s3Key: 'key-1' }),
    });

    // 2. PUT fails
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const fakeFile = new File(['abc'], 'test.jpg', { type: 'image/jpeg' });
    const result = await suggestPost(
      { communityId: 100, text: 'Partial', images: [fakeFile] },
      'vk_token_123',
      'jwt_token_456'
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UPLOAD_FAILED');

    // /submit must NOT be called since PUT failed
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
