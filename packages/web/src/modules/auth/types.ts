// FILE: packages/web/src/modules/auth/types.ts
// VERSION: 2.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Type definitions for VK authentication state
//   SCOPE: Auth module types — AuthState, AuthContextValue
//   DEPENDS: M-VKID-CLIENT
//   LINKS: M-AUTH
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AuthState    - Core auth state shape: isAuthenticated, accessToken, userId
//   AuthContextValue - Context value shape including async login, handleOneTapLogin + sync logout actions
// END_MODULE_MAP

import type { VkIdTokenSet } from '@/modules/vkid-client';

// START_CONTRACT: AuthState
//   PURPOSE: Represents the authentication state of the current user
//   INPUTS: none (type definition)
//   OUTPUTS: none (type definition)
//   SIDE_EFFECTS: none
//   LINKS: M-AUTH.useAuth, M-AUTH.VkAuthProvider
// END_CONTRACT: AuthState
export interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  sessionToken: string | null;
  userId: number | null;
}

// START_CONTRACT: AuthContextValue
//   PURPOSE: Full context value exposed to consumers, combining state with actions
//   INPUTS: none (type definition)
//   OUTPUTS: none (type definition)
//   SIDE_EFFECTS: none
//   LINKS: M-AUTH.useAuth
// END_CONTRACT: AuthContextValue
export interface AuthContextValue extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  handleOneTapLogin: (tokenSet: VkIdTokenSet) => Promise<void>;
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.3.0 - Add handleOneTapLogin to AuthContextValue and import VkIdTokenSet.]
// END_CHANGE_SUMMARY
