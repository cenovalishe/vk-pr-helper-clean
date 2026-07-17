// FILE: yc/__tests__/s3.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/storage/s3.ts S3 storage client.
//   SCOPE: Validate presigned URL generation, reading object body as Buffer, object deletion, and error mapping.
//   DEPENDS: M-YC-OBJECT-STORAGE
//   LINKS: V-M-YC-OBJECT-STORAGE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of S3 storage tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPresignedPut, getObject, deleteObject, clearS3Cache } from '../storage/s3';

const { mockSend, mockGetSignedUrl } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockGetSignedUrl: vi.fn().mockResolvedValue('https://mocked-presigned-url.com/temp-bucket/my-image.jpg')
}));

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class {
      send = mockSend;
    },
    PutObjectCommand: class {
      constructor(public params: any) {}
    },
    GetObjectCommand: class {
      constructor(public params: any) {}
    },
    DeleteObjectCommand: class {
      constructor(public params: any) {}
    }
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    getSignedUrl: mockGetSignedUrl
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  clearS3Cache();
  
  // Set all 14 config fields required by getConfig()
  process.env.VK_APP_ID = '54669660';
  process.env.VK_ID_SALT = 'test_salt';
  process.env.JWT_SECRET = 'test_jwt_secret';
  process.env.VK_OAUTH_REDIRECT_URL = 'http://localhost';
  process.env.VK_SERVICE_TOKEN = 'test_service_token';
  process.env.VK_CLIENT_SECRET = 'test_client_secret';
  process.env.VK_API_VERSION = '5.131';
  process.env.CLIENT_ORIGIN = 'http://localhost';
  process.env.YDB_ENDPOINT = 'ydb_endpoint';
  process.env.YDB_DATABASE = 'ydb_db';
  process.env.S3_ACCESS_KEY_ID = 's3_key';
  process.env.S3_SECRET_ACCESS_KEY = 's3_secret';
  process.env.S3_BUCKET_STATIC = 'static';
  process.env.S3_BUCKET_TEMP = 'temp-bucket';
});

describe('M-YC-OBJECT-STORAGE - Yandex Object Storage client', () => {
  it('should successfully generate a presigned PUT URL for image upload', async () => {
    const res = await createPresignedPut('my-image.jpg', 'image/jpeg');
    
    expect(res.url).toBe('https://mocked-presigned-url.com/temp-bucket/my-image.jpg');
    expect(res.s3Key).toBe('my-image.jpg');
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('should wrap presign failures in PRESIGN_FAILED error', async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error('presign failure'));
    
    await expect(createPresignedPut('my-image.jpg', 'image/jpeg')).rejects.toThrow('PRESIGN_FAILED');
  });

  it('should retrieve object from storage and parse body to Buffer', async () => {
    mockSend.mockResolvedValueOnce({
      Body: {
        transformToByteArray: async () => new Uint8Array([12, 34, 56, 78])
      }
    });

    const buffer = await getObject('my-image.jpg');
    expect(buffer).toEqual(Buffer.from([12, 34, 56, 78]));
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should throw S3_ERROR on object retrieve failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('Access denied'));
    
    await expect(getObject('my-image.jpg')).rejects.toThrow('S3_ERROR');
  });

  it('should delete object from storage successfully', async () => {
    mockSend.mockResolvedValueOnce({});
    
    await deleteObject('my-image.jpg');
    
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should throw S3_ERROR on delete failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('Object not found'));
    
    await expect(deleteObject('my-image.jpg')).rejects.toThrow('S3_ERROR');
  });
});
