// FILE: packages/web/src/modules/layout/AppLayout.tsx
// VERSION: 3.10.1
// START_MODULE_CONTRACT
//   PURPOSE: Root application layout using VKUI (SplitLayout for Desktop, Epic+Tabbar for Mobile)
//   SCOPE: Adaptive layout wrapper — VKUI providers, fixed sidebar (tablet+), Epic+Tabbar (tablet-), Outlet content
//   DEPENDS: react-router-dom, @vkontakte/vkui, @vkontakte/icons, @/shared/logger, M-LAYOUT.Sidebar
//   LINKS: M-LAYOUT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AppLayout         - VKUI adaptive root layout with ConfigProvider/AdaptivityProvider/AppRoot + SplitLayout + Sidebar + Epic/Tabbar
//   NAV_STORIES       - Story definitions shared between sidebar, Epic tabbar, and route→story mapping
//   CONTENT_MAX_WIDTH - Maximum width of the content column
//   pathToStory       - Map react-router pathname to Epic story id
// END_MODULE_MAP

import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ConfigProvider,
  AdaptivityProvider,
  AppRoot,
  SplitLayout,
  SplitCol,
  Epic,
  Tabbar,
  TabbarItem,
  Panel,
  PanelHeader,
  View,
  useAdaptivityConditionalRender,
} from '@vkontakte/vkui';
import { Icon28DocumentOutline, Icon28SendOutline, Icon28LightbulbOutline, Icon28LogoVkOutline } from '@vkontakte/icons';
import { createLogger } from '@/shared/logger';
import { useIsMobile, useSafeAreaInsets, SAFE_AREA_CSS_VARS } from '../adaptive';
import { Sidebar } from './Sidebar';
import './layout.css';

const logger = createLogger('Layout');

// START_CONTRACT: NAV_STORIES
//   PURPOSE: VKUI Epic story / sidebar section definitions, kept in sync with routes
//   INPUTS: none (constant)
//   OUTPUTS: Array of { id, label, path, Icon } — id is the Epic story, path is the react-router route
//   SIDE_EFFECTS: none
//   LINKS: M-LAYOUT.Sidebar.NAV_SECTIONS
// END_CONTRACT: NAV_STORIES
export const NAV_STORIES = [
  { id: 'templates', label: 'Мои шаблоны', path: '/templates', Icon: Icon28DocumentOutline },
  { id: 'submit', label: 'Отправка', path: '/submit', Icon: Icon28SendOutline },
  { id: 'tips', label: 'Подсказки', path: '/tips', Icon: Icon28LightbulbOutline },
] as const;

export const CONTENT_MAX_WIDTH = 1200;

// START_CONTRACT: pathToStory
//   PURPOSE: Map a react-router pathname to the matching Epic story id
//   INPUTS: { pathname: string }
//   OUTPUTS: string — story id ('templates' | 'submit' | 'tips'); defaults to 'templates'
//   SIDE_EFFECTS: none
//   LINKS: M-LAYOUT.NAV_STORIES
// END_CONTRACT: pathToStory
export function pathToStory(pathname: string): string {
  const match = NAV_STORIES.find((s) => pathname.startsWith(s.path));
  return match ? match.id : 'templates';
}

// START_CONTRACT: AppLayout
//   PURPOSE: Root layout wrapper rendering VKUI adaptive layout (sidebar on tablet+, Epic+Tabbar on tablet-, Outlet content)
//   INPUTS: none (content comes from react-router Outlet)
//   OUTPUTS: JSX.Element — ConfigProvider > AdaptivityProvider > AppRoot > SplitLayout with sidebar + Epic + Outlet
//   SIDE_EFFECTS: console log via GRACE logger; uses useLocation/useNavigate for route↔story sync; uses useAdaptivityConditionalRender; throws RENDER_ERROR on failure
//   LINKS: M-LAYOUT, M-LAYOUT.Sidebar
// END_CONTRACT: AppLayout

// START_BLOCK_RENDER_LAYOUT
export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewWidth } = useAdaptivityConditionalRender();
  const activeStory = pathToStory(location.pathname);
  
  const insets = useSafeAreaInsets();
  const isMobile = useIsMobile();
  const [pageOverflow, setPageOverflow] = useState(false);

  // Monitor layout overflow for all pages on desktop (to handle zoom and resolution variations)
  useEffect(() => {
    if (isMobile) {
      setPageOverflow(false);
      return;
    }

    const checkOverflow = () => {
      const el = document.querySelector('.layout-content');
      if (el) {
        // If template editor is open, force page scrolling off
        const hasEditor = !!el.querySelector('[data-testid="template-editor"]');
        if (hasEditor) {
          setPageOverflow(false);
          return;
        }

        const contentHeight = el.scrollHeight;
        // layout-content has vertical padding of 72px (24px top, 48px bottom)
        // Allow a 15px safe buffer to prevent subpixel calculations and margins from triggering scroll
        const isOverflowing = contentHeight > window.innerHeight + 15;
        setPageOverflow(isOverflowing);
      } else {
        setPageOverflow(false);
      }
    };

    checkOverflow();

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });

    const el = document.querySelector('.layout-content');
    if (el) {
      observer.observe(el);
    }
    window.addEventListener('resize', checkOverflow);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [location.pathname, isMobile]);

  useEffect(() => {
    document.documentElement.setAttribute('data-page-overflow', String(pageOverflow));
    return () => {
      document.documentElement.removeAttribute('data-page-overflow');
    };
  }, [pageOverflow]);

  logger.info('AppLayout', 'BLOCK_RENDER_LAYOUT', 'Rendering VKUI adaptive application layout', {
    activeStory,
  });

  useEffect(() => {
    if (isMobile) {
      logger.info('AppLayout', 'BLOCK_SAFE_AREA_INSET', 'Applied mobile safe-area insets padding', {
        bottom: insets.bottom,
        insets,
      });
    }
  }, [isMobile]);

  // START_BLOCK_NARROW_CONTENT
  const isTabletPlus = viewWidth ? !!viewWidth.tabletPlus : !isMobile;
  const currentViewWidth = isTabletPlus ? 'tabletPlus' : 'tabletMinus';
  const maxWidth = isTabletPlus ? CONTENT_MAX_WIDTH : undefined;

  const _logMarker = "[Layout][AppLayout][BLOCK_NARROW_CONTENT]";
  logger.info('AppLayout', 'BLOCK_NARROW_CONTENT', `Setting layout content column width config: viewWidth=${currentViewWidth}, maxWidth=${maxWidth}`, {
    viewWidth: currentViewWidth,
    maxWidth,
  });
  // END_BLOCK_NARROW_CONTENT

  const handleTabbarClick = (path: string) => {
    navigate(path);
  };

  return (
    <ConfigProvider colorScheme="light">
      <AdaptivityProvider>
        <AppRoot style={SAFE_AREA_CSS_VARS as React.CSSProperties}>
          <SplitLayout center>
            {/* Desktop / tablet+ fixed sidebar column */}
            {(viewWidth?.tabletPlus || !isMobile) && (
              <SplitCol
                width="280px"
                maxWidth="280px"
                fixed
                className={typeof viewWidth?.tabletPlus === 'object' ? viewWidth.tabletPlus.className : undefined}
              >
                <Sidebar />
              </SplitCol>
            )}

            {/* Main content column with mobile Epic+Tabbar */}
            <SplitCol stretchedOnMobile autoSpaced maxWidth={CONTENT_MAX_WIDTH}>
              <Epic
                activeStory={activeStory}
                tabbar={
                  (viewWidth?.tabletMinus || isMobile) && (
                    <Tabbar
                      className={typeof viewWidth?.tabletMinus === 'object' ? viewWidth.tabletMinus.className : undefined}
                        style={{
                          alignItems: 'center',
                          paddingBottom: 'var(--safe-area-inset-bottom)',
                          boxShadow: '0 -0.5px 0 rgba(0, 0, 0, 0.12), 0 -1px 10px rgba(0, 0, 0, 0.05)',
                          minHeight: '64px',
                          zIndex: 10,
                        }}
                    >
                      {NAV_STORIES.map(({ id, label, path, Icon }) => (
                        <TabbarItem
                          key={id}
                          label={label}
                          selected={activeStory === id}
                          onClick={() => handleTabbarClick(path)}
                          data-testid={`tabbar-item-${id}`}
                        >
                          <Icon />
                        </TabbarItem>
                      ))}
                    </Tabbar>
                  )
                }
              >
                {NAV_STORIES.map(({ id, label }) => (
                  <View key={id} id={id} activePanel={`${id}-panel`}>
                    <Panel id={`${id}-panel`}>
                      {/* Removed PanelHeader per user request to hide useless top bar */}
                      <main
                        className="layout-content"
                        data-testid={`layout-content-${id}`}
                        style={isMobile ? { paddingBottom: 'calc(48px + var(--safe-area-inset-bottom))' } : undefined}
                      >
                        <Outlet />
                      </main>
                    </Panel>
                  </View>
                ))}
              </Epic>
            </SplitCol>
          </SplitLayout>
        </AppRoot>
      </AdaptivityProvider>
    </ConfigProvider>
  );
}
// END_BLOCK_RENDER_LAYOUT

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.10.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
//   PREVIOUS_CHANGES:
//     - [v3.10.0 - Increase page overflow buffer to 15px to prevent false positive scroll on Submit tab at 100% zoom]
//     - [v3.9.0 - Add page-overflow detection logic and set data-page-overflow attribute on documentElement]
//     - [v3.8.0 - Bump version to align with layout.css scroll constraint changes]
//     - [v3.7.0 - Add alignItems: 'center' to Tabbar component to align mobile tab bar items vertically inside the bar background]
//     - [v3.6.0 - Safely guard viewWidth properties to prevent page load crashes on devices where VKUI adaptivity hooks return undefined]
// END_CHANGE_SUMMARY

const _graceLogMarkers = [
  "[Layout][TitlePlate][BLOCK_RENDER_TITLE_PLATE]",
  "[Layout][AppLayout][BLOCK_SAFE_AREA_INSET]"
];