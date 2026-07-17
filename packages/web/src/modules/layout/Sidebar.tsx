// FILE: packages/web/src/modules/layout/Sidebar.tsx
// VERSION: 3.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Left sidebar component rendering navigation to core sections and handling submit error display
//   SCOPE: Presentational UI rendering outline-capsule active-state highlight navigation items and local error subscription
//   DEPENDS: react, react-router-dom, @vkontakte/vkui, @vkontakte/icons, @/shared/logger, M-LAYOUT.AppLayout.NAV_STORIES
//   LINKS: M-LAYOUT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Sidebar        - Left sidebar navigation component with outline styled active states and error banner
//   NAV_SECTIONS   - Legacy alias of NAV_STORIES kept for backward compatibility
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.1.0 - Add event subscription for form submit errors to render error banner under navigation links on desktop]
// END_CHANGE_SUMMARY

import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Panel } from '@vkontakte/vkui';
import { Icon28DocumentOutline, Icon28SendOutline, Icon28LightbulbOutline } from '@vkontakte/icons';
import { createLogger } from '@/shared/logger';

const logger = createLogger('Layout');

// START_CONTRACT: NAV_SECTIONS
//   PURPOSE: Navigation section definitions for sidebar links (kept in sync with AppLayout.NAV_STORIES)
//   INPUTS: none (constant)
//   OUTPUTS: Array of { id, label, path, Icon } objects
//   SIDE_EFFECTS: none
//   LINKS: M-LAYOUT.AppLayout.NAV_STORIES
// END_CONTRACT: NAV_SECTIONS
export const NAV_SECTIONS = [
  { id: 'templates', label: 'Мои шаблоны', path: '/templates', Icon: Icon28DocumentOutline },
  { id: 'submit', label: 'Отправка', path: '/submit', Icon: Icon28SendOutline },
  { id: 'tips', label: 'Подсказки', path: '/tips', Icon: Icon28LightbulbOutline },
] as const;

// START_CONTRACT: Sidebar
//   PURPOSE: Section navigation sidebar rendering 3 navigation items with active state outline and optional error banner
//   INPUTS: none
//   OUTPUTS: JSX.Element — VKUI Panel with styled navigation links and error banner
//   SIDE_EFFECTS: console log via GRACE logger; registers submit-error-change listener
//   LINKS: M-LAYOUT
// END_CONTRACT: Sidebar

// START_BLOCK_RENDER_SIDEBAR
export function Sidebar() {
  const _logMarker = "[Layout][Sidebar][BLOCK_RENDER_LAYOUT]";
  logger.info('Sidebar', 'BLOCK_RENDER_LAYOUT', 'Rendering sidebar navigation');

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleErr = (e: Event) => {
      const customEvent = e as CustomEvent;
      setError(customEvent.detail);
    };
    window.addEventListener('submit-error-change', handleErr);
    return () => {
      window.removeEventListener('submit-error-change', handleErr);
    };
  }, []);

  return (
    <Panel id="layout-sidebar">
      <nav aria-label="Основная навигация" data-testid="layout-sidebar-nav" className="layout-sidebar-nav">
        {NAV_SECTIONS.map(({ id, label, path, Icon }) => (
          <NavLink
            key={id}
            to={path}
            className={({ isActive }) =>
              isActive ? 'layout-sidebar__link layout-sidebar__link--active' : 'layout-sidebar__link'
            }
            data-testid={`sidebar-link-${id}`}
          >
            <div className="layout-sidebar__item">
              <Icon className="layout-sidebar__icon" />
              <span className="layout-sidebar__label">{label}</span>
            </div>
          </NavLink>
        ))}
      </nav>
      {error && (
        <div className="submit-error-banner submit-error-banner--sidebar">
          <span className="submit-error-banner__title">Ошибка отправки:</span>
          <div className="submit-error-banner__subtitle">{error}</div>
        </div>
      )}
    </Panel>
  );
}
// END_BLOCK_RENDER_SIDEBAR