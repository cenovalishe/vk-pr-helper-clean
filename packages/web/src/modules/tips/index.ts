// FILE: packages/web/src/modules/tips/index.ts
// VERSION: 2.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Public barrel re-exports for M-TIPS module
//   SCOPE: Single entry point exposing TipsPage, FaqAccordion, and FeaturedCommunities
//   DEPENDS: ./TipsPage, ./FaqAccordion, ./FeaturedCommunities
//   LINKS: M-TIPS
//   ROLE: BARREL
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TipsPage - Tips page container component
//   FaqAccordion - FAQ list with expandable answers
//   FeaturedCommunities - List of featured communities
// END_MODULE_MAP

export { TipsPage } from './TipsPage';
export { FaqAccordion } from './FaqAccordion';
export { FeaturedCommunities } from './FeaturedCommunities';

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.0.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v2.0.0 - Export TipsPage, FaqAccordion, and FeaturedCommunities barrel symbols]
// END_CHANGE_SUMMARY
