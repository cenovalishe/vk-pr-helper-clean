// FILE: packages/web/src/modules/communities/index.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Public barrel re-exports for M-COMMUNITIES module
//   SCOPE: Single entry point exposing CommunityList, getCommunities, types
//   DEPENDS: ./CommunityList, ./data, ./types
//   LINKS: M-COMMUNITIES
//   ROLE: BARREL
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CommunityList - React component rendering communities grouped by category
//   clearCommunityListScrollCache - Function to clear the community list scroll cache
//   CommunityListProps - Props for CommunityList component
//   getCommunities - Community catalog accessor function
//   COMMUNITIES - Array of community records
//   CATEGORY_LABELS - Map of category display strings
//   CATEGORY_ORDER - Ordering of categories
//   CLOSED_DISCLAIMER - Disclaimer text for closed communities
//   Community - Community record interface
//   CommunityCategory - Community category enum union
//   useCommunityAvatars - Hook for community avatars
//   fetchCommunityAvatars - Function to fetch community avatars
//   clearCollapsibleCategoryCache - Function to clear collapsible category cache
// END_MODULE_MAP

export { CommunityList, clearCommunityListScrollCache } from './CommunityList';
export type { CommunityListProps } from './CommunityList';
export { getCommunities, COMMUNITIES, CATEGORY_LABELS, CATEGORY_ORDER, CLOSED_DISCLAIMER } from './data';
export type { Community, CommunityCategory } from './types';
export { useCommunityAvatars, fetchCommunityAvatars } from './avatars';
export { clearCollapsibleCategoryCache } from './CollapsibleCategoryGroup';

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.0.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v2.0.0 - Phase-5: Export useCommunityAvatars and fetchCommunityAvatars]
// END_CHANGE_SUMMARY
