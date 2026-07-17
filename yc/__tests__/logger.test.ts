// FILE: yc/__tests__/logger.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/logger.ts.
//   SCOPE: Validate correct prefix generation, key redaction lists, and nested object redaction.
//   DEPENDS: M-YC-LOGGER
//   LINKS: V-M-YC-LOGGER
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of YcLogger tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, redact, REDACTED } from '../logger';

describe('M-YC-LOGGER - YcLogger', () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should emit prefix in [Module][fn][BLOCK] format', () => {
    log('MyModule', 'myFn', 'MY_BLOCK', 'hello world');
    expect(consoleSpy).toHaveBeenCalledWith('[MyModule][myFn][MY_BLOCK] hello world');
  });

  it('should redact sensitive keys in flat object', () => {
    const data = {
      username: 'user1',
      password: 'password123',
      access_token: 'token123',
      normalField: 'test'
    };

    const result = redact(data) as any;
    expect(result.username).toBe('user1');
    expect(result.normalField).toBe('test');
    expect(result.password).toBe('***REDACTED***');
    expect(result.access_token).toBe('***REDACTED***');
  });

  it('should recursively redact nested objects and arrays', () => {
    const data = {
      nested: {
        secret: 'my-secret',
        visible: 'ok'
      },
      list: [
        { refreshToken: 'token-xyz', name: 'A' },
        { name: 'B' }
      ]
    };

    const result = redact(data) as any;
    expect(result.nested.secret).toBe('***REDACTED***');
    expect(result.nested.visible).toBe('ok');
    expect(result.list[0].refreshToken).toBe('***REDACTED***');
    expect(result.list[0].name).toBe('A');
    expect(result.list[1].name).toBe('B');
  });

  it('should redact numericHash and ownerHash (FZ-152 pseudonymous IDs)', () => {
    const data = {
      numericHash: 123456789,
      ownerHash: 987654321,
      normalField: 'test'
    };

    const result = redact(data) as any;
    expect(result.numericHash).toBe('***REDACTED***');
    expect(result.ownerHash).toBe('***REDACTED***');
    expect(result.normalField).toBe('test');
  });

  it('should print redacted data with console.log', () => {
    log('MyModule', 'myFn', 'MY_BLOCK', 'auth event', {
      username: 'user1',
      access_token: 'secret-token'
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[MyModule][myFn][MY_BLOCK] auth event',
      {
        username: 'user1',
        access_token: '***REDACTED***'
      }
    );
  });
});
