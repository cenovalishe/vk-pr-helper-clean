// FILE: packages/web/src/modules/communities/types.ts
// VERSION: 2.5.0
// START_MODULE_CONTRACT
//   PURPOSE: Type definitions for Community entities and category discriminant
//   SCOPE: Shared types consumed by data layer, accessor, and UI component
//   DEPENDS: none
//   LINKS: M-COMMUNITIES
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   CommunityCategory - Union type for community category discriminant
//   Community - Core community record type
// END_MODULE_MAP

// START_CONTRACT: CommunityCategory
//   PURPOSE: Discriminant union for the four community categories
//   INPUTS: none (type definition)
//   OUTPUTS: none (type definition)
//   SIDE_EFFECTS: none
// END_CONTRACT: CommunityCategory
export type CommunityCategory = 'general' | 'fandom' | 'vpi' | 'closed';

// START_CONTRACT: Community
//   PURPOSE: Single community record with VK URL, name, shortName, and optional avatar
//   INPUTS: none (type definition)
//   OUTPUTS: none (type definition)
//   SIDE_EFFECTS: none
// END_CONTRACT: Community
export interface Community {
  id: string;
  name: string;
  shortName: string;
  vkUrl: string;
  category: CommunityCategory;
  avatarUrl?: string;
  suggestDisabled?: boolean;
  isOurs?: boolean;
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.5.0 - Remove 'authors' category and add 'isOurs' field to Community interface for Phase-PR-1]
// END_CHANGE_SUMMARY
