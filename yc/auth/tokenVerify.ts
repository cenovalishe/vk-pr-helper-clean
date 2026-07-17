// FILE: yc/auth/tokenVerify.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verifies a VK user access_token by introspecting it via VK ID user_info (OIDC) first and falling back to VK API users.get.
//   SCOPE: verifyAccessToken function, VerifiedToken type, InvalidTokenError class.
//   DEPENDS: M-YC-LOGGER, M-YC-CONFIG
//   LINKS: M-YC-TOKEN-VERIFY
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   verifyAccessToken - (accessToken: string) => Promise<VerifiedToken>; throws InvalidTokenError on bad token, VK_API_ERROR on VK failure
//   VerifiedToken - Type representing user ID payload { vkUserId: number }
//   InvalidTokenError - Error subclass thrown when token is invalid or expired
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial port of TokenVerify module to YC Functions]
// END_CHANGE_SUMMARY

import { getConfig } from '../config';
import { log } from '../logger';

export type VerifiedToken = {
  vkUserId: number;
};

export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

// START_CONTRACT: decodeJwtPayload
//   PURPOSE: Decode JWT body without cryptographic validation (preflight inspection).
//   INPUTS: { token: string }
//   OUTPUTS: { any - Parsed JSON payload or null }
//   SIDE_EFFECTS: none
//   LINKS: none
// END_CONTRACT: decodeJwtPayload
function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

// START_CONTRACT: verifyViaUserInfo
//   PURPOSE: Verify VK ID access token via OAuth OIDC user_info endpoint.
//   INPUTS: { accessToken: string }
//   OUTPUTS: { Promise<VerifiedToken> }
//   SIDE_EFFECTS: Outbound HTTP post to id.vk.ru.
//   LINKS: none
// END_CONTRACT: verifyViaUserInfo
async function verifyViaUserInfo(accessToken: string): Promise<VerifiedToken> {
  const config = await getConfig();
  const vkAppIdStr = config.vkAppId;
  if (!vkAppIdStr) {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Missing VK_APP_ID in config', {});
    throw new InvalidTokenError('MISSING_CONFIG: VK_APP_ID');
  }

  const vkAppId = parseInt(vkAppIdStr, 10);
  if (isNaN(vkAppId)) {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'VK_APP_ID is not a number', { vkAppIdStr });
    throw new InvalidTokenError('INVALID_CONFIG: VK_APP_ID');
  }

  const params = new URLSearchParams();
  params.append('client_id', String(vkAppId));
  if (config.vkClientSecret) {
    params.append('client_secret', config.vkClientSecret);
  } else {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Warning: VK_CLIENT_SECRET config is missing', {});
  }
  params.append('access_token', accessToken);

  log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Verifying VK ID access token via user_info', {});

  let res: Response;
  try {
    res = await fetch(`https://id.vk.ru/oauth2/user_info?client_id=${vkAppId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  } catch (err: any) {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Network error verifying VK ID token', { error: err.message });
    throw new Error(`TOKEN_VERIFY_NETWORK_ERROR: ${err.message}`);
  }

  if (!res.ok) {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Non-OK HTTP from VK ID', { status: res.status });
    throw new Error(`VK_API_ERROR: HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;

  if (data.error) {
    const errDescription = data.error_description || data.error;
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'VK ID returned error', { error: errDescription });
    throw new InvalidTokenError(`INVALID_TOKEN: ${errDescription}`);
  }

  const vkUserId = data.user?.user_id || data.user_id;
  if (vkUserId === undefined || vkUserId === null) {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Malformed VK ID user_info response', { data });
    throw new InvalidTokenError('INVALID_TOKEN: no user_id returned');
  }

  const numericUserId = typeof vkUserId === 'number' ? vkUserId : parseInt(vkUserId, 10);
  if (isNaN(numericUserId)) {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Malformed non-numeric VK ID user_info response', { data });
    throw new InvalidTokenError('INVALID_TOKEN: non-numeric user_id returned');
  }

  log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'VK ID Token verified', { vkUserId: numericUserId });
  return { vkUserId: numericUserId };
}

// START_CONTRACT: verifyViaUsersGet
//   PURPOSE: Verify legacy access token via api.vk.ru users.get query.
//   INPUTS: { accessToken: string }
//   OUTPUTS: { Promise<VerifiedToken> }
//   SIDE_EFFECTS: Outbound HTTP post to api.vk.ru.
//   LINKS: none
// END_CONTRACT: verifyViaUsersGet
async function verifyViaUsersGet(accessToken: string): Promise<VerifiedToken> {
  const config = await getConfig();
  const apiVersion = config.vkApiVersion || '5.131';

  const params = new URLSearchParams();
  params.append('access_token', accessToken);
  params.append('v', apiVersion);
  params.append('fields', 'id');

  log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Verifying access token via users.get', {});

  let res: Response;
  try {
    res = await fetch(`https://api.vk.ru/method/users.get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
  } catch (err: any) {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Network error verifying token', { error: err.message });
    throw new Error(`TOKEN_VERIFY_NETWORK_ERROR: ${err.message}`);
  }

  if (!res.ok) {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Non-OK HTTP from VK', { status: res.status });
    throw new Error(`VK_API_ERROR: HTTP ${res.status}`);
  }

  const data = (await res.json()) as any;

  if (data.error) {
    const errCode = data.error.error_code;
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'VK returned error', { errorCode: errCode });
    // code 5 = invalid access token; code 27 = group token needed (not a user token)
    if (errCode === 5 || errCode === 27) {
      throw new InvalidTokenError(`INVALID_TOKEN: code ${errCode}`);
    }
    throw new Error(`VK_API_ERROR: code ${errCode}`);
  }

  const responseArr = data.response;
  if (!Array.isArray(responseArr) || responseArr.length === 0 || typeof responseArr[0].id !== 'number') {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Empty or malformed users.get response', {});
    throw new InvalidTokenError('INVALID_TOKEN: no user returned');
  }

  const vkUserId = responseArr[0].id;
  log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Token verified', { vkUserId });
  return { vkUserId };
}

// START_CONTRACT: verifyAccessToken
//   PURPOSE: Verifies a VK user access_token (either OIDC JWT or legacy opaque string).
//   INPUTS: { accessToken: string }
//   OUTPUTS: { Promise<VerifiedToken> - { vkUserId: number } }
//   SIDE_EFFECTS: Outbound HTTP fetches to VK servers.
//   LINKS: M-YC-TOKEN-VERIFY
// END_CONTRACT: verifyAccessToken
export async function verifyAccessToken(accessToken: string): Promise<VerifiedToken> {
  // START_BLOCK_TOKEN_VERIFY
  if (!accessToken || typeof accessToken !== 'string') {
    throw new InvalidTokenError('MISSING_TOKEN');
  }

  // If it starts with eyJ, it's definitely a JWT (VK ID OIDC ID token)
  if (accessToken.startsWith('eyJ')) {
    return verifyViaUserInfo(accessToken);
  }

  const config = await getConfig();
  const hasAppId = !!config.vkAppId;

  // For other tokens, we first try verifying via user_info (OIDC access token) if App ID is configured
  if (hasAppId) {
    try {
      log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'Trying to verify token via oauth2/user_info first', {});
      return await verifyViaUserInfo(accessToken);
    } catch (err) {
      if (err instanceof InvalidTokenError && err.message.includes('INVALID_TOKEN')) {
        // If user_info explicitly rejected the token as invalid, we fall back to users.get
        log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'user_info rejected token, falling back to users.get', { error: err.message });
      } else {
        // If it was a network/config error, propagate it
        throw err;
      }
    }
  } else {
    log('TokenVerify', 'verifyAccessToken', 'BLOCK_TOKEN_VERIFY', 'VK_APP_ID not configured, skipping user_info and using users.get', {});
  }

  // Fallback to legacy users.get verification
  return verifyViaUsersGet(accessToken);
  // END_BLOCK_TOKEN_VERIFY
}

// GRACE_MARKER: [YcTokenVerify][verifyAccessToken][BLOCK_TOKEN_VERIFY]

const _graceLogMarkers = [
  "[YcTokenVerify][verifyAccessToken][BLOCK_TOKEN_VERIFY]"
];
