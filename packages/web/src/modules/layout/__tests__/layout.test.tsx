// FILE: packages/web/src/modules/layout/__tests__/layout.test.tsx
// VERSION: 3.5.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-LAYOUT Phase-4 VKUI refactor and desktop scroll-lock constraints
//   SCOPE: L-1 through L-6, and L-13 through L-18 scroll-lock scenarios against VKUI SplitLayout/Epic/Sidebar and layout.css
//   DEPENDS: M-LAYOUT.AppLayout, M-LAYOUT.Sidebar, M-LAYOUT.NAV_STORIES, M-LAYOUT.pathToStory
//   LINKS: M-LAYOUT, VerificationPlan.V-M-LAYOUT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   renderWithRoutes - helper to render AppLayout with MemoryRouter routes at a given path
//   NAV_TESTS        - shared expectations about the 3 nav sections
// END_MODULE_MAP

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AppLayout, CONTENT_MAX_WIDTH } from '../AppLayout';
import { Sidebar } from '../Sidebar';
import { NAV_STORIES, pathToStory } from '../AppLayout';

// Mock the logger so console output doesn't clutter tests
vi.mock('@/shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const SECTION_LABELS = ['Мои шаблоны', 'Отправка', 'Подсказки'] as const;

/** Helper: render AppLayout with routes at a given path */
function renderWithRoutes(initialPath = '/submit') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/submit" replace />} />
          <Route path="/templates" element={<div>Templates Content</div>} />
          <Route path="/submit" element={<div>Submit Content</div>} />
          <Route path="/tips" element={<div>Tips Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('M-LAYOUT (Phase-4 VKUI)', () => {
  // L-1: Sidebar renders 3 sections
  it('L-1: Sidebar renders 3 sections: «Мои шаблоны», «Отправка», «Подсказки»', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    for (const label of SECTION_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // Exactly 3 sidebar links via data-testid
    const nav = screen.getByTestId('layout-sidebar-nav');
    const links = nav.querySelectorAll('[data-testid^="sidebar-link-"]');
    expect(links).toHaveLength(3);
  });

  // L-2: Route /templates renders content
  it('L-2: Route /templates renders content in layout', () => {
    renderWithRoutes('/templates');

    expect(screen.getByText('Templates Content')).toBeInTheDocument();
    // Sidebar/tabbar renders the section label(s) — at least one occurrence required
    expect(screen.getAllByText('Мои шаблоны').length).toBeGreaterThan(0);
  });

  // L-3: Route /submit renders content
  it('L-3: Route /submit renders content in layout', () => {
    renderWithRoutes('/submit');

    expect(screen.getByText('Submit Content')).toBeInTheDocument();
    expect(screen.getAllByText('Отправка').length).toBeGreaterThan(0);
  });

  // L-4: Route /tips renders content
  it('L-4: Route /tips renders content in layout', () => {
    renderWithRoutes('/tips');

    expect(screen.getByText('Tips Content')).toBeInTheDocument();
    expect(screen.getAllByText('Подсказки').length).toBeGreaterThan(0);
  });

  // L-5: Active section highlighted (active class)
  it('L-5: Active section gets active class on its NavLink', () => {
    render(
      <MemoryRouter initialEntries={['/submit']}>
        <Sidebar />
      </MemoryRouter>,
    );

    const submitLink = screen.getByTestId('sidebar-link-submit');
    expect(submitLink.className).toContain('layout-sidebar__link--active');

    const templatesLink = screen.getByTestId('sidebar-link-templates');
    expect(templatesLink.className).not.toContain('layout-sidebar__link--active');
  });

  // L-6: Default route / redirects to /submit
  it('L-6: Default route / redirects to /submit', () => {
    renderWithRoutes('/');

    expect(screen.getByText('Submit Content')).toBeInTheDocument();

    const submitLink = screen.getByTestId('sidebar-link-submit');
    expect(submitLink.className).toContain('layout-sidebar__link--active');
  });

  // ── Phase-4 VKUI-specific checks ─────────────────────────────────────────

  it('P4-1: NAV_STORIES exposes 3 stories with id, label, path, and Icon', () => {
    expect(NAV_STORIES).toHaveLength(3);
    for (const story of NAV_STORIES) {
      expect(typeof story.id).toBe('string');
      expect(typeof story.label).toBe('string');
      expect(typeof story.path).toBe('string');
      expect(story.path.startsWith('/')).toBe(true);
      expect(story.Icon).toBeDefined();
    }
  });

  it('P4-2: pathToStory maps /submit -> submit, /tips -> tips, defaults to templates', () => {
    expect(pathToStory('/submit')).toBe('submit');
    expect(pathToStory('/tips')).toBe('tips');
    expect(pathToStory('/templates')).toBe('templates');
    expect(pathToStory('/unknown')).toBe('templates');
    expect(pathToStory('/')).toBe('templates');
  });

  // ── Phase-5 Adaptive constraints ─────────────────────────────────────────

  it('L-8: AppLayout exports CONTENT_MAX_WIDTH constant as 1200', () => {
    expect(CONTENT_MAX_WIDTH).toBe(1200);
  });

  it('L-9: SplitCol for main content has maxWidth constraint applied', () => {
    renderWithRoutes('/templates');

    // Find the main element or content area, then find the ancestor SplitCol
    const content = screen.getByTestId('layout-content-templates');
    expect(content).toBeInTheDocument();

    // The ancestor elements should include the SplitCol element with max-width
    let currentElement: HTMLElement | null = content;
    let foundMaxWidth = false;

    while (currentElement) {
      const style = currentElement.style;
      if (style.maxWidth === '1200px' || style.maxWidth === 'CONTENT_MAX_WIDTH' || currentElement.getAttribute('style')?.includes('max-width: 1200px')) {
        foundMaxWidth = true;
        break;
      }
      currentElement = currentElement.parentElement;
    }

    expect(foundMaxWidth).toBe(true);
  });

  // L-13: layout.css defines selectors to turn off page scroll when template editor is active on desktop
  it('L-13: layout.css contains scroll override rules for templates tab and excludes it when editor is open', () => {
    const fs = require('fs');
    const path = require('path');
    const cssPath = path.resolve(__dirname, '../layout.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    expect(cssContent).toContain('html:has([data-testid="layout-content-templates"]):not(:has([data-testid="template-editor"]))');
    expect(cssContent).toContain('body:has([data-testid="layout-content-templates"]):not(:has([data-testid="template-editor"]))');
    expect(cssContent).toContain('#root:has([data-testid="layout-content-templates"]):not(:has([data-testid="template-editor"]))');
    expect(cssContent).toContain('.layout-content[data-testid="layout-content-templates"]:not(:has([data-testid="template-editor"]))');
  });

  // L-14, L-15, L-16, L-17: layout.css scroll exception and default desktop rules
  it('L-14 to L-17: layout.css contains correct default scroll-lock and exception rules', () => {
    const fs = require('fs');
    const path = require('path');
    const cssPath = path.resolve(__dirname, '../layout.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // Default desktop scroll-lock (L-14)
    expect(cssContent).toContain('overflow-y: hidden !important');
    expect(cssContent).toContain('height: 100vh !important');

    // Nested selectors to override body and #root when html has attributes (L-15)
    expect(cssContent).toContain('html[data-templates-overflow="true"]:not([data-template-editor-open="true"])');
    expect(cssContent).toContain('html[data-templates-overflow="true"]:not([data-template-editor-open="true"]) body');
    expect(cssContent).toContain('html[data-templates-overflow="true"]:not([data-template-editor-open="true"]) #root');

    // Tips first FAQ active exceptions (L-16)
    expect(cssContent).toContain('html[data-first-faq-active="true"]:not([data-template-editor-open="true"])');
    expect(cssContent).toContain('html[data-first-faq-active="true"]:not([data-template-editor-open="true"]) body');
    expect(cssContent).toContain('html[data-first-faq-active="true"]:not([data-template-editor-open="true"]) #root');

    // Page overflow exceptions
    expect(cssContent).toContain('html[data-page-overflow="true"]:not([data-template-editor-open="true"])');
    expect(cssContent).toContain('html[data-page-overflow="true"]:not([data-template-editor-open="true"]) body');
    expect(cssContent).toContain('html[data-page-overflow="true"]:not([data-template-editor-open="true"]) #root');

    // Template editor scroll block (L-17)
    expect(cssContent).toContain('html[data-template-editor-open="true"]');
    expect(cssContent).toContain('html[data-template-editor-open="true"] body');
    expect(cssContent).toContain('html[data-template-editor-open="true"] #root');
  });

  // L-18: AppLayout dynamically sets data-page-overflow attribute based on .layout-content height
  it('L-18: AppLayout dynamically sets data-page-overflow attribute based on layout height and buffer', async () => {
    // Clean up before test
    document.documentElement.removeAttribute('data-page-overflow');

    // Spy on querySelector to fake .layout-content
    const originalQuerySelector = document.querySelector;
    let mockScrollHeight = 1000;
    const querySpy = vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
      if (selector === '.layout-content') {
        return {
          scrollHeight: mockScrollHeight,
          querySelector: () => null, // No editor
        } as any;
      }
      return originalQuerySelector.call(document, selector);
    });

    // 1. Case where scrollHeight (1000) exceeds window.innerHeight (768) + 15
    renderWithRoutes('/submit');
    expect(document.documentElement.getAttribute('data-page-overflow')).toBe('true');

    // Clean up attribute for next check
    document.documentElement.removeAttribute('data-page-overflow');

    // 2. Case where scrollHeight (780) does NOT exceed window.innerHeight (768) + 15
    mockScrollHeight = 780;
    renderWithRoutes('/submit');
    expect(document.documentElement.getAttribute('data-page-overflow')).toBe('false');

    querySpy.mockRestore();
    document.documentElement.removeAttribute('data-page-overflow');
  });
});

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.5.0 - Assert buffer threshold checks in test L-18]
//   PREVIOUS_CHANGES:
//     - [v3.4.0 - Add test L-18 for dynamic page overflow and fix layout.css selector checks]
//     - [v3.3.0 - Add tests L-14 to L-17 checking layout.css for desktop scroll-lock and exception rules]
//     - [v3.2.0 - Add unit test to verify that the template editor presence is detectable on templates layout content]
//     - [v3.1.0 - Phase-6: Update CONTENT_MAX_WIDTH expectation to 1200 in layout tests]
// END_CHANGE_SUMMARY