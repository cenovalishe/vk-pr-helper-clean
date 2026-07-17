// FILE: yc/__tests__/vkUpload.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/http/vkUpload.ts Express image presign endpoint.
//   SCOPE: Validate presigned URL generation (success), unauthorized error, presign failures, and logging.
//   DEPENDS: M-YC-IMAGE-PROXY
//   LINKS: V-M-YC-IMAGE-PROXY
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of vkUpload.test.ts unit tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { presignHandler } from '../http/vkUpload';
import * as s3 from '../storage/s3';
import * as logger from '../logger';

vi.mock('../storage/s3', () => ({
  createPresignedPut: vi.fn(),
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('M-YC-IMAGE-PROXY - YcImageProxyApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-YIP1: POST /vkUpload/presign with valid JWT → returns { presignedUrl, s3Key }', async () => {
    const req = {
      user: { numericHash: 12345 },
      body: { contentType: 'image/jpeg' }
    } as any;
    const res = mockRes();

    vi.mocked(s3.createPresignedPut).mockResolvedValueOnce({
      url: 'https://storage.yandexcloud.net/temp/uploads/12345/presigned-url',
      s3Key: 'uploads/12345/image.jpg'
    });

    await presignHandler(req, res);

    expect(s3.createPresignedPut).toHaveBeenCalledTimes(1);
    expect(s3.createPresignedPut).toHaveBeenCalledWith(
      expect.stringContaining('uploads/12345/'),
      'image/jpeg'
    );

    expect(res.json).toHaveBeenCalledWith({
      presignedUrl: 'https://storage.yandexcloud.net/temp/uploads/12345/presigned-url',
      s3Key: expect.stringContaining('uploads/12345/')
    });

    expect(logger.log).toHaveBeenCalledWith(
      'YcImageProxy',
      'presignHandler',
      'BLOCK_PROXY_PRESIGN',
      'Generating presigned PUT URL',
      expect.objectContaining({ numericHash: 12345, contentType: 'image/jpeg' })
    );
  });

  it('scenario-YIP2: No Authorization header (unauthorized) → 401 UNAUTHORIZED', async () => {
    const req = {
      body: { contentType: 'image/png' }
    } as any; // req.user is undefined
    const res = mockRes();

    await presignHandler(req, res);

    expect(s3.createPresignedPut).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'UNAUTHORIZED' });

    expect(logger.log).toHaveBeenCalledWith(
      'YcImageProxy',
      'presignHandler',
      'BLOCK_PROXY_PRESIGN',
      'Unauthorized access attempt',
      {}
    );
  });

  it('scenario-YIP3: Presign fails (S3 error) → 500 PRESIGN_FAILED', async () => {
    const req = {
      user: { numericHash: 12345 },
      body: { contentType: 'image/gif' }
    } as any;
    const res = mockRes();

    vi.mocked(s3.createPresignedPut).mockRejectedValueOnce(new Error('S3 connection error'));

    await presignHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'PRESIGN_FAILED',
      message: 'S3 connection error'
    });

    expect(logger.log).toHaveBeenCalledWith(
      'YcImageProxy',
      'presignHandler',
      'BLOCK_PROXY_PRESIGN',
      'Failed to generate presigned URL',
      { error: 'S3 connection error' }
    );
  });
});
