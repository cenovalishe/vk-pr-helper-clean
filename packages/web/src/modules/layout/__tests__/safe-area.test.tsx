// FILE: packages/web/src/modules/layout/__tests__/safe-area.test.tsx
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-LAYOUT safe-area wiring on mobile and desktop
//   SCOPE: Scenario L11 and L12 verification
//   DEPENDS: M-LAYOUT.AppLayout, M-ADAPTIVE
//   LINKS: M-LAYOUT, V-M-LAYOUT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - test files do not export runtime symbols
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - Refactor logging assertion to use mockLoggerInfo spy instead of console.info spy]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../AppLayout';
import { useSafeAreaInsets, useIsMobile, SAFE_AREA_CSS_VARS } from '../../adaptive';
import { useAdaptivityConditionalRender } from '@vkontakte/vkui';

// Mock the logger using a local mockLoggerInfo spy declared in vi.hoisted
const { mockLoggerInfo } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock adaptive module
vi.mock('../../adaptive', () => ({
  useSafeAreaInsets: vi.fn(),
  useIsMobile: vi.fn(),
  SAFE_AREA_CSS_VARS: {
    '--safe-area-inset-top': 'env(safe-area-inset-top, 0px)',
    '--safe-area-inset-bottom': 'env(safe-area-inset-bottom, 0px)',
    '--safe-area-inset-left': 'env(safe-area-inset-left, 0px)',
    '--safe-area-inset-right': 'env(safe-area-inset-right, 0px)',
  },
}));

// Mock VKUI adaptivity
vi.mock('@vkontakte/vkui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vkontakte/vkui')>();
  return {
    ...original,
    useAdaptivityConditionalRender: vi.fn(),
  };
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/templates" element={<div>Templates Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('M-LAYOUT (Phase-MOBILE-ADAPT) Safe Area', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLoggerInfo.mockClear();
  });

  it('L11: Mobile safe-area wiring resolves correctly on tabletMinus', () => {
    // Mock mobile viewport
    vi.mocked(useIsMobile).mockReturnValue(true);
    vi.mocked(useSafeAreaInsets).mockReturnValue({
      top: 44,
      bottom: 34,
      left: 10,
      right: 12,
    });
    vi.mocked(useAdaptivityConditionalRender).mockReturnValue({
      viewWidth: {
        tabletMinus: { className: 'mobile-view' },
        tabletPlus: false,
      }
    } as any);

    const { container } = renderLayout();

    // Check (a): AppRoot style contains safe area variables mapping to env
    const appRoot = container.querySelector('.vkuiAppRoot__host');
    expect(appRoot).toBeInTheDocument();
    const inlineStyle = appRoot?.getAttribute('style');
    expect(inlineStyle).toContain('--safe-area-inset-bottom: env(safe-area-inset-bottom');

    // Check (b): Tabbar padding resolves to var(--safe-area-inset-bottom) and has top box shadow
    const tabbar = container.querySelector('.vkuiTabbar__host');
    expect(tabbar).toBeInTheDocument();
    expect((tabbar as HTMLElement).style.paddingBottom).toBe('var(--safe-area-inset-bottom)');
    expect((tabbar as HTMLElement).style.boxShadow).toContain('rgba(0, 0, 0, 0.12)');

    // Check (c): layout content has padding bottom referencing calc(48px + var(--safe-area-inset-bottom))
    const layoutContent = screen.getByTestId('layout-content-templates');
    expect(layoutContent.style.paddingBottom).toBe('calc(48px + var(--safe-area-inset-bottom))');

    // Check T: BLOCK_SAFE_AREA_INSET emitted once with bottom data
    const safeAreaCalls = mockLoggerInfo.mock.calls.filter(call =>
      call[0] === 'AppLayout' && call[1] === 'BLOCK_SAFE_AREA_INSET'
    );
    expect(safeAreaCalls.length).toBe(1);
    expect(safeAreaCalls[0][3]).toEqual(expect.objectContaining({ bottom: 34 }));
  });

  it('L12: Desktop regression oracle hides Tabbar and keeps layout clean on tabletPlus', () => {
    // Mock desktop viewport
    vi.mocked(useIsMobile).mockReturnValue(false);
    vi.mocked(useSafeAreaInsets).mockReturnValue({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    vi.mocked(useAdaptivityConditionalRender).mockReturnValue({
      viewWidth: {
        tabletMinus: false,
        tabletPlus: { className: 'desktop-view' },
      }
    } as any);

    renderLayout();

    // Tabbar should not be rendered
    const tabbars = document.querySelectorAll('.vkuiTabbar');
    expect(tabbars.length).toBe(0);

    // Sidebar should be rendered
    const sidebar = screen.getByTestId('layout-sidebar-nav');
    expect(sidebar).toBeInTheDocument();

    // Content should not have inline safe area padding
    const layoutContent = screen.getByTestId('layout-content-templates');
    expect(layoutContent.style.paddingBottom).toBe('');

    // BLOCK_SAFE_AREA_INSET must NOT fire on desktop
    const safeAreaCalls = mockLoggerInfo.mock.calls.filter(call =>
      call[0] === 'AppLayout' && call[1] === 'BLOCK_SAFE_AREA_INSET'
    );
    expect(safeAreaCalls.length).toBe(0);
  });
});
