// FILE: packages/web/src/modules/layout/index.tsx
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Barrel re-exports for M-LAYOUT module
//   SCOPE: Public API surface — AppLayout, Sidebar, NAV_STORIES, pathToStory
//   DEPENDS: M-LAYOUT.AppLayout, M-LAYOUT.Sidebar
//   LINKS: M-LAYOUT
//   ROLE: BARREL
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AppLayout   - Root VKUI adaptive layout wrapper component
//   Sidebar     - VKUI Cell-based section navigation sidebar
//   NAV_STORIES - Story/section definitions (id, label, path, Icon)
//   pathToStory - Map react-router pathname to Epic story id
//   CONTENT_MAX_WIDTH - const
//   NAV_SECTIONS - const
//   CONTENT_MAX_WIDTH - const
//   NAV_SECTIONS - const
// END_MODULE_MAP

export { AppLayout, NAV_STORIES, pathToStory, CONTENT_MAX_WIDTH } from './AppLayout';
export { Sidebar, NAV_SECTIONS } from './Sidebar';

// Log marker: [Layout][Sidebar][BLOCK_RENDER_LAYOUT]
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.1.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v3.1.0 - Phase-6: Remove unused TitlePlate export]
// END_CHANGE_SUMMARY
// GRACE_MARKER: [Layout][TitlePlate][BLOCK_RENDER_TITLE_PLATE]

const _graceLogMarkers = [
  "[Layout][TitlePlate][BLOCK_RENDER_TITLE_PLATE]"
];
