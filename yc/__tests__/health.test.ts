// FILE: yc/__tests__/health.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/http/health.ts health check Express handler.
//   SCOPE: Validate health check returns ok and logs (CORS handled by global middleware).
//   DEPENDS: M-YC-HEALTH
//   LINKS: V-M-YC-HEALTH
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Remove CORS header assertion: health handler relies on global CORS middleware]
//   PREVIOUS_CHANGES:
//     - [v1.0.0 - Initial implementation of health.test.ts unit tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthHandler } from '../http/health';
import * as logger from '../logger';

const mockRes = () => {
  const res: any = {};
  res.setHeader = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('M-YC-HEALTH - YcHealthApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-YH1: GET /health → 200 { status: "ok" }', async () => {
    const req = {} as any;
    const res = mockRes();

    await healthHandler(req, res);

    // CORS is now handled by global middleware in http.ts, not by health handler
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });

    expect(logger.log).toHaveBeenCalledWith(
      'YcHealth',
      'healthHandler',
      'BLOCK_HEALTH_CHECK',
      'Health check requested',
      {}
    );
  });
});
