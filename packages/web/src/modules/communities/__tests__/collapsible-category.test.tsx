// FILE: packages/web/src/modules/communities/__tests__/collapsible-category.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for CollapsibleCategoryGroup component
//   SCOPE: Unit testing collapsible category toggling and cache behavior
//   DEPENDS: M-COMMUNITIES
//   LINKS: V-M-COMMUNITIES
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - test files do not export runtime symbols
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial test suite for CollapsibleCategoryGroup component]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CollapsibleCategoryGroup, clearCollapsibleCategoryCache } from '../CollapsibleCategoryGroup';

// Mock the logger
vi.mock('@/shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('CollapsibleCategoryGroup Component', () => {
  beforeEach(() => {
    clearCollapsibleCategoryCache();
  });

  it('renders category name and is collapsed by default', () => {
    render(
      <CollapsibleCategoryGroup
        category="general"
        label="Общие"
      >
        <div data-testid="child">General content</div>
      </CollapsibleCategoryGroup>
    );

    expect(screen.getByText('Общие')).toBeInTheDocument();
    expect(screen.getByTestId('category-toggle-general')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('renders open when defaultOpen is true', () => {
    render(
      <CollapsibleCategoryGroup
        category="general"
        label="Общие"
        defaultOpen={true}
      >
        <div data-testid="child">General content</div>
      </CollapsibleCategoryGroup>
    );

    expect(screen.getByTestId('category-toggle-general')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('toggles open state on button click', async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleCategoryGroup
        category="general"
        label="Общие"
      >
        <div data-testid="child">General content</div>
      </CollapsibleCategoryGroup>
    );

    const toggleBtn = screen.getByTestId('category-toggle-general');
    await user.click(toggleBtn);

    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('child')).toBeInTheDocument();

    await user.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });
});
