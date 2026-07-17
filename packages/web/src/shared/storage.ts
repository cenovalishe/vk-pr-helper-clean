// FILE: packages/web/src/shared/storage.ts
// VERSION: 1.0.2
// START_MODULE_CONTRACT
//   PURPOSE: Safe localStorage wrapper with in-memory fallback for environments where localStorage is blocked (e.g. mobile private tabs, iframe webviews)
//   SCOPE: safeGetItem, safeSetItem, safeRemoveItem
//   DEPENDS: none
//   LINKS: none
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   safeGetItem - Gets a value from localStorage or in-memory fallback
//   safeSetItem - Sets a value in localStorage and in-memory fallback
//   safeRemoveItem - Removes a value from localStorage and in-memory fallback
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.2 - Clean key from memoryStorage when localStorage write succeeds to avoid state leakage in tests]
//   PREVIOUS_CHANGES:
//     - [v1.0.1 - Fixed safeGetItem to fall back to memoryStorage when localStorage returns null (due to write blocks)]
//     - [v1.0.0 - Initial implementation of safe storage helper with in-memory fallback]
// END_CHANGE_SUMMARY

const memoryStorage = new Map<string, string>();

// START_CONTRACT: safeGetItem
//   PURPOSE: Safely get item from localStorage or fall back to memory map
//   INPUTS: { key: string }
//   OUTPUTS: string | null
//   SIDE_EFFECTS: none
// END_CONTRACT: safeGetItem
export function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        return val;
      }
    }
  } catch (e) {
    // Silently fall back to in-memory storage
  }
  return memoryStorage.get(key) ?? null;
}

// START_CONTRACT: safeSetItem
//   PURPOSE: Safely set item in localStorage and memory map
//   INPUTS: { key: string, value: string }
//   OUTPUTS: void
//   SIDE_EFFECTS: Writes to localStorage or memory map
// END_CONTRACT: safeSetItem
export function safeSetItem(key: string, value: string): void {
  let localStorageSuccess = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      localStorageSuccess = true;
      memoryStorage.delete(key);
    }
  } catch (e) {
    // Silently fall back to in-memory storage
  }
  if (!localStorageSuccess) {
    memoryStorage.set(key, value);
  }
}

// START_CONTRACT: safeRemoveItem
//   PURPOSE: Safely remove item from localStorage and memory map
//   INPUTS: { key: string }
//   OUTPUTS: void
//   SIDE_EFFECTS: Removes key from localStorage and memory map
// END_CONTRACT: safeRemoveItem
export function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    // Silently fall back to in-memory storage
  }
  memoryStorage.delete(key);
}
