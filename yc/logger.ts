// FILE: yc/logger.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Redacting structured logger wrapping console.log for YC Functions; strips secrets and tokens from log output.
//   SCOPE: log function, REDACTED set, redact function.
//   DEPENDS: none
//   LINKS: M-YC-LOGGER
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   log - (module, fn, block, message, data?) => void; structured redacting logger
//   REDACTED - Set of keys whose values are replaced with ***REDACTED***
//   redact - (data: Record) => Record; deep-clone and redact sensitive keys
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.3.0 - Add numericHash and ownerHash to REDACTED set (FZ-152: prevent logging truncated HMAC that can be reversed with salt)]
// END_CHANGE_SUMMARY

export const REDACTED = new Set([
  'access_token',
  'refresh_token',
  'accessToken',
  'refreshToken',
  'idToken',
  'id_token',
  'jwtSecret',
  'JWT_SECRET',
  'secret',
  'password',
  'data',
  'buffer',
  'file',
  'blob',
  's3SecretAccessKey',
  'S3_SECRET_ACCESS_KEY',
  'credentials',
  'vk_app_secret',
  'vkClientSecret',
  'VK_CLIENT_SECRET',
  'VK_SERVICE_TOKEN',
  'vkAccessToken',
  'vkServiceToken',
  'sessionToken',
  'hashedVkId',
  'vkUserId',
  'user_id',
  'numericHash',
  'ownerHash'
]);

// START_CONTRACT: redact
//   PURPOSE: deep-clone and redact sensitive keys from log payloads
//   INPUTS: { data: unknown }
//   OUTPUTS: { unknown - Cloned object with sensitive keys replaced by ***REDACTED*** }
//   SIDE_EFFECTS: none
//   LINKS: M-YC-LOGGER
// END_CONTRACT: redact
export function redact(data: unknown): unknown {
  // START_BLOCK_REDACT
  if (data === null || data === undefined) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => redact(item));
  }

  if (typeof data === 'object') {
    const redactedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (REDACTED.has(key)) {
        redactedObj[key] = '***REDACTED***';
      } else {
        redactedObj[key] = redact(value);
      }
    }
    return redactedObj;
  }

  return data;
  // END_BLOCK_REDACT
}

// START_CONTRACT: log
//   PURPOSE: Print structured redacted logs to console.
//   INPUTS: { module: string, fn: string, block: string, message: string, data?: Record<string, unknown> }
//   OUTPUTS: { void }
//   SIDE_EFFECTS: console.log
//   LINKS: M-YC-LOGGER
// END_CONTRACT: log
export function log(module: string, fn: string, block: string, message: string, data?: Record<string, unknown>): void {
  // START_BLOCK_LOG_EMIT
  const prefix = `[${module}][${fn}][${block}]`;
  if (data !== undefined) {
    const redactedData = redact(data);
    console.log(`${prefix} ${message}`, redactedData);
  } else {
    console.log(`${prefix} ${message}`);
  }
  // END_BLOCK_LOG_EMIT
}

// GRACE_MARKER: [YcLogger][BLOCK_LOG_EMIT]
// GRACE_MARKER: [YcLogger][BLOCK_REDACT]

const _graceLogMarkers = [
  "[YcLogger][BLOCK_LOG_EMIT]",
  "[YcLogger][BLOCK_REDACT]"
];
