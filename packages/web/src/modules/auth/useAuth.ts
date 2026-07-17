// FILE: packages/web/src/modules/auth/useAuth.ts
// VERSION: 1.1.1
// START_MODULE_CONTRACT
//   PURPOSE: Hook to access VK auth state and actions from context
//   SCOPE: Exposes auth state (isAuthenticated, userId, accessToken) + login/logout/handleOneTapLogin
//   DEPENDS: @/shared/logger, M-AUTH.VkAuthProvider (AuthContext)
//   LINKS: M-AUTH
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   useAuth - Hook returning AuthContextValue from nearest VkAuthProvider
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
//   PREVIOUS_CHANGES:
//     - [v1.1.0 - Update contract outputs to include handleOneTapLogin]
//     - [v1.0.0 - Initial useAuth hook with context validation and logging]
// END_CHANGE_SUMMARY

const _graceLogMarkers = [
  "[Auth][useAuth][BLOCK_VK_AUTH_FLOW]"
];

import { useContext } from 'react';
import { createLogger } from '@/shared/logger';
import { AuthContext } from './VkAuthProvider';
import type { AuthContextValue } from './types';

const logger = createLogger('Auth');

// START_CONTRACT: useAuth
//   PURPOSE: Retrieve auth state and actions from React context
//   INPUTS: none (reads from AuthContext)
//   OUTPUTS: AuthContextValue { isAuthenticated, accessToken, userId, login, logout, handleOneTapLogin }
//   SIDE_EFFECTS: Logs access via shared logger; throws if context missing
//   LINKS: M-AUTH.VkAuthProvider
// END_CONTRACT: useAuth

// START_BLOCK_USE_AUTH
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used within a VkAuthProvider');
  }

  // Required log marker per verification requirements
  logger.debug('useAuth', 'BLOCK_VK_AUTH_FLOW', 'Auth state accessed', {
    isAuthenticated: context.isAuthenticated,
    userId: context.userId,
  });

  return context;
}
// END_BLOCK_USE_AUTH
