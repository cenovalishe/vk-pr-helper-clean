// FILE: yc/http.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Express app assembly mounting all route handlers with CORS preflight and body parsers.
//   SCOPE: Express app creation, middleware registration, and route mounting.
//   DEPENDS: M-YC-HEALTH, M-YC-IMAGE-PROXY, M-YC-SUBMIT, M-YC-TEMPLATES, M-YC-AUTH-SERVICE, M-YC-COMMUNITY-RESOLVER, M-YC-AUTH-CTX, M-YC-LOGGER
//   LINKS: M-YC-EXPRESS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   app - Express application instance with all routes registered
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.3.0 - CORS whitelist now reads clientOrigin from Lockbox via getConfig() (was process.env which is empty in YC Function)]
//   PREVIOUS_CHANGES:
//     - [v1.2.1 - CORS whitelist built per-request (not at module load) so env vars are read at request time]
//     - [v1.2.0 - CORS: replace origin reflection with whitelist (CLIENT_ORIGIN + YC static hosting); credentials only set when origin matches]
// END_CHANGE_SUMMARY

import express from 'express';
import { healthHandler } from './http/health';
import { loginHandler, exchangeHandler, refreshHandler } from './auth/service';
import { authMiddleware } from './auth/context';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from './templates';
import { submitHandler } from './http/submit';
import { presignHandler } from './http/vkUpload';
import { resolveHandler, avatarsHandler } from './communityResolver';
import { getConfig } from './config';
import { log } from './logger';

const app = express();

// START_BLOCK_HTTP_MOUNT
// Setup CORS headers with origin whitelist (no open reflection)
// Whitelist built per-request from Lockbox config + hardcoded static hosting fallback
app.use(async (req, res, next) => {
  let clientOrigin = process.env.CLIENT_ORIGIN || '';
  try {
    const config = await getConfig();
    clientOrigin = config.clientOrigin || clientOrigin;
  } catch {
    // If Lockbox is unavailable (e.g. health check before warmup or tests), use process.env fallback
  }

  const allowedOrigins = new Set<string>([
    clientOrigin,
    'https://vk-pr-helper-static-ceno.website.yandexcloud.net'
  ].filter(Boolean));

  const requestOrigin = req.headers.origin || '';
  const originAllowed = allowedOrigins.has(requestOrigin);

  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-VK-Token');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// JSON body parser with 1mb limit
app.use(express.json({ limit: '1mb' }));

// 1. Health endpoint (unauthenticated)
app.get('/health', healthHandler);

// 2. Auth Login endpoint (unauthenticated)
app.post('/auth/login', loginHandler);
app.post('/auth/exchange', exchangeHandler);
app.post('/auth/refresh', refreshHandler);

// 3. Community resolution endpoints (authenticated — require JWT to prevent anonymous VK API abuse)
app.post('/communities/resolve', authMiddleware, resolveHandler);
app.post('/communities/avatars', authMiddleware, avatarsHandler);

// 4. Templates endpoints (authenticated)
app.get('/templates', authMiddleware, listTemplates);
app.post('/templates', authMiddleware, createTemplate);
app.patch('/templates/:id', authMiddleware, updateTemplate);
app.delete('/templates/:id', authMiddleware, deleteTemplate);

// 5. Submit post endpoint (authenticated)
app.post('/submit', authMiddleware, submitHandler);

// 6. Image proxy presign endpoint (authenticated)
app.post('/vkUpload/presign', authMiddleware, presignHandler);

log('YcExpress', 'init', 'BLOCK_HTTP_MOUNT', 'All routes mounted successfully');
// END_BLOCK_HTTP_MOUNT

export { app };

// GRACE_MARKER: [YcExpress][BLOCK_HTTP_MOUNT]

const _graceLogMarkers = [
  "[YcExpress][BLOCK_HTTP_MOUNT]"
];
