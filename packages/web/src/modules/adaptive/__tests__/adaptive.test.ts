// FILE: packages/web/src/modules/adaptive/__tests__/adaptive.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-ADAPTIVE module.
//   SCOPE: Verifies MOBILE_BREAKPOINT_PX, useSafeAreaInsets, useIsMobile, and SAFE_AREA_CSS_VARS.
//   DEPENDS: M-ADAPTIVE
//   LINKS: M-ADAPTIVE, V-M-ADAPTIVE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - test files do not export runtime symbols
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial test suite for adaptive hooks and constants]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdaptivityConditionalRender } from '@vkontakte/vkui';
import {
  MOBILE_BREAKPOINT_PX,
  SAFE_AREA_CSS_VARS,
  useSafeAreaInsets,
  useIsMobile,
} from '../index';

vi.mock('@vkontakte/vkui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vkontakte/vkui')>();
  return {
    ...original,
    useAdaptivityConditionalRender: vi.fn(),
  };
});

describe('M-ADAPTIVE (Phase-MOBILE-ADAPT)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // AD1
  it('AD1: MOBILE_BREAKPOINT_PX constant equals 768', () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(768);
  });

  // AD5
  it('AD5: SAFE_AREA_CSS_VARS contains env fallbacks', () => {
    expect(SAFE_AREA_CSS_VARS['--safe-area-inset-top']).toContain('env(safe-area-inset-top');
    expect(SAFE_AREA_CSS_VARS['--safe-area-inset-bottom']).toContain('env(safe-area-inset-bottom');
    expect(SAFE_AREA_CSS_VARS['--safe-area-inset-left']).toContain('env(safe-area-inset-left');
    expect(SAFE_AREA_CSS_VARS['--safe-area-inset-right']).toContain('env(safe-area-inset-right');
  });

  // AD2
  it('AD2: useSafeAreaInsets returns zero in jsdom and logs BLOCK_INSET_MEASURE once', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    
    const { result, rerender } = renderHook(() => useSafeAreaInsets());
    
    expect(result.current).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    
    // Rerender to verify no duplicate measure logging
    rerender();
    
    // Find calls matching the log prefix and BLOCK_INSET_MEASURE
    const measureCalls = infoSpy.mock.calls.filter(call => 
      call[0] && typeof call[0] === 'string' && call[0].includes('[Adaptive][useSafeAreaInsets][BLOCK_INSET_MEASURE]')
    );
    
    expect(measureCalls.length).toBe(1);
    expect(measureCalls[0][1]).toEqual(expect.objectContaining({ ssr: false }));
  });

  // AD3
  it('AD3: useSafeAreaInsets returns measured CSS variable values', () => {
    const originalGetComputedStyle = window.getComputedStyle;
    
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      if (el === document.documentElement) {
        return {
          getPropertyValue: (prop: string) => {
            if (prop === '--safe-area-inset-bottom') return '34px';
            if (prop === '--safe-area-inset-top') return '44px';
            if (prop === '--safe-area-inset-left') return '10px';
            if (prop === '--safe-area-inset-right') return '12px';
            return '';
          }
        } as CSSStyleDeclaration;
      }
      return originalGetComputedStyle(el);
    });

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    
    const { result } = renderHook(() => useSafeAreaInsets());
    
    expect(result.current).toEqual({
      top: 44,
      bottom: 34,
      left: 10,
      right: 12,
    });
  });

  // AD4
  it('AD4: useIsMobile checks tabletMinus adaptivity', () => {
    const mockHook = vi.mocked(useAdaptivityConditionalRender);
    
    // Mobile case (tabletMinus truthy)
    mockHook.mockReturnValue({
      viewWidth: {
        tabletMinus: true,
        tabletPlus: false,
      }
    } as any);
    
    const { result: resultMobile } = renderHook(() => useIsMobile());
    expect(resultMobile.current).toBe(true);

    // Desktop case (tabletMinus falsy, tabletPlus truthy)
    mockHook.mockReturnValue({
      viewWidth: {
        tabletMinus: false,
        tabletPlus: true,
      }
    } as any);
    
    const { result: resultDesktop } = renderHook(() => useIsMobile());
    expect(resultDesktop.current).toBe(false);
  });

  // AD6
  it('AD6: useSafeAreaInsets SSR guard returns all-zero without throwing when window is undefined', () => {
    vi.stubGlobal('window', undefined);
    
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    
    let result;
    expect(() => {
      result = useSafeAreaInsets();
    }).not.toThrow();

    expect(result).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });

    const ssrCalls = infoSpy.mock.calls.filter(call => 
      call[0] && typeof call[0] === 'string' && call[0].includes('[Adaptive][useSafeAreaInsets][BLOCK_INSET_MEASURE]')
    );
    
    expect(ssrCalls.length).toBe(1);
    // The details should include ssr: true
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Adaptive][useSafeAreaInsets][BLOCK_INSET_MEASURE]'),
      expect.objectContaining({ ssr: true })
    );
  });
});
