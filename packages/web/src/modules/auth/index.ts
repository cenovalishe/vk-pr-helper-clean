// FILE: packages/web/src/modules/auth/index.ts
// VERSION: 4.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Barrel re-exports for VK Auth module (M-AUTH)
//   SCOPE: Public API surface — useAuth hook, VkAuthProvider, AuthState type, VK_AUTH_SCOPE constant
//   DEPENDS: M-AUTH.useAuth, M-AUTH.VkAuthProvider, M-AUTH.types
//   LINKS: M-AUTH
//   ROLE: BARREL
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   useAuth         - Auth state hook
//   VkAuthProvider  - Context provider backing VK ID authentication
//   AuthState       - Auth state type
//   VK_AUTH_SCOPE   - Default OAuth scope string for suggest-post flow
//   AuthContextValue - type
//   AuthContextValue - type
// END_MODULE_MAP

export { useAuth } from './useAuth';
export { VkAuthProvider, VK_AUTH_SCOPE } from './VkAuthProvider';
export type { AuthState, AuthContextValue } from './types';

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v4.0.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v4.0.0 - Phase-VKID-MIGRATION: Rework auth to support VK ID Authorization Code Flow + PKCE. Removed @vkontakte/vk-bridge dependency.]
// END_CHANGE_SUMMARY

// GRACE_MARKER: [Auth][useAuth][BLOCK_VK_AUTH_FLOW]

const _graceLogMarkers = [
  "[Auth][useAuth][BLOCK_VK_AUTH_FLOW]"
];
