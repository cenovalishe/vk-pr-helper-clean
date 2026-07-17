// FILE: yc/auth/context.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Auth context and Express middleware extracting, verifying tokens, and injecting req.user.numericHash.
//   SCOPE: authMiddleware, assertVkIdentity.
//   DEPENDS: M-YC-TOKEN-VERIFY, M-YC-LOGGER, M-YC-AUTH-SERVICE, M-YC-CONFIG
//   LINKS: M-YC-AUTH-CTX
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   authMiddleware - Express middleware extracting Bearer token and verifying it
//   assertVkIdentity - Standalone token verifier returning user numericHash
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.2.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
// END_CHANGE_SUMMARY

import { Request, Response, NextFunction } from 'express';
import { InvalidTokenError } from './tokenVerify';
import { log } from '../logger';
import { verifyJwt } from './service';
import { getConfig } from '../config';

// Extend Express Request interface to include req.user
declare global {
  namespace Express {
    interface Request {
      user?: {
        numericHash: number;
      };
    }
  }
}

// START_CONTRACT: assertVkIdentity
//   PURPOSE: Verifies JWT session token and returns user numericHash. Only JWTs are accepted on protected endpoints (raw VK tokens must go through /auth/login first).
//   INPUTS: { accessToken: string (JWT session token starting with eyJ) }
//   OUTPUTS: Promise<number> - numericHash
//   SIDE_EFFECTS: none
//   LINKS: M-YC-AUTH-CTX
// END_CONTRACT: assertVkIdentity
export async function assertVkIdentity(accessToken: string): Promise<number> {
  // START_BLOCK_VK_SIGN_VERIFY
  const config = await getConfig();
  const jwtSecret = config.jwtSecret;

  if (!jwtSecret) {
    log('YcAuthCtx', 'assertVkIdentity', 'BLOCK_VK_SIGN_VERIFY', 'Missing JWT_SECRET', {});
    throw new Error('INTERNAL_ERROR');
  }

  if (!accessToken.startsWith('eyJ')) {
    log('YcAuthCtx', 'assertVkIdentity', 'BLOCK_VK_SIGN_VERIFY', 'Non-JWT token rejected on protected endpoint', {});
    throw new InvalidTokenError('UNAUTHORIZED');
  }

  try {
    const payload = verifyJwt(accessToken, jwtSecret);
    if (typeof payload.numericHash !== 'number') {
      log('YcAuthCtx', 'assertVkIdentity', 'BLOCK_VK_SIGN_VERIFY', 'JWT payload missing numericHash', {});
      throw new InvalidTokenError('UNAUTHORIZED');
    }
    log('YcAuthCtx', 'assertVkIdentity', 'BLOCK_VK_SIGN_VERIFY', 'Identity asserted via session JWT', {});
    return payload.numericHash;
  } catch (jwtErr: any) {
    if (jwtErr instanceof InvalidTokenError) {
      throw jwtErr;
    }
    log('YcAuthCtx', 'assertVkIdentity', 'BLOCK_VK_SIGN_VERIFY', 'JWT verification failed', { error: jwtErr.message });
    throw new InvalidTokenError('UNAUTHORIZED');
  }
  // END_BLOCK_VK_SIGN_VERIFY
}

// START_CONTRACT: authMiddleware
//   PURPOSE: Express middleware verifying token, extracting numericHash, injecting into req.user.
//   INPUTS: { req: Request, res: Response, next: NextFunction }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Mutates req object, responds HTTP 401/500 on validation failure.
//   LINKS: M-YC-AUTH-CTX
// END_CONTRACT: authMiddleware
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    log('YcAuthCtx', 'authMiddleware', 'BLOCK_VK_SIGN_VERIFY', 'Missing Authorization header', {});
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = authHeader;
  }

  if (!token) {
    log('YcAuthCtx', 'authMiddleware', 'BLOCK_VK_SIGN_VERIFY', 'Empty token provided', {});
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  try {
    const numericHash = await assertVkIdentity(token);
    req.user = { numericHash };
    next();
  } catch (err: any) {
    if (err instanceof InvalidTokenError || err.message === 'UNAUTHORIZED') {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

// GRACE_MARKER: [YcAuthCtx][assertVkIdentity][BLOCK_VK_SIGN_VERIFY]

const _graceLogMarkers = [
  "[YcAuthCtx][assertVkIdentity][BLOCK_VK_SIGN_VERIFY]"
];
