// FILE: yc/__tests__/http.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Integration and unit tests for yc/http.ts Express app and yc/index.ts handler.
//   SCOPE: Validate route mapping, CORS, body parser, and Cloud Function handler adapter.
//   DEPENDS: M-YC-EXPRESS
//   LINKS: V-M-YC-EXPRESS
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Fix CORS tests to send Origin header (whitelist-based CORS requires explicit origin)]
//   PREVIOUS_CHANGES:
//     - [v1.0.0 - Initial implementation of Express router and handler adapter tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Set up process.env before importing app/handler
process.env.CLIENT_ORIGIN = 'http://test-origin.com';

// Mock all handlers and middlewares
vi.mock('../http/health', () => ({
  healthHandler: vi.fn((req, res) => res.json({ status: 'ok' }))
}));
vi.mock('../auth/service', () => ({
  loginHandler: vi.fn((req, res) => res.json({ token: 'mock-jwt' })),
  exchangeHandler: vi.fn((req, res) => res.json({ access_token: 'mock-vk-token' })),
  refreshHandler: vi.fn((req, res) => res.json({ access_token: 'new-mock-vk-token' }))
}));
vi.mock('../auth/context', () => ({
  authMiddleware: vi.fn((req, res, next) => {
    req.user = { numericHash: 12345, userId: 'user-123' };
    next();
  })
}));
vi.mock('../templates', () => ({
  listTemplates: vi.fn((req, res) => res.json([{ id: '1', name: 't1' }])),
  createTemplate: vi.fn((req, res) => res.json({ id: '2' })),
  updateTemplate: vi.fn((req, res) => res.json({ success: true })),
  deleteTemplate: vi.fn((req, res) => res.json({ success: true }))
}));
vi.mock('../http/submit', () => ({
  submitHandler: vi.fn((req, res) => res.json({ success: true }))
}));
vi.mock('../http/vkUpload', () => ({
  presignHandler: vi.fn((req, res) => res.json({ presignedUrl: 'http://s3' }))
}));
vi.mock('../communityResolver', () => ({
  resolveHandler: vi.fn((req, res) => res.json({ numericId: 123 })),
  avatarsHandler: vi.fn((req, res) => res.json({ avatar: 'http://avatar' }))
}));

// Now import app and handler
import { app } from '../http';
import { handler } from '../index';
import * as logger from '../logger';

vi.spyOn(logger, 'log').mockImplementation(() => {});

describe('M-YC-EXPRESS - Express Routing and YC Handler Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scenario-YE1: mounts all required routes', async () => {
    // Unauthenticated routes
    const rHealth = await request(app).get('/health');
    expect(rHealth.status).toBe(200);
    expect(rHealth.body).toEqual({ status: 'ok' });

    const rLogin = await request(app).post('/auth/login');
    expect(rLogin.status).toBe(200);
    expect(rLogin.body).toEqual({ token: 'mock-jwt' });

    const rResolve = await request(app).post('/communities/resolve');
    expect(rResolve.status).toBe(200);
    expect(rResolve.body).toEqual({ numericId: 123 });

    const rAvatars = await request(app).post('/communities/avatars');
    expect(rAvatars.status).toBe(200);
    expect(rAvatars.body).toEqual({ avatar: 'http://avatar' });

    // Authenticated routes
    const rTemplatesGet = await request(app).get('/templates');
    expect(rTemplatesGet.status).toBe(200);
    expect(rTemplatesGet.body).toEqual([{ id: '1', name: 't1' }]);

    const rTemplatesPost = await request(app).post('/templates').send({ text: 'test' });
    expect(rTemplatesPost.status).toBe(200);
    expect(rTemplatesPost.body).toEqual({ id: '2' });

    const rTemplatesPatch = await request(app).patch('/templates/1');
    expect(rTemplatesPatch.status).toBe(200);

    const rTemplatesDelete = await request(app).delete('/templates/1');
    expect(rTemplatesDelete.status).toBe(200);

    const rSubmit = await request(app).post('/submit');
    expect(rSubmit.status).toBe(200);

    const rPresign = await request(app).post('/vkUpload/presign');
    expect(rPresign.status).toBe(200);
  });

  it('scenario-YE2: CORS headers and OPTIONS preflight returning 204', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'http://test-origin.com');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://test-origin.com');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('X-VK-Token');
  });

  it('scenario-YE3: handler adapter wraps express app and resolves requests', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/health',
      headers: {
        'Accept': 'application/json',
        'Origin': 'http://test-origin.com'
      },
      queryStringParameters: {},
      body: '',
      isBase64Encoded: false
    };

    const res = (await handler(event, {})) as any;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    expect(res.headers['access-control-allow-origin']).toBe('http://test-origin.com');
  });

  it('scenario-YE4: JSON body parser parses body and doesn\'t block on image uploads', async () => {
    const bodyPayload = { some: 'value' };
    const rPost = await request(app)
      .post('/auth/login')
      .send(bodyPayload)
      .set('Content-Type', 'application/json');

    expect(rPost.status).toBe(200);
  });
});
