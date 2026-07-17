// START_MODULE_CONTRACT
//   PURPOSE: Setup configuration and stubs for the testing environment.
//   SCOPE: Sets up matchMedia, ResizeObserver, and scrollTo stubs in window/globalThis for VKUI testing.
//   DEPENDS: none
//   LINKS: none
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.2 - Add window.scrollTo, scroll, and scrollBy stubs to prevent jsdom errors in VKUI AppRoot]
// END_CHANGE_SUMMARY

import '@testing-library/jest-dom/vitest';

// VKUI AppRoot/ScrollContext uses scrollTo, which is not implemented in jsdom and throws.
// Stub it as a no-op to allow components to mount and scroll cleanly in tests.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
  window.scroll = () => {};
  window.scrollBy = () => {};
}

// VKUI adaptivity hooks (useAdaptivityConditionalRender / useAdaptivityWithJSMediaQueries)
// rely on window.matchMedia, which jsdom does not implement. Provide a stub that
// reports no matches so tabletPlus/tabletMinus branches render deterministically.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}

// VKUI useResizeObserver references the global ResizeObserver, which jsdom does
// not provide. Stub it as a no-op so layout components mount in tests.
if (typeof globalThis !== 'undefined' && !(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
