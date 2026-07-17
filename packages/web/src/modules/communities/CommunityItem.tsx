// FILE: packages/web/src/modules/communities/CommunityItem.tsx
// VERSION: 2.5.0
// START_MODULE_CONTRACT
//   PURPOSE: UI component rendering a single community row with avatar, optional "это мы" badge, and selection checkmark
//   SCOPE: Presentational UI cell component
//   DEPENDS: @vkontakte/icons, @vkontakte/vkui, @/shared/logger, ./types
//   LINKS: M-COMMUNITIES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CommunityItem - Renders a community list item row
//   CommunityItemProps - Props interface for CommunityItem
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.5.0 - Add selectedId prop for blue selection highlight and Icon20CheckCircleOn checkmark; add ContentBadge for isOurs communities]
// END_CHANGE_SUMMARY

import React from 'react';
import { Icon28LinkOutline, Icon20CheckCircleOn } from '@vkontakte/icons';
import { ContentBadge } from '@vkontakte/vkui';
import { createLogger } from '@/shared/logger';
import { useIsMobile } from '../adaptive';
import type { Community } from './types';

const logger = createLogger('Communities');

export interface CommunityItemProps {
  community: Community;
  avatarUrl?: string;
  onSelect: (community: Community) => void;
  selectedId?: string | null;
}

// START_CONTRACT: CommunityItem
//   PURPOSE: Render a community row with Avatar, "это мы" badge if ours, checkmark if selected, and separate VK page link
//   INPUTS: { CommunityItemProps }
//   OUTPUTS: JSX.Element — Community list row
//   SIDE_EFFECTS: Logs selection, link click, selection flip, and avatar render events
//   LINKS: M-COMMUNITIES
// END_CONTRACT: CommunityItem

export function CommunityItem({ community, avatarUrl, onSelect, selectedId }: CommunityItemProps) {
  const isMobile = useIsMobile();
  const isSelected = community.id === selectedId;

  // Log on selection-changed-highlight
  const prevSelectedRef = React.useRef(isSelected);
  React.useEffect(() => {
    if (prevSelectedRef.current !== isSelected) {
      const _logMarker4 = "[Communities][CommunityItem][BLOCK_SELECTED_RENDER]";
      logger.debug('CommunityItem', 'BLOCK_SELECTED_RENDER', `Selection highlight flipped for ${community.id}: isSelected=${isSelected}`, {
        id: community.id,
        isSelected,
      });
      prevSelectedRef.current = isSelected;
    }
  }, [isSelected, community.id]);

  // Required log marker: [Communities][CommunityItem][BLOCK_RENDER_AVATAR]
  const _logMarker1 = "[Communities][CommunityItem][BLOCK_RENDER_AVATAR]";
  logger.debug('CommunityItem', 'BLOCK_RENDER_AVATAR', `Rendering avatar for community ${community.id}`, {
    vkId: community.id,
    hasAvatar: !!avatarUrl,
  });

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const _logMarker2 = "[Communities][CommunityItem][BLOCK_OPEN_VK_LINK]";
    logger.info('CommunityItem', 'BLOCK_OPEN_VK_LINK', `Opening community VK URL in new tab: ${community.vkUrl}`, {
      vkUrl: community.vkUrl,
    });
  };

  const handleRowClick = () => {
    if (community.suggestDisabled) {
      return;
    }
    const _logMarker3 = "[Communities][CommunityItem][BLOCK_SELECT_COMMUNITY]";
    logger.info('CommunityItem', 'BLOCK_SELECT_COMMUNITY', `Selected community row: ${community.name}`, {
      id: community.id,
      name: community.name,
      vkUrl: community.vkUrl,
      category: community.category,
    });
    onSelect(community);
  };

  const initials = community.name ? community.name.trim().charAt(0).toUpperCase() : '?';

  const isSelectable = !community.suggestDisabled;

  const baseRowStyle: React.CSSProperties = !isSelectable ? { opacity: 0.5, cursor: 'default' } : {};
  const rowStyle: React.CSSProperties = isMobile ? { ...baseRowStyle, padding: '4px 6px' } : baseRowStyle;

  return (
    <div
      onClick={handleRowClick}
      data-testid={`community-${community.id}`}
      className={`community-item-row ${!isSelectable ? 'community-item-row--disabled' : ''} ${community.isOurs ? 'community-item-row--ours' : ''} ${isSelected ? 'community-item-row--selected' : ''}`}
      style={Object.keys(rowStyle).length > 0 ? rowStyle : undefined}
    >
      <div className="community-item__left">
        <div
          className="community-avatar"
          data-testid={`community-avatar-${community.id}`}
          style={isMobile ? { width: '28px', height: '28px' } : undefined}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="community-avatar__img" />
          ) : (
            <span className="community-avatar__initials">{initials}</span>
          )}
        </div>
        <span
          className="community-item__name"
          style={isMobile ? { fontSize: '13px' } : undefined}
        >
          {community.name}
        </span>
        {community.isOurs && (
          <ContentBadge
            appearance="accent"
            mode="secondary"
            size="s"
            data-testid={`community-ours-hint-${community.id}`}
          >
            это мы
          </ContentBadge>
        )}
        {community.suggestDisabled && (
          <span className="community-item__hint" data-testid={`community-hint-${community.id}`}>
            без предложки
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {isSelected && (
          <Icon20CheckCircleOn
            data-testid={`community-checkmark-${community.id}`}
            style={{ color: 'var(--vkui--color_icon_accent, #2688eb)', width: 20, height: 20 }}
          />
        )}
        <a
          href={community.vkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLinkClick}
          aria-label={`Открыть страницу ${community.name} ВКонтакте`}
          data-testid={`community-link-${community.id}`}
          className="community-item__link"
        >
          <Icon28LinkOutline className="community-item__link-icon" />
        </a>
      </div>
    </div>
  );
}
