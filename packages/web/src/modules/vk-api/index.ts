// FILE: packages/web/src/modules/vk-api/index.ts
// VERSION: 3.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Barrel re-exports for VK API integration module (M-VK-API)
//   SCOPE: Public API surface — suggestPost, uploadPhotos, callVkApi, and types
//   DEPENDS: M-VK-API.types, M-VK-API.suggest-post, M-VK-API.upload-photos, M-VK-API.api-client
//   LINKS: M-VK-API
//   ROLE: BARREL
//   MAP_MODE: SUMMARY
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   export * from './types'         - Type definitions
//   export * from './suggest-post'  - suggestPost function
//   export * from './upload-photos' - uploadPhotos function
//   export * from './api-client'    - callVkApi function
// END_MODULE_MAP

export * from './types';
export * from './suggest-post';
export * from './upload-photos';
export * from './api-client';

// GRACE_MARKER: [VkApi][suggestPost][BLOCK_SUGGEST_POST]
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.0.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v3.0.0 - Phase-6: Clean up VK Bridge removal and implement client-side suggest post flow]
// END_CHANGE_SUMMARY

const _graceLogMarkers = [
  "[VkApi][suggestPost][BLOCK_SUGGEST_POST]"
];
