// FILE: yc/http/health.ts
// VERSION: 1.0.2
// START_MODULE_CONTRACT
//   PURPOSE: Express GET /health handler returning simple OK status.
//   SCOPE: healthHandler Express handler.
//   DEPENDS: M-YC-LOGGER
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Sends JSON response.
//   LINKS: M-YC-HEALTH
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   healthHandler - Express GET /health handler
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.3 - Remove duplicate CORS header; global middleware handles it]
// END_CHANGE_SUMMARY

import { Request, Response } from 'express';
import { log } from '../logger';

// START_CONTRACT: healthHandler
//   PURPOSE: Express GET /health handler returning simple OK status.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Sends JSON response.
//   LINKS: M-YC-HEALTH
// END_CONTRACT: healthHandler
export async function healthHandler(req: Request, res: Response): Promise<void> {
  // START_BLOCK_HEALTH_CHECK
  log('YcHealth', 'healthHandler', 'BLOCK_HEALTH_CHECK', 'Health check requested', {});
  res.json({ status: 'ok' });
  // END_BLOCK_HEALTH_CHECK
}



// GRACE_MARKER: [YcHealth][healthHandler][BLOCK_HEALTH_CHECK]

const _graceLogMarkers = [
  "[YcHealth][healthHandler][BLOCK_HEALTH_CHECK]"
];
