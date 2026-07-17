// FILE: yc/__tests__/submit.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/http/submit.ts submit handler.
//   SCOPE: Validate happy path (2 images), S3 image upload failure (cleanup & abort), VK code 15, anti-spam 429, missing fields (community, text, token), security logs scan, single community invariant, and trace assertions.
//   DEPENDS: M-YC-SUBMIT
//   LINKS: V-M-YC-SUBMIT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Fix s3Key test fixtures to use uploads/{numericHash}/ prefix required by path-traversal validation]
//   PREVIOUS_CHANGES:
//     - [v1.0.0 - Initial implementation of submit action orchestration tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitHandler } from '../http/submit';
import * as s3 from '../storage/s3';
import * as vkClient from '../vkapi/client';
import * as antiSpam from '../antiSpam';
import * as resolver from '../communityResolver';
import * as logger from '../logger';

vi.mock('../storage/s3', () => ({
  getObject: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('../vkapi/client', () => ({
  getWallUploadServer: vi.fn(),
  saveWallPhoto: vi.fn(),
  wallPostSuggest: vi.fn(),
  VkApiError: class extends Error {
    vkCode: number;
    constructor(msg: string, code: number) {
      super(msg);
      this.vkCode = code;
      this.name = 'VkApiError';
    }
  }
}));

vi.mock('../antiSpam', () => ({
  checkAndLockSubmit: vi.fn(),
  updateSubmitStatus: vi.fn(),
  RateLimitedError: class extends Error {
    code = 'RATE_LIMITED';
  }
}));

vi.mock('../communityResolver', () => ({
  resolveCommunityId: vi.fn(),
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('M-YC-SUBMIT - YcSubmitAction', () => {
  let mockS3Store = new Map<string, Buffer>();
  let logBuffer: string[] = [];

  const FAKE_VK_TOKEN = 'mock-vk-token-12345';
  const FAKE_JWT = 'bearer-jwt-98765';
  const JWT_SECRET = 'my_test_jwt_secret';

  beforeEach(() => {
    mockS3Store = new Map();
    logBuffer = [];
    vi.clearAllMocks();

    process.env.JWT_SECRET = JWT_SECRET;

    // Spy on logger and capture trace
    vi.spyOn(logger, 'log').mockImplementation((module, fn, block, message, data) => {
      const logString = `[${module}][${fn}][${block}] ${message} ${data ? JSON.stringify(data) : ''}`;
      logBuffer.push(logString);
      // Fallback console log for test debugging if needed (disabled by default)
    });

    // Mock S3 store behavior
    vi.mocked(s3.getObject).mockImplementation(async (key) => {
      if (!mockS3Store.has(key)) {
        throw new Error('S3 Object Not Found');
      }
      return mockS3Store.get(key)!;
    });

    vi.mocked(s3.deleteObject).mockImplementation(async (key) => {
      mockS3Store.delete(key);
    });

    // Mock community resolution
    vi.mocked(resolver.resolveCommunityId).mockResolvedValue(222);

    // Stub global fetch for mock VK uploads
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (url === 'https://upload.vk.ru/server1') {
        return {
          ok: true,
          json: async () => ({ server: 1, photo: '[{"id":1}]', hash: 'hash1' })
        };
      }
      if (url === 'https://upload.vk.ru/server2') {
        return {
          ok: true,
          json: async () => ({ server: 2, photo: '[{"id":2}]', hash: 'hash2' })
        };
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-YSUB1: Full happy path with 2 images → posts to VK, deletes from S3, returns success', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN, authorization: `Bearer ${FAKE_JWT}` },
      body: {
        communityId: 'my_group',
        text: 'Post with 2 images',
        images: [
          { s3Key: 'uploads/111/image1.jpg', name: 'image1.jpg', type: 'image/jpeg' },
          { s3Key: 'uploads/111/image2.png', name: 'image2.png', type: 'image/png' }
        ]
      }
    } as any;
    const res = mockRes();

    // Setup S3 temp store
    mockS3Store.set('uploads/111/image1.jpg', Buffer.from('img1bytes'));
    mockS3Store.set('uploads/111/image2.png', Buffer.from('img2bytes'));

    vi.mocked(antiSpam.checkAndLockSubmit).mockResolvedValueOnce('lock_123456');
    vi.mocked(vkClient.getWallUploadServer)
      .mockResolvedValueOnce({ uploadUrl: 'https://upload.vk.ru/server1' })
      .mockResolvedValueOnce({ uploadUrl: 'https://upload.vk.ru/server2' });

    vi.mocked(vkClient.saveWallPhoto)
      .mockResolvedValueOnce({ ownerId: 100, mediaId: 501 })
      .mockResolvedValueOnce({ ownerId: 100, mediaId: 502 });

    vi.mocked(vkClient.wallPostSuggest).mockResolvedValueOnce({ postId: 77777 });

    await submitHandler(req, res);

    expect(antiSpam.checkAndLockSubmit).toHaveBeenCalledWith(111, 222);
    expect(vkClient.wallPostSuggest).toHaveBeenCalledWith(FAKE_VK_TOKEN, {
      ownerId: -222,
      message: 'Post with 2 images',
      attachments: 'photo100_501,photo100_502'
    });

    expect(antiSpam.updateSubmitStatus).toHaveBeenCalledWith('lock_123456', 'ok', 77777);
    expect(res.json).toHaveBeenCalledWith({ success: true, postId: 77777 });

    // Assert S3 cleanups
    expect(mockS3Store.size).toBe(0);

    // Verify trace logs order
    const logs = logBuffer.join('\n');
    expect(logs).toContain('Starting submit orchestration');
    expect(logs).toContain('[YcSubmit][submitHandler][BLOCK_SUGGEST_POST]');
  });

  it('scenario-YSUB2: 2nd image upload fails → aborts, status="failed", deletes all from S3, 502', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN },
      body: {
        communityId: 222,
        text: 'Post with upload failure',
        images: [
          { s3Key: 'uploads/111/image1.jpg', name: 'image1.jpg' },
          { s3Key: 'uploads/111/image2.png', name: 'image2.png' }
        ]
      }
    } as any;
    const res = mockRes();

    mockS3Store.set('uploads/111/image1.jpg', Buffer.from('img1bytes'));
    mockS3Store.set('uploads/111/image2.png', Buffer.from('img2bytes'));

    vi.mocked(antiSpam.checkAndLockSubmit).mockResolvedValueOnce('lock_123456');
    vi.mocked(vkClient.getWallUploadServer).mockResolvedValueOnce({ uploadUrl: 'https://upload.vk.ru/server1' });
    vi.mocked(vkClient.saveWallPhoto).mockResolvedValueOnce({ ownerId: 100, mediaId: 501 });

    // Force global fetch to fail on 2nd upload
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url === 'https://upload.vk.ru/server1') {
        return { ok: true, json: async () => ({ server: 1, photo: '[{"id":1}]', hash: 'hash1' }) };
      }
      return { ok: false, status: 500 }; // Fail the 2nd upload
    }));

    await submitHandler(req, res);

    expect(vkClient.wallPostSuggest).not.toHaveBeenCalled();
    expect(antiSpam.updateSubmitStatus).toHaveBeenCalledWith('lock_123456', 'failed');
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'UPLOAD_FAILED' })
    }));

    // S3 cleanup assertion
    expect(mockS3Store.size).toBe(0);
  });

  it('scenario-YSUB3: VK code 15 (closed community) → status="rejected", 409 response', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN },
      body: {
        communityId: 222,
        text: 'Rejected post',
      }
    } as any;
    const res = mockRes();

    vi.mocked(antiSpam.checkAndLockSubmit).mockResolvedValueOnce('lock_123456');
    vi.mocked(vkClient.wallPostSuggest).mockRejectedValueOnce(
      new vkClient.VkApiError('Access denied: no access to call this method', 15)
    );

    await submitHandler(req, res);

    expect(antiSpam.updateSubmitStatus).toHaveBeenCalledWith('lock_123456', 'rejected', undefined, 15);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'REJECTED', errorCode: 15, message: 'Access denied: no access to call this method' }
    });
  });

  it('scenario-YSUB4: Anti-spam 429 → rate limited response, no VK API calls, no S3 calls', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN },
      body: {
        communityId: 222,
        text: 'Rate limited post',
        images: [{ s3Key: 'img_key' }]
      }
    } as any;
    const res = mockRes();

    vi.mocked(antiSpam.checkAndLockSubmit).mockRejectedValueOnce(new antiSpam.RateLimitedError());

    await submitHandler(req, res);

    expect(antiSpam.checkAndLockSubmit).toHaveBeenCalled();
    expect(s3.getObject).not.toHaveBeenCalled();
    expect(vkClient.getWallUploadServer).not.toHaveBeenCalled();
    expect(vkClient.wallPostSuggest).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'RATE_LIMITED' } });
  });

  it('scenario-YSUB5: Missing communityId → 400 response', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN },
      body: { text: 'No community' }
    } as any;
    const res = mockRes();

    await submitHandler(req, res);

    expect(antiSpam.checkAndLockSubmit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'MISSING_COMMUNITY' } });
  });

  it('scenario-YSUB6: Missing text → 400 response', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN },
      body: { communityId: 222 }
    } as any;
    const res = mockRes();

    await submitHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'MISSING_TEXT' } });
  });

  it('scenario-YSUB7: Missing X-VK-Token header → 400 response', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: {}, // No x-vk-token
      body: { communityId: 222, text: 'Hello' }
    } as any;
    const res = mockRes();

    await submitHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'MISSING_VK_TOKEN' } });
  });

  it('scenario-YSUB8: Security scan → no VK tokens or secrets in logs', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN },
      body: { communityId: 222, text: 'Hello security test' }
    } as any;
    const res = mockRes();

    vi.mocked(antiSpam.checkAndLockSubmit).mockResolvedValueOnce('lock_111');
    vi.mocked(vkClient.wallPostSuggest).mockResolvedValueOnce({ postId: 123 });

    await submitHandler(req, res);

    // Verify logs
    const allLogs = logBuffer.join('\n');
    expect(allLogs).not.toContain(FAKE_VK_TOKEN);
    expect(allLogs).not.toContain(FAKE_JWT);
    expect(allLogs).not.toContain(JWT_SECRET);
  });

  it('scenario-YSUB9: Temp S3 cleanup → mockS3Store size is 0 after successful submit', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN },
      body: {
        communityId: 222,
        text: 'Cleanup test',
        images: [{ s3Key: 'uploads/111/image.jpg', name: 'image.jpg' }]
      }
    } as any;
    const res = mockRes();

    mockS3Store.set('uploads/111/image.jpg', Buffer.from('bytes'));

    vi.mocked(antiSpam.checkAndLockSubmit).mockResolvedValueOnce('lock_123');
    vi.mocked(vkClient.getWallUploadServer).mockResolvedValueOnce({ uploadUrl: 'https://upload.vk.ru/server1' });
    vi.mocked(vkClient.saveWallPhoto).mockResolvedValueOnce({ ownerId: 100, mediaId: 501 });
    vi.mocked(vkClient.wallPostSuggest).mockResolvedValueOnce({ postId: 12345 });

    await submitHandler(req, res);

    expect(mockS3Store.size).toBe(0);
  });

  it('scenario-YSUB10: Single community invariant → multiple communityIds array throws 400', async () => {
    const req = {
      user: { numericHash: 111 },
      headers: { 'x-vk-token': FAKE_VK_TOKEN },
      body: {
        communityId: [222, 333], // Array is forbidden
        text: 'Multi-post attempt',
      }
    } as any;
    const res = mockRes();

    await submitHandler(req, res);

    expect(antiSpam.checkAndLockSubmit).not.toHaveBeenCalled();
    expect(vkClient.wallPostSuggest).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'MISSING_COMMUNITY' } });
  });
});
