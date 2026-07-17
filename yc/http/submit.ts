// FILE: yc/http/submit.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Express POST /submit route handler orchestrating anti-spam, resolution, image uploading, and VK posting.
//   SCOPE: submitHandler
//   DEPENDS: M-YC-AUTH-CTX, M-YC-VK-API, M-YC-OBJECT-STORAGE, M-YC-DB, M-YC-LOGGER, M-YC-COMMUNITY-RESOLVER, M-YC-ANTI-SPAM
//   LINKS: M-YC-SUBMIT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   submitHandler - Express POST /submit handler
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Sanitize error message in UPLOAD_FAILED response to prevent internal detail leakage]
// END_CHANGE_SUMMARY

import { Request, Response } from 'express';
import { checkAndLockSubmit, updateSubmitStatus } from '../antiSpam';
import { resolveCommunityId } from '../communityResolver';
import { getObject, deleteObject } from '../storage/s3';
import { getWallUploadServer, saveWallPhoto, wallPostSuggest, VkApiError } from '../vkapi/client';
import { log } from '../logger';

// START_CONTRACT: submitHandler
//   PURPOSE: Express POST /submit handler orchestrating VK post suggestions.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Interacts with YDB, S3, VK API, and sends response.
//   LINKS: M-YC-SUBMIT
// END_CONTRACT: submitHandler
export async function submitHandler(req: Request, res: Response): Promise<void> {
  // START_BLOCK_SUBMIT_ORCHESTRATE
  log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Starting submit orchestration', {});

  // 1. Authenticate user numericHash
  const numericHash = req.user?.numericHash;
  if (numericHash === undefined) {
    log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Unauthorized access', {});
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  // 2. Validate VK token header
  const vkToken = req.headers['x-vk-token'] as string;
  if (!vkToken || typeof vkToken !== 'string') {
    log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Missing X-VK-Token header', {});
    res.status(400).json({ error: { code: 'MISSING_VK_TOKEN' } });
    return;
  }

  const { communityId, text, images } = req.body || {};

  // Validate single community (array not allowed)
  if (communityId === undefined || communityId === null) {
    log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Missing communityId', {});
    res.status(400).json({ error: { code: 'MISSING_COMMUNITY' } });
    return;
  }
  if (Array.isArray(communityId)) {
    log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Multiple communityIds (not allowed)', { communityId });
    res.status(400).json({ error: { code: 'MISSING_COMMUNITY' } });
    return;
  }

  if (!text || typeof text !== 'string' || text.trim() === '') {
    log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Missing text', {});
    res.status(400).json({ error: { code: 'MISSING_TEXT' } });
    return;
  }

  // 3. Resolve community ID (either screenName or numeric ID)
  let numericCommunityId: number;
  if (typeof communityId === 'string') {
    if (/^\d+$/.test(communityId)) {
      numericCommunityId = Number(communityId);
    } else {
      try {
        numericCommunityId = await resolveCommunityId(communityId, vkToken);
      } catch (err: any) {
        log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Failed to resolve community screen name', { communityId, error: err.message });
        res.status(400).json({ error: { code: 'MISSING_COMMUNITY', message: 'Could not resolve community' } });
        return;
      }
    }
  } else if (typeof communityId === 'number') {
    numericCommunityId = communityId;
  } else {
    res.status(400).json({ error: { code: 'MISSING_COMMUNITY' } });
    return;
  }

  // 4. Acquire anti-spam lock BEFORE any S3 or VK API calls
  let lockId: string;
  try {
    lockId = await checkAndLockSubmit(numericHash, numericCommunityId);
  } catch (err: any) {
    if (err.code === 'RATE_LIMITED') {
      res.status(429).json({ error: { code: 'RATE_LIMITED' } });
      return;
    }
    log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Database lock acquisition failed', { error: err.message });
    res.status(502).json({ error: { code: 'UPLOAD_FAILED', message: err.message } });
    return;
  }

  const uploadedMediaAttachments: string[] = [];
  const imagesList = Array.isArray(images) ? images : [];

  try {
    // 5. Loop through images
    for (const image of imagesList) {
      const { s3Key, name, type } = image;
      if (!s3Key) continue;

      // SEC: Validate s3Key belongs to the authenticated user (path-traversal prevention)
      const expectedPrefix = `uploads/${numericHash}/`;
      if (typeof s3Key !== 'string' || !s3Key.startsWith(expectedPrefix)) {
        log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Rejected s3Key: invalid prefix', { s3Key, expectedPrefix });
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid s3Key: access denied' } });
        return;
      }

      // 5a. Get object from S3
      log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Fetching image from temp storage', { s3Key });
      const imageBuffer = await getObject(s3Key);

      // 5b. Get upload server
      log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Requesting VK upload server', { numericCommunityId });
      const { uploadUrl } = await getWallUploadServer(vkToken, { communityId: numericCommunityId });

      // 5c. Post to VK upload server
      log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Uploading to VK server', { uploadUrl });
      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: type || 'image/jpeg' });
      formData.append('photo', blob, name || 'image.jpg');

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`VK_UPLOAD_FAILED: HTTP status ${uploadRes.status}`);
      }

      const uploadData = await uploadRes.json();
      if (!uploadData || !uploadData.photo || uploadData.photo === '[]') {
        throw new Error('VK_UPLOAD_FAILED: Empty photo returned from VK upload server');
      }

      // 5d. Save wall photo
      log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Saving photo in VK', {});
      const savedPhoto = await saveWallPhoto(vkToken, {
        communityId: numericCommunityId,
        server: uploadData.server,
        photo: uploadData.photo,
        hash: uploadData.hash,
      });

      uploadedMediaAttachments.push(`photo${savedPhoto.ownerId}_${savedPhoto.mediaId}`);

      // 5e. Delete from S3
      log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Deleting temp image from S3', { s3Key });
      await deleteObject(s3Key);
    }

    // 6. Submit suggested post
    const attachmentsString = uploadedMediaAttachments.join(',');
    log('YcSubmit', 'submitHandler', 'BLOCK_SUGGEST_POST', 'Posting suggested wall post', {
      communityId: numericCommunityId,
      attachments: attachmentsString
    });

    const postResult = await wallPostSuggest(vkToken, {
      ownerId: -numericCommunityId,
      message: text,
      attachments: attachmentsString
    });

    // 7. Update lock status to 'ok'
    await updateSubmitStatus(lockId, 'ok', postResult.postId);

    log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Submit orchestration completed successfully', {
      postId: postResult.postId
    });

    res.json({ success: true, postId: postResult.postId });
  } catch (err: any) {
    log('YcSubmit', 'submitHandler', 'BLOCK_SUBMIT_ORCHESTRATE', 'Submit orchestration failed, initiating abort/cleanup', {
      error: err.message,
      vkCode: err.vkCode
    });

    // 8. Cleanup ALL input images from S3 to prevent leaks
    for (const image of imagesList) {
      if (image.s3Key) {
        try {
          await deleteObject(image.s3Key);
        } catch (cleanupErr: any) {
          // Ignore deletion error (e.g. if already deleted)
        }
      }
    }

    // 9. Update submit log status and return response
    if (err instanceof VkApiError) {
      // VK rejection code (15, 2701, etc.)
      await updateSubmitStatus(lockId, 'rejected', undefined, err.vkCode);
      res.status(409).json({
        error: { code: 'REJECTED', errorCode: err.vkCode, message: err.message }
      });
    } else {
      // General upload/save/submit error
      await updateSubmitStatus(lockId, 'failed');
      res.status(502).json({
        error: { code: 'UPLOAD_FAILED', message: 'Upload processing failed' }
      });
    }
  }
  // END_BLOCK_SUBMIT_ORCHESTRATE
}

// GRACE_MARKER: [YcSubmit][submitHandler][BLOCK_SUBMIT_ORCHESTRATE]
// GRACE_MARKER: [YcVkApi][wallPostSuggest][BLOCK_SUGGEST_POST]

const _graceLogMarkers = [
  "[YcSubmit][submitHandler][BLOCK_SUBMIT_ORCHESTRATE]",
  "[YcVkApi][wallPostSuggest][BLOCK_SUGGEST_POST]"
];
