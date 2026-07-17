// FILE: packages/web/src/modules/communities/CollapsibleCategoryGroup.tsx
// VERSION: 2.2.0
// START_MODULE_CONTRACT
//   PURPOSE: UI component rendering a collapsible category group matching Screenshot_28
//   SCOPE: Presentational collapsible category group layout
//   DEPENDS: @vkontakte/icons, @/shared/logger, ./types
//   LINKS: M-COMMUNITIES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CollapsibleCategoryGroup - Accordion wrapper that can be collapsed/expanded
//   CollapsibleCategoryGroupProps - Props interface for CollapsibleCategoryGroup
//   clearCollapsibleCategoryCache - Function to clear global collapsible category cache
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.2.0 - Remove 'authors' category and star icon references]
// END_CHANGE_SUMMARY

import React, { useState } from 'react';
import { Icon28ChevronDownOutline, Icon28ChevronUpOutline, Icon28LockOutline } from '@vkontakte/icons';
import { createLogger } from '@/shared/logger';
import type { CommunityCategory } from './types';

const logger = createLogger('Communities');

export interface CollapsibleCategoryGroupProps {
  category: CommunityCategory;
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

// START_CONTRACT: CollapsibleCategoryGroup
//   PURPOSE: Collapsible container rendering a category group with toggle button
//   INPUTS: { CollapsibleCategoryGroupProps }
//   OUTPUTS: JSX.Element — Accordion element
//   SIDE_EFFECTS: Logs category toggle actions with BLOCK_COLLAPSE_TOGGLE log marker
//   LINKS: M-COMMUNITIES
// END_CONTRACT: CollapsibleCategoryGroup

let globalOpenStates: Record<string, boolean> = {};
const collapsibleListeners = new Set<() => void>();
const notifyCollapsibleListeners = () => collapsibleListeners.forEach(l => l());

export function clearCollapsibleCategoryCache() {
  globalOpenStates = {};
  collapsibleListeners.clear();
}

export function CollapsibleCategoryGroup({
  category,
  label,
  defaultOpen = false,
  children,
}: CollapsibleCategoryGroupProps) {
  const [isOpen, setIsOpenState] = useState(() => {
    if (globalOpenStates[category] !== undefined) {
      return globalOpenStates[category];
    }
    return defaultOpen;
  });

  React.useEffect(() => {
    const handleUpdate = () => {
      if (globalOpenStates[category] !== undefined) {
        setIsOpenState(globalOpenStates[category]);
      }
    };
    collapsibleListeners.add(handleUpdate);
    return () => {
      collapsibleListeners.delete(handleUpdate);
    };
  }, [category]);

  const handleToggle = () => {
    const nextState = !isOpen;
    globalOpenStates[category] = nextState;
    setIsOpenState(nextState);
    notifyCollapsibleListeners();

    const _logMarker = "[Communities][CollapsibleCategoryGroup][BLOCK_COLLAPSE_TOGGLE]";
    logger.info('CollapsibleCategoryGroup', 'BLOCK_COLLAPSE_TOGGLE', `Category toggled: category=${category}, open=${nextState}`, {
      category,
      open: nextState,
    });
  };

  const hasLock = category === 'closed';

  return (
    <div
      className={`collapsible-category-group ${isOpen ? 'collapsible-category-group--open' : ''}`}
      data-testid={`category-${category}`}
    >
      <button
        type="button"
        className="category-header-btn"
        onClick={handleToggle}
        aria-expanded={isOpen}
        data-testid={`category-toggle-${category}`}
      >
        <span className="category-header-btn__title-wrapper">
          {hasLock && <Icon28LockOutline className="category-header-btn__lock-icon" />}
          <span className="category-header-btn__title">{label}</span>
        </span>
        {isOpen ? (
          <Icon28ChevronUpOutline className="category-header-btn__chevron" />
        ) : (
          <Icon28ChevronDownOutline className="category-header-btn__chevron" />
        )}
      </button>
      {isOpen && <div className="category-group-content">{children}</div>}
    </div>
  );
}
