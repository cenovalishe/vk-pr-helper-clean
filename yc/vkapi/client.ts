// FILE: yc/vkapi/client.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Server-side VK API client using fetch in YC Function: wall.post, photos.getWallUploadServer, photos.saveWallPhoto, utils.resolveScreenName, groups.getById. Single retry with backoff on rate limit (code 6/9).
//   SCOPE: callVk, wallPostSuggest, getWallUploadServer, saveWallPhoto, groupsGetById, resolveScreenName Express handlers.
//   DEPENDS: M-YC-CONFIG, M-YC-LOGGER
//   LINKS: M-YC-VK-API
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   callVk - (accessToken, method, params) => Promise<any>; single retry on code 6/9, backoff 500ms
//   wallPostSuggest - (accessToken, { ownerId, message, attachments }) => Promise<{ postId }>
//   getWallUploadServer - (accessToken, { communityId }) => Promise<{ uploadUrl }>
//   saveWallPhoto - (accessToken, { communityId, server, photo, hash }) => Promise<{ ownerId, mediaId }>
//   groupsGetById - (groupIds) => Promise<any>
//   resolveScreenName - (vkAccessToken, screenName) => Promise<{ objectId, type }>
//   VkPostPayload - Post payload type
//   VkApiResponse - type
//   VkApiError - type
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of Yandex Cloud VK API client with rate-limit retry]
// END_CHANGE_SUMMARY

import { getConfig } from '../config';
import { log } from '../logger';

export type VkApiResponse = any;

export type VkPostPayload = {
  ownerId: number;
  message: string;
  attachments?: string;
};

export class VkApiError extends Error {
  public vkCode: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'VkApiError';
    this.vkCode = code;
  }
}

// START_CONTRACT: callVk
//   PURPOSE: Executes a parameterized outbound call to VK API (api.vk.ru) with single rate-limit retry.
//   INPUTS: { accessToken: string, method: string, params: Record<string, any> }
//   OUTPUTS: Promise<VkApiResponse>
//   SIDE_EFFECTS: Outbound fetch requests to VK API, logging.
//   LINKS: M-YC-VK-API
// END_CONTRACT: callVk
export async function callVk(accessToken: string, method: string, params: Record<string, any>): Promise<VkApiResponse> {
  // START_BLOCK_VK_API_CALL
  const config = await getConfig();
  
  const searchParams = new URLSearchParams();
  searchParams.append('access_token', accessToken);
  searchParams.append('v', config.vkApiVersion);
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.append(key, String(value));
    }
  }

  const url = `https://api.vk.ru/method/${method}`;
  
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      log('YcVkApi', 'callVk', 'BLOCK_VK_API_CALL', `Calling VK API ${method}`, { attempt });
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: searchParams.toString(),
      });

      if (!res.ok) {
        throw new Error(`HTTP error: ${res.status}`);
      }

      const data = await res.json();

      if (data.error) {
        const errCode = data.error.error_code;
        if ((errCode === 6 || errCode === 9) && attempt < maxAttempts) {
          log('YcVkApi', 'callVk', 'BLOCK_VK_API_CALL', `Rate limit hit, retrying`, { method, attempt });
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        // Sanitize VK error: strip request_params (contains access_token in {key,value} array form)
        const safeError: Record<string, unknown> = {
          error_code: data.error.error_code,
          error_msg: data.error.error_msg,
        };
        if (data.error.captcha_sid) safeError.captcha_sid = data.error.captcha_sid;
        if (data.error.captcha_img) safeError.captcha_img = data.error.captcha_img;

        log('YcVkApi', 'callVk', 'BLOCK_VK_API_CALL', `VK API Error`, { method, error: safeError });
        throw new VkApiError(`VK_API_ERROR: ${data.error.error_msg}`, errCode);
      }

      log('YcVkApi', 'callVk', 'BLOCK_VK_API_CALL', `VK API Success`, { method });
      return data.response;
      
    } catch (err: any) {
      if (err instanceof VkApiError) {
        throw err;
      }
      if (attempt >= maxAttempts) {
        log('YcVkApi', 'callVk', 'BLOCK_VK_API_CALL', `VK API Request Failed permanently`, { method, error: err.message });
        throw err;
      }
    }
  }
  // END_BLOCK_VK_API_CALL
}

// START_CONTRACT: wallPostSuggest
//   PURPOSE: Submits a suggested post to VK community wall.
//   INPUTS: { accessToken: string, payload: VkPostPayload }
//   OUTPUTS: Promise<{ postId: number }>
//   SIDE_EFFECTS: VK API call, logging.
//   LINKS: M-YC-VK-API
// END_CONTRACT: wallPostSuggest
export async function wallPostSuggest(accessToken: string, payload: VkPostPayload): Promise<{ postId: number }> {
  // START_BLOCK_SUGGEST_POST
  log('YcVkApi', 'wallPostSuggest', 'BLOCK_SUGGEST_POST', 'Posting suggested wall post', { ownerId: payload.ownerId });
  const res = await callVk(accessToken, 'wall.post', {
    owner_id: payload.ownerId,
    message: payload.message,
    attachments: payload.attachments,
    suggest: 1,
  });

  return { postId: res.post_id };
  // END_BLOCK_SUGGEST_POST
}

// START_CONTRACT: getWallUploadServer
//   PURPOSE: Retrieves upload URL for wall photos.
//   INPUTS: { accessToken: string, params: { communityId: number } }
//   OUTPUTS: Promise<{ uploadUrl: string }>
//   SIDE_EFFECTS: VK API call, logging.
//   LINKS: M-YC-VK-API
// END_CONTRACT: getWallUploadServer
export async function getWallUploadServer(accessToken: string, params: { communityId: number }): Promise<{ uploadUrl: string }> {
  // START_BLOCK_IMAGE_UPLOAD
  log('YcVkApi', 'getWallUploadServer', 'BLOCK_IMAGE_UPLOAD', 'Fetching wall upload server', { communityId: params.communityId });
  const res = await callVk(accessToken, 'photos.getWallUploadServer', {
    group_id: params.communityId,
  });

  return { uploadUrl: res.upload_url };
  // END_BLOCK_IMAGE_UPLOAD
}

// START_CONTRACT: saveWallPhoto
//   PURPOSE: Saves uploaded wall photo.
//   INPUTS: { accessToken: string, params: { communityId: number, server: number, photo: string, hash: string } }
//   OUTPUTS: Promise<{ ownerId: number, mediaId: number }>
//   SIDE_EFFECTS: VK API call, logging.
//   LINKS: M-YC-VK-API
// END_CONTRACT: saveWallPhoto
export async function saveWallPhoto(accessToken: string, params: { communityId: number, server: number, photo: string, hash: string }): Promise<{ ownerId: number, mediaId: number }> {
  // START_BLOCK_IMAGE_UPLOAD_SAVE
  log('YcVkApi', 'saveWallPhoto', 'BLOCK_IMAGE_UPLOAD_SAVE', 'Saving wall photo', { communityId: params.communityId });
  const res = await callVk(accessToken, 'photos.saveWallPhoto', {
    group_id: params.communityId,
    server: params.server,
    photo: params.photo,
    hash: params.hash,
  });

  const photoObj = res[0];
  return { ownerId: photoObj.owner_id, mediaId: photoObj.id };
  // END_BLOCK_IMAGE_UPLOAD_SAVE
}

// START_CONTRACT: resolveScreenName
//   PURPOSE: Resolves community/user screen name to numeric object ID and type.
//   INPUTS: { vkAccessToken: string, screenName: string }
//   OUTPUTS: Promise<{ objectId: number, type: string }>
//   SIDE_EFFECTS: VK API call, logging.
//   LINKS: M-YC-VK-API
// END_CONTRACT: resolveScreenName
export async function resolveScreenName(vkAccessToken: string, screenName: string): Promise<{ objectId: number; type: string }> {
  // START_BLOCK_VK_API_CALL_RESOLVE
  log('YcVkApi', 'resolveScreenName', 'BLOCK_VK_API_CALL_RESOLVE', 'Resolving screen name', { screenName });
  const res = await callVk(vkAccessToken, 'utils.resolveScreenName', {
    screen_name: screenName,
  });

  if (!res || Array.isArray(res)) {
    return { objectId: 0, type: 'unknown' };
  }

  return {
    objectId: res.object_id,
    type: res.type,
  };
  // END_BLOCK_VK_API_CALL_RESOLVE
}

// START_CONTRACT: groupsGetById
//   PURPOSE: Batch fetches details of communities using service token.
//   INPUTS: { groupIds: string[] }
//   OUTPUTS: Promise<any>
//   SIDE_EFFECTS: VK API call, logging.
//   LINKS: M-YC-VK-API
// END_CONTRACT: groupsGetById
export async function groupsGetById(groupIds: string[]): Promise<any> {
  // START_BLOCK_VK_API_CALL_GROUPS
  log('YcVkApi', 'groupsGetById', 'BLOCK_VK_API_CALL_GROUPS', 'Fetching groups by id', { count: groupIds.length });
  const config = await getConfig();
  const res = await callVk(config.vkServiceToken, 'groups.getById', {
    group_ids: groupIds.join(','),
    fields: 'photo_50,photo_100,photo_200',
  });
  return res;
  // END_BLOCK_VK_API_CALL_GROUPS
}

// GRACE_MARKER: [YcVkApi][callVk][BLOCK_VK_API_CALL]
// GRACE_MARKER: [YcVkApi][wallPostSuggest][BLOCK_SUGGEST_POST]
// GRACE_MARKER: [YcVkApi][getWallUploadServer][BLOCK_IMAGE_UPLOAD]
// GRACE_MARKER: [YcVkApi][saveWallPhoto][BLOCK_IMAGE_UPLOAD_SAVE]
// GRACE_MARKER: [YcVkApi][resolveScreenName][BLOCK_VK_API_CALL_RESOLVE]
// GRACE_MARKER: [YcVkApi][groupsGetById][BLOCK_VK_API_CALL_GROUPS]

const _graceLogMarkers = [
  "[YcVkApi][callVk][BLOCK_VK_API_CALL]",
  "[YcVkApi][wallPostSuggest][BLOCK_SUGGEST_POST]",
  "[YcVkApi][getWallUploadServer][BLOCK_IMAGE_UPLOAD]",
  "[YcVkApi][saveWallPhoto][BLOCK_IMAGE_UPLOAD_SAVE]",
  "[YcVkApi][resolveScreenName][BLOCK_VK_API_CALL_RESOLVE]",
  "[YcVkApi][groupsGetById][BLOCK_VK_API_CALL_GROUPS]"
];
