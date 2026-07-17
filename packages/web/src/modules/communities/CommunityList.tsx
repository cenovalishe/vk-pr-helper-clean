// FILE: packages/web/src/modules/communities/CommunityList.tsx
// VERSION: 1.4.0
// START_MODULE_CONTRACT
//   PURPOSE: UI component rendering category-grouped community list with click selection
//   SCOPE: Presentational component consuming static community data
//   DEPENDS: @vkontakte/icons, @/shared/logger, ./data, ./types
//   LINKS: M-COMMUNITIES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CommunityList - React component rendering communities grouped by category
//   CommunityListProps - Props interface for CommunityList component
//   clearCommunityListScrollCache - Function to clear global community list scroll cache
// END_MODULE_MAP

import React from 'react';
import { createLogger } from '@/shared/logger';
import { getCommunities, CATEGORY_LABELS, CATEGORY_ORDER, CLOSED_DISCLAIMER } from './data';
import type { Community, CommunityCategory } from './types';
import { useCommunityAvatars } from './avatars';
import { CollapsibleCategoryGroup } from './CollapsibleCategoryGroup';
import { CommunityItem } from './CommunityItem';
import { Icon20WarningTriangleOutline } from '@vkontakte/icons';
import './communities.css';

const logger = createLogger('Communities');

// START_CONTRACT: CommunityListProps
//   PURPOSE: Props for the CommunityList component
//   INPUTS: { category?: CommunityCategory, onSelect: (community: Community) => void, selectedId?: string | null }
//   OUTPUTS: none (prop type)
//   SIDE_EFFECTS: none
//   LINKS: M-COMMUNITIES
// END_CONTRACT: CommunityListProps
export interface CommunityListProps {
  /** Optional filter to show only one category */
  category?: CommunityCategory;
  /** Callback invoked when a community item is clicked */
  onSelect: (community: Community) => void;
  selectedId?: string | null;
}

// START_CONTRACT: CommunityList
//   PURPOSE: Render communities grouped by category with click-to-select behaviour and selection checkmark propagation
//   INPUTS: { CommunityListProps }
//   OUTPUTS: { JSX.Element }
//   SIDE_EFFECTS: Calls onSelect callback on community click; fetches avatars
//   LINKS: M-COMMUNITIES, M-COMMUNITIES-AVATARS
// END_CONTRACT: CommunityList

let globalScrollTop = 0;

export function clearCommunityListScrollCache() {
  globalScrollTop = 0;
}

// START_BLOCK_COMMUNITY_LIST_COMPONENT
export const CommunityList: React.FC<CommunityListProps> = ({ category, onSelect, selectedId }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;

    const restoreScroll = () => {
      if (el.scrollTop !== globalScrollTop) {
        el.scrollTop = globalScrollTop;
      }
    };

    // Restore initially
    restoreScroll();

    // Setup ResizeObserver to restore scroll position when container or content size changes
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        restoreScroll();
      });
      resizeObserver.observe(el);
      resizeObserver.observe(inner);
    }

    const handleScroll = () => {
      globalScrollTop = el.scrollTop;
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  const categoriesToRender: CommunityCategory[] = category
    ? [category]
    : [...CATEGORY_ORDER];

  // Get all communities to extract VK screen names
  const allCommunities = getCommunities();

  // Extract VK screen names for fetching avatars
  const screenNames = allCommunities.map(c => c.shortName);

  // Hook for batch-fetching avatars
  const { avatars } = useCommunityAvatars(screenNames);

  // START_BLOCK_RENDER_CATEGORY_GROUP
  const renderCategoryGroup = (cat: CommunityCategory) => {
    const communities = getCommunities(cat);

    return (
      <CollapsibleCategoryGroup
        key={cat}
        category={cat}
        label={CATEGORY_LABELS[cat]}
      >
        {cat === 'closed' && (
          <div
            className="community-category__disclaimer"
            data-testid="closed-disclaimer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              color: 'var(--vkui--color_text_subhead)',
              fontSize: 13,
            }}
          >
            <Icon20WarningTriangleOutline
              style={{ color: 'var(--vkui--color_icon_negative, #ff3b30)', flexShrink: 0 }}
            />
            <span>{CLOSED_DISCLAIMER}</span>
          </div>
        )}
        <div className="community-category__items">
          {communities.map((community) => {
            const avatarUrl = avatars.get(community.shortName);

            return (
              <CommunityItem
                key={community.id}
                community={community}
                avatarUrl={avatarUrl}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            );
          })}
        </div>
      </CollapsibleCategoryGroup>
    );
  };
  // END_BLOCK_RENDER_CATEGORY_GROUP

  return (
    <div ref={containerRef} className="community-list" data-testid="community-list">
      <div ref={innerRef} className="community-list-inner">
        {categoriesToRender.map(renderCategoryGroup)}
      </div>
    </div>
  );
};
// END_BLOCK_COMMUNITY_LIST_COMPONENT

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.4.0 - Add selectedId prop to CommunityList and thread it to CommunityItem; clean up authors category logic]
// END_CHANGE_SUMMARY
