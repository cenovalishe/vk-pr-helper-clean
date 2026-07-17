// FILE: packages/web/src/shared/logger.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: GRACE-aligned semantic logger producing structured console output
//   SCOPE: Logging utility for all modules; format: [Module][function][BLOCK_NAME] message
//   DEPENDS: none
//   LINKS: M-LAYOUT, M-AUTH, M-TEMPLATES, M-IMAGES, M-VK-API, M-SUBMIT, M-COMMUNITIES, M-TIPS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createLogger - Factory function to create module-scoped loggers
//   GraceLogEntry - Type for structured log entries
//   ModuleLogger - Interface for module-scoped logger
// END_MODULE_MAP

// START_CONTRACT: GraceLogEntry
//   PURPOSE: Structured log entry type aligned with GRACE semantic blocks
//   INPUTS: none (type definition)
//   OUTPUTS: none (type definition)
//   SIDE_EFFECTS: none
//   LINKS: GlobalPolicy.structured-log-schema
// END_CONTRACT: GraceLogEntry
export interface GraceLogEntry {
  module: string;
  function: string;
  block: string;
  action: string;
  correlationId?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface ModuleLogger {
  info(fn: string, block: string, message: string, data?: Record<string, unknown>): void;
  warn(fn: string, block: string, message: string, data?: Record<string, unknown>): void;
  error(fn: string, block: string, message: string, data?: Record<string, unknown>): void;
  debug(fn: string, block: string, message: string, data?: Record<string, unknown>): void;
}

// START_BLOCK_REDACT_SENSITIVE
const REDACT_KEYS = new Set([
  'accessToken',
  'access_token',
  'token',
  'secret',
  'password',
  'credential',
]);

function redactData(
  data?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    redacted[key] = REDACT_KEYS.has(key) ? '***REDACTED***' : value;
  }
  return redacted;
}
// END_BLOCK_REDACT_SENSITIVE

// START_CONTRACT: createLogger
//   PURPOSE: Create a module-scoped logger that prefixes all output with [ModuleName]
//   INPUTS: { moduleName: string }
//   OUTPUTS: { ModuleLogger with info, warn, error, debug methods }
//   SIDE_EFFECTS: Console output with [Module][function][BLOCK] prefix
//   LINKS: GlobalPolicy.log-format, GlobalPolicy.redaction
// END_CONTRACT: createLogger

// START_BLOCK_CREATE_LOGGER
export function createLogger(moduleName: string): ModuleLogger {
  const format = (
    fn: string,
    block: string,
    message: string,
    data?: Record<string, unknown>,
  ): string => {
    const prefix = `[${moduleName}][${fn}][${block}]`;
    return `${prefix} ${message}`;
  };

  return {
    info(fn, block, message, data) {
      const text = format(fn, block, message, data);
      const safeData = redactData(data);
      safeData ? console.info(text, safeData) : console.info(text);
    },
    warn(fn, block, message, data) {
      const text = format(fn, block, message, data);
      const safeData = redactData(data);
      safeData ? console.warn(text, safeData) : console.warn(text);
    },
    error(fn, block, message, data) {
      const text = format(fn, block, message, data);
      const safeData = redactData(data);
      safeData ? console.error(text, safeData) : console.error(text);
    },
    debug(fn, block, message, data) {
      const text = format(fn, block, message, data);
      const safeData = redactData(data);
      safeData ? console.debug(text, safeData) : console.debug(text);
    },
  };
}
// END_BLOCK_CREATE_LOGGER

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of GRACE semantic logger with redaction]
// END_CHANGE_SUMMARY
