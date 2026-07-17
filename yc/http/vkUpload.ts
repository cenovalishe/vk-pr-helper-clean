// FILE: yc/http/vkUpload.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Express routes handler for image upload proxy, returning presigned PUT URLs.
//   SCOPE: presignHandler
//   DEPENDS: M-YC-AUTH-CTX, M-YC-OBJECT-STORAGE, M-YC-LOGGER
//   LINKS: M-YC-IMAGE-PROXY
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   presignHandler - Express POST /vkUpload/presign handler
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - SECURITY: Added content-type whitelist validation for presigned URLs]
// END_CHANGE_SUMMARY

import { Request, Response } from 'express';
import { createPresignedPut } from '../storage/s3';
import { log } from '../logger';

// START_CONTRACT: presignHandler
//   PURPOSE: Express POST /vkUpload/presign handler returning presigned PUT URL and s3Key.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Generates presigned URL, returns JSON response.
//   LINKS: M-YC-IMAGE-PROXY
// END_CONTRACT: presignHandler
export async function presignHandler(req: Request, res: Response): Promise<void> {
  // START_BLOCK_PROXY_PRESIGN
  const numericHash = req.user?.numericHash;
  if (numericHash === undefined) {
    log('YcImageProxy', 'presignHandler', 'BLOCK_PROXY_PRESIGN', 'Unauthorized access attempt', {});
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const { contentType } = req.body || {};
  if (!contentType || typeof contentType !== 'string') {
    log('YcImageProxy', 'presignHandler', 'BLOCK_PROXY_PRESIGN', 'Missing contentType in request body', {});
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'contentType is required' });
    return;
  }

  // SEC: Only allow known image MIME types
  const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    log('YcImageProxy', 'presignHandler', 'BLOCK_PROXY_PRESIGN', 'Rejected invalid contentType', { contentType });
    res.status(400).json({ error: 'INVALID_CONTENT_TYPE', message: `Allowed types: ${ALLOWED_CONTENT_TYPES.join(', ')}` });
    return;
  }

  try {
    const s3Key = `uploads/${numericHash}/${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    log('YcImageProxy', 'presignHandler', 'BLOCK_PROXY_PRESIGN', 'Generating presigned PUT URL', {
      numericHash,
      contentType,
      s3Key
    });

    const { url } = await createPresignedPut(s3Key, contentType);
    res.json({ presignedUrl: url, s3Key });
  } catch (e: any) {
    log('YcImageProxy', 'presignHandler', 'BLOCK_PROXY_PRESIGN', 'Failed to generate presigned URL', {
      error: e.message
    });
    res.status(500).json({ error: 'PRESIGN_FAILED', message: e.message });
  }
  // END_BLOCK_PROXY_PRESIGN
}

// GRACE_MARKER: [YcImageProxy][presignHandler][BLOCK_PROXY_PRESIGN]

const _graceLogMarkers = [
  "[YcImageProxy][presignHandler][BLOCK_PROXY_PRESIGN]"
];
