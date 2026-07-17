// FILE: packages/web/src/shared/__tests__/storage.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for safe storage helper (shared/storage)
//   SCOPE: safeGetItem, safeSetItem, safeRemoveItem with simulated localstorage security blocks and incognito modes
//   DEPENDS: @/shared/storage
//   LINKS: none
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   storageTests - suite
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Scaffolding unit tests to verify in-memory fallback during simulated security/write errors in localStorage
// END_CHANGE_SUMMARY

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../storage';

describe('safe storage helper', () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    // Reset global localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scenario-S1: normal localStorage reads and writes work', () => {
    safeSetItem('test_key', 'hello');
    expect(safeGetItem('test_key')).toBe('hello');
  });

  it('scenario-S2: falls back to memoryStorage if localStorage setItem throws (quota/security)', () => {
    // Simulate setItem failing by throwing SecurityError, but getItem doesn't throw (returns null)
    const store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn(() => {
        throw new Error('SecurityError: The operation is insecure.');
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(() => null),
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });

    safeSetItem('test_fallback_key', 'world');
    expect(mockLocalStorage.setItem).toHaveBeenCalled();
    // getItem should return null from mocked localStorage, but safeGetItem should fall back to memory
    expect(safeGetItem('test_fallback_key')).toBe('world');
  });

  it('scenario-S3: falls back to memoryStorage if localStorage getItem throws', () => {
    const mockLocalStorage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError: Access is denied.');
      }),
      setItem: vi.fn(() => {
        throw new Error('SecurityError: Access is denied.');
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(() => null),
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });

    safeSetItem('test_throw_key', 'value_from_memory');
    expect(safeGetItem('test_throw_key')).toBe('value_from_memory');
  });

  it('scenario-S4: safeRemoveItem removes from both storage backends', () => {
    safeSetItem('test_remove_key', 'temp');
    expect(safeGetItem('test_remove_key')).toBe('temp');

    safeRemoveItem('test_remove_key');
    expect(safeGetItem('test_remove_key')).toBeNull();
  });
});
