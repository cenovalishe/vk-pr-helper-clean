// FILE: yc/storage/s3.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: S3 client for Yandex Object Storage handling temp image uploads, reads, and cleanups.
//   SCOPE: presigned PUT URL generation, getObject as Buffer, and deleteObject.
//   DEPENDS: M-YC-CONFIG
//   LINKS: M-YC-OBJECT-STORAGE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   createPresignedPut - (s3Key, contentType) => Promise<{ url, s3Key }>; 5 min TTL presigned URL
//   getObject - (s3Key) => Promise<Buffer>; reads object from temp bucket
//   deleteObject - (s3Key) => Promise<void>; deletes temp object after VK upload
//   clearS3Cache - Clears the cached S3Client instance (testing helper)
//   getS3Client - Lazily initializes and returns the S3 client instance
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of Yandex Object Storage client wrapper]
// END_CHANGE_SUMMARY

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getConfig } from '../config';

let s3Client: S3Client | null = null;
let tempBucketName = '';

// START_CONTRACT: clearS3Cache
//   PURPOSE: Clear cached S3Client instance (used by tests).
//   INPUTS: none
//   OUTPUTS: void
//   SIDE_EFFECTS: Mutates module-level variables.
//   LINKS: none
// END_CONTRACT: clearS3Cache
export function clearS3Cache(): void {
  s3Client = null;
  tempBucketName = '';
}

// START_CONTRACT: getS3Client
//   PURPOSE: Lazily initialize and return the Yandex Object Storage S3 client and temp bucket name.
//   INPUTS: none
//   OUTPUTS: Promise<{ s3Client: S3Client, tempBucketName: string }>
//   SIDE_EFFECTS: Reads configuration from M-YC-CONFIG.
//   LINKS: none
// END_CONTRACT: getS3Client
export async function getS3Client(): Promise<{ s3Client: S3Client; tempBucketName: string }> {
  if (s3Client) {
    return { s3Client, tempBucketName };
  }

  const config = await getConfig();
  tempBucketName = config.s3BucketTemp;

  s3Client = new S3Client({
    region: 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey
    }
  });

  return { s3Client, tempBucketName };
}

// START_CONTRACT: createPresignedPut
//   PURPOSE: (s3Key, contentType) => Promise<{ url, s3Key }>; 5 min TTL presigned URL
//   INPUTS: { s3Key: string, contentType: string }
//   OUTPUTS: Promise<{ url: string, s3Key: string }>
//   SIDE_EFFECTS: Generates a presigned URL.
//   LINKS: none
// END_CONTRACT: createPresignedPut
export async function createPresignedPut(s3Key: string, contentType: string): Promise<{ url: string; s3Key: string }> {
  // START_BLOCK_S3_PRESIGN
  try {
    const { s3Client: client, tempBucketName: bucket } = await getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: contentType
    });
    // Presign URL with 300 seconds (5 minutes) TTL
    const url = await getSignedUrl(client, command, { expiresIn: 300 });
    return { url, s3Key };
  } catch (e: any) {
    const err = new Error('PRESIGN_FAILED');
    (err as any).code = 'PRESIGN_FAILED';
    (err as any).originalError = e;
    throw err;
  }
  // END_BLOCK_S3_PRESIGN
}

// START_CONTRACT: getObject
//   PURPOSE: (s3Key) => Promise<Buffer>; reads object from temp bucket
//   INPUTS: { s3Key: string }
//   OUTPUTS: Promise<Buffer>
//   SIDE_EFFECTS: Reads object from S3.
//   LINKS: none
// END_CONTRACT: getObject
export async function getObject(s3Key: string): Promise<Buffer> {
  // START_BLOCK_S3_GET
  try {
    const { s3Client: client, tempBucketName: bucket } = await getS3Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key
    });
    const response = await client.send(command);
    if (!response.Body) {
      throw new Error('Empty response body');
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (e: any) {
    const err = new Error('S3_ERROR');
    (err as any).code = 'S3_ERROR';
    (err as any).originalError = e;
    throw err;
  }
  // END_BLOCK_S3_GET
}

// START_CONTRACT: deleteObject
//   PURPOSE: (s3Key) => Promise<void>; deletes temp object after VK upload
//   INPUTS: { s3Key: string }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Deletes object from S3.
//   LINKS: none
// END_CONTRACT: deleteObject
export async function deleteObject(s3Key: string): Promise<void> {
  // START_BLOCK_S3_DELETE
  try {
    const { s3Client: client, tempBucketName: bucket } = await getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key
    });
    await client.send(command);
  } catch (e: any) {
    const err = new Error('S3_ERROR');
    (err as any).code = 'S3_ERROR';
    (err as any).originalError = e;
    throw err;
  }
  // END_BLOCK_S3_DELETE
}

// GRACE_MARKER: [YcStorage][BLOCK_S3_PRESIGN]
// GRACE_MARKER: [YcStorage][BLOCK_S3_DELETE]

const _graceLogMarkers = [
  "[YcStorage][BLOCK_S3_PRESIGN]",
  "[YcStorage][BLOCK_S3_DELETE]"
];
