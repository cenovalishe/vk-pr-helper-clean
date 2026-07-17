// FILE: yc/auth/service.ts
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Authentication service verifying VK tokens, hashing IDs, upserting users, and issuing JWT session tokens.
//   SCOPE: Express login handler, VK ID hashing, JWT sign/verify helpers, backend VK ID code exchange and refresh handlers.
//   DEPENDS: M-YC-TOKEN-VERIFY, M-YC-USER-STORE, M-YC-LOGGER, M-YC-CONFIG
//   LINKS: M-YC-AUTH-SERVICE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   loginHandler - Express POST /auth/login handler: { accessToken } => { sessionToken }
//   exchangeHandler - Express POST /auth/exchange handler: { code, device_id, code_verifier } => VkIdTokenSet
//   refreshHandler - Express POST /auth/refresh handler: { refresh_token, device_id } => VkIdTokenSet
//   hashVkId - (vkUserId: number, salt: string) => string (hex HMAC-SHA256)
//   getNumericHashFromHex - (hex: string) => number (first 48 bits as int)
//   signJwt - (payload, secret) => string (HS256 JWT)
//   verifyJwt - (token, secret) => payload | throw
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.2.0 - Add scope logging to exchangeHandler for easier debugging of token permissions]
//   PREVIOUS_CHANGES:
//     - [v1.1.0 - Add backend code exchange (exchangeHandler) and token refresh (refreshHandler) to run OAuth calls from server IP]
// END_CHANGE_SUMMARY

import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';
import { log } from '../logger';
import { verifyAccessToken } from './tokenVerify';
import { getOrCreateUser } from '../users';

// START_CONTRACT: hashVkId
//   PURPOSE: Computes HMAC-SHA-256 hash of vkUserId for FZ-152 compliance.
//   INPUTS: { vkUserId: number, salt: string }
//   OUTPUTS: string (hex HMAC-SHA256)
//   SIDE_EFFECTS: none
//   LINKS: none
// END_CONTRACT: hashVkId
export function hashVkId(vkUserId: number, salt: string): string {
  const hmac = crypto.createHmac('sha256', salt);
  hmac.update(String(vkUserId));
  return hmac.digest('hex');
}

// START_CONTRACT: getNumericHashFromHex
//   PURPOSE: Extracts first 12 hex chars into an integer (48 bits).
//   INPUTS: { hex: string }
//   OUTPUTS: number
//   SIDE_EFFECTS: none
//   LINKS: none
// END_CONTRACT: getNumericHashFromHex
export function getNumericHashFromHex(hex: string): number {
  return parseInt(hex.substring(0, 12), 16);
}

// START_CONTRACT: signJwt
//   PURPOSE: Sign a payload using HS256 and a secret.
//   INPUTS: { payload: any, secret: string }
//   OUTPUTS: string (JWT token)
//   SIDE_EFFECTS: none
//   LINKS: none
// END_CONTRACT: signJwt
export function signJwt(payload: any, secret: string): string {
  return jwt.sign(payload, secret);
}

// START_CONTRACT: verifyJwt
//   PURPOSE: Verify and decode an HS256 JWT using a secret.
//   INPUTS: { token: string, secret: string }
//   OUTPUTS: any (parsed payload)
//   SIDE_EFFECTS: none
//   LINKS: none
// END_CONTRACT: verifyJwt
export function verifyJwt(token: string, secret: string): any {
  // jsonwebtoken verifies exp (seconds since epoch) natively and throws jwt.TokenExpiredError
  return jwt.verify(token, secret) as any;
}

// START_CONTRACT: loginHandler
//   PURPOSE: Express POST /auth/login handler: { accessToken } => { sessionToken }.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Logs to console, returns HTTP response.
//   LINKS: M-YC-AUTH-SERVICE
// END_CONTRACT: loginHandler
export async function loginHandler(req: Request, res: Response): Promise<void> {
  // START_BLOCK_ENV_ERROR
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      log('YcAuthService', 'loginHandler', 'BLOCK_ENV_ERROR', 'Missing accessToken in request body', {});
      res.status(400).json({ error: 'MISSING_TOKEN' });
      return;
    }

    const config = await getConfig();
    const salt = config.vkIdSalt;
    if (!salt) {
      log('YcAuthService', 'loginHandler', 'BLOCK_ENV_ERROR', 'Missing VK_ID_SALT in config', {});
      res.status(500).json({ error: 'INTERNAL_ERROR' });
      return;
    }

    const jwtSecret = config.jwtSecret;
    if (!jwtSecret) {
      log('YcAuthService', 'loginHandler', 'BLOCK_ENV_ERROR', 'Missing JWT_SECRET in config', {});
      res.status(500).json({ error: 'INTERNAL_ERROR' });
      return;
    }

    let verifyResult;
    try {
      verifyResult = await verifyAccessToken(accessToken);
    } catch (err: any) {
      log('YcAuthService', 'loginHandler', 'BLOCK_HASHING_ID', 'VK token verification failed', { error: err.message });
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const { vkUserId } = verifyResult;
    // START_BLOCK_HASHING_ID
    const hashedVkId = hashVkId(vkUserId, salt);
    const numericHash = getNumericHashFromHex(hashedVkId);

    log('YcAuthService', 'loginHandler', 'BLOCK_HASHING_ID', 'Hashed VK ID successfully', {
      hashedVkIdLength: hashedVkId.length,
      numericHash
    });
    // END_BLOCK_HASHING_ID

    await getOrCreateUser(hashedVkId);

    // JWT exp must be in seconds (RFC 7519). jsonwebtoken uses seconds natively.
    // Only numericHash (48-bit truncation) is included — never the full HMAC hash.
    // All downstream handlers (templates, submit, antiSpam, vkUpload) use only numericHash.
    const expirationSeconds = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    const payload = {
      numericHash,
      exp: expirationSeconds
    };

    const sessionToken = signJwt(payload, jwtSecret);
    res.json({ sessionToken });
  } catch (e: any) {
    log('YcAuthService', 'loginHandler', 'BLOCK_ENV_ERROR', 'Unexpected login error', { error: e.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  // END_BLOCK_ENV_ERROR
}

// START_CONTRACT: exchangeHandler
//   PURPOSE: Express POST /auth/exchange handler to exchange authorization code for VK ID tokens.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Outbound HTTP POST to id.vk.ru, logs outcome, sends JSON response.
//   LINKS: M-YC-AUTH-SERVICE
// END_CONTRACT: exchangeHandler
export async function exchangeHandler(req: Request, res: Response): Promise<void> {
  // START_BLOCK_VKID_EXCHANGE_BACKEND
  try {
    const { code, device_id, code_verifier, redirect_uri } = req.body || {};
    if (!code || !device_id || !code_verifier) {
      log('YcAuthService', 'exchangeHandler', 'BLOCK_VKID_EXCHANGE_BACKEND', 'Missing code, device_id, or code_verifier in request body', {});
      res.status(400).json({ error: 'MISSING_PARAMS' });
      return;
    }

    const config = await getConfig();
    const appId = config.vkAppId;
    const redirectUri = redirect_uri || config.vkOAuthRedirectUrl;

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('device_id', device_id);
    params.append('code_verifier', code_verifier);
    params.append('client_id', appId);
    if (config.vkClientSecret && config.vkClientSecret !== 'none') {
      params.append('client_secret', config.vkClientSecret);
    }
    params.append('redirect_uri', redirectUri);

    log('YcAuthService', 'exchangeHandler', 'BLOCK_VKID_EXCHANGE_BACKEND', 'Exchanging VK ID code on backend', { device_id });

    const vkRes = await fetch('https://id.vk.ru/oauth2/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!vkRes.ok) {
      const errText = await vkRes.text();
      log('YcAuthService', 'exchangeHandler', 'BLOCK_VKID_EXCHANGE_BACKEND', 'VK ID exchange failed', { status: vkRes.status, error: errText });
      res.status(502).json({ error: 'VKID_EXCHANGE_FAILED', message: errText });
      return;
    }

    const tokenSet = await vkRes.json();
    if (tokenSet.error) {
      log('YcAuthService', 'exchangeHandler', 'BLOCK_VKID_EXCHANGE_BACKEND', 'VK ID exchange error in response', { 
        error: tokenSet.error, 
        error_description: tokenSet.error_description 
      });
      res.status(502).json({ 
        error: 'VKID_EXCHANGE_FAILED', 
        message: `${tokenSet.error}: ${tokenSet.error_description}` 
      });
      return;
    }

    let finalTokenSet = tokenSet;
    if (tokenSet.response) {
      finalTokenSet = {
        ...tokenSet.response,
        ...tokenSet
      };
      delete finalTokenSet.response;
    }
    const keys = Object.keys(finalTokenSet);
    log('YcAuthService', 'exchangeHandler', 'BLOCK_VKID_EXCHANGE_BACKEND', 'VK ID exchange success keys', { 
      keys: keys.join(','),
      scope: finalTokenSet.scope
    });

    res.json(finalTokenSet);
  } catch (err: any) {
    log('YcAuthService', 'exchangeHandler', 'BLOCK_VKID_EXCHANGE_BACKEND', 'Unexpected exchange error', { error: err.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  // END_BLOCK_VKID_EXCHANGE_BACKEND
}

// START_CONTRACT: refreshHandler
//   PURPOSE: Express POST /auth/refresh handler to refresh VK ID tokens.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Outbound HTTP POST to id.vk.ru, logs outcome, sends JSON response.
//   LINKS: M-YC-AUTH-SERVICE
// END_CONTRACT: refreshHandler
export async function refreshHandler(req: Request, res: Response): Promise<void> {
  // START_BLOCK_VKID_REFRESH_BACKEND
  try {
    const { refresh_token, device_id } = req.body || {};
    if (!refresh_token || !device_id) {
      log('YcAuthService', 'refreshHandler', 'BLOCK_VKID_REFRESH_BACKEND', 'Missing refresh_token or device_id in request body', {});
      res.status(400).json({ error: 'MISSING_PARAMS' });
      return;
    }

    const config = await getConfig();
    const appId = config.vkAppId;

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refresh_token);
    params.append('device_id', device_id);
    params.append('client_id', appId);
    if (config.vkClientSecret && config.vkClientSecret !== 'none') {
      params.append('client_secret', config.vkClientSecret);
    }

    log('YcAuthService', 'refreshHandler', 'BLOCK_VKID_REFRESH_BACKEND', 'Refreshing VK ID token on backend', { device_id });

    const vkRes = await fetch('https://id.vk.ru/oauth2/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!vkRes.ok) {
      const errText = await vkRes.text();
      log('YcAuthService', 'refreshHandler', 'BLOCK_VKID_REFRESH_BACKEND', 'VK ID refresh failed', { status: vkRes.status, error: errText });
      res.status(502).json({ error: 'VKID_REFRESH_FAILED', message: errText });
      return;
    }

    const tokenSet = await vkRes.json();
    if (tokenSet.error) {
      log('YcAuthService', 'refreshHandler', 'BLOCK_VKID_REFRESH_BACKEND', 'VK ID refresh error in response', { 
        error: tokenSet.error, 
        error_description: tokenSet.error_description 
      });
      res.status(502).json({ 
        error: 'VKID_REFRESH_FAILED', 
        message: `${tokenSet.error}: ${tokenSet.error_description}` 
      });
      return;
    }

    let finalTokenSet = tokenSet;
    if (tokenSet.response) {
      finalTokenSet = {
        ...tokenSet.response,
        ...tokenSet
      };
      delete finalTokenSet.response;
    }
    log('YcAuthService', 'refreshHandler', 'BLOCK_VKID_REFRESH_BACKEND', 'VK ID refresh success keys', { 
      keys: Object.keys(finalTokenSet).join(',')
    });

    res.json(finalTokenSet);
  } catch (err: any) {
    log('YcAuthService', 'refreshHandler', 'BLOCK_VKID_REFRESH_BACKEND', 'Unexpected refresh error', { error: err.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  // END_BLOCK_VKID_REFRESH_BACKEND
}

// GRACE_MARKER: [YcAuthService][loginHandler][BLOCK_HASHING_ID]
// GRACE_MARKER: [YcAuthService][loginHandler][BLOCK_ENV_ERROR]
// GRACE_MARKER: [YcAuthService][exchangeHandler][BLOCK_VKID_EXCHANGE_BACKEND]
// GRACE_MARKER: [YcAuthService][refreshHandler][BLOCK_VKID_REFRESH_BACKEND]

const _graceLogMarkers = [
  "[YcAuthService][loginHandler][BLOCK_HASHING_ID]",
  "[YcAuthService][loginHandler][BLOCK_ENV_ERROR]",
  "[YcAuthService][exchangeHandler][BLOCK_VKID_EXCHANGE_BACKEND]",
  "[YcAuthService][refreshHandler][BLOCK_VKID_REFRESH_BACKEND]"
];
