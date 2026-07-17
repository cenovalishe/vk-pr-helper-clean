// FILE: packages/web/src/modules/auth/VkAuthProvider.tsx
// VERSION: 4.4.1
// START_MODULE_CONTRACT
//   PURPOSE: React context provider managing VK ID authentication and token validation backed by M-VKID-CLIENT and M-TOKEN-VAULT
//   SCOPE: AuthProvider wrapping app; handles login flow, logout flow, token refresh hook state sync, redirect callback, handleOneTapLogin, and test bypass
//   DEPENDS: M-VKID-CLIENT, M-TOKEN-VAULT, M-SESSION-MANAGER, M-AUTH-SERVICE, @/shared/storage
//   LINKS: M-AUTH
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AuthContext - React context for auth state
//   VkAuthProvider - Context provider wrapping children
//   VK_AUTH_SCOPE - Scope constant
//   getRedirectUri - Helper function to resolve VK ID redirect URI
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v4.4.2 - Add getRedirectUri helper to MODULE_MAP to fix integrity check]
//   PREVIOUS_CHANGES:
//     - [v4.4.1 - Fix token refresh initialization order and override VITE_VK_OAUTH_REDIRECT_URL localhost fallback in production]
//     - [v4.4.0 - Remove bypassAuth backdoor from production code (security hardening for VK demo)]
//     - [v4.3.0 - Add handleOneTapLogin function to VkAuthProvider and support VK ID OneTap widget success callback]
//     - [v1.3.0 - Handle missing device_id in redirect parameters by checking localStorage and fall back to empty string to prevent mobile infinite load loops]
//     - [v4.1.1 - Add processingRef flag to prevent race condition / double-triggering in redirect callback on mobile.]
//     - [v4.1.0 - Handle VK ID redirect callback params in useEffect for mobile compatibility.]
//     - [v4.0.0 - Reworked Auth provider to utilize VK ID SDK client and Token Vault storage]
// END_CHANGE_SUMMARY

import { createContext, useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { createLogger } from '@/shared/logger';
import type { AuthContextValue, AuthState } from './types';
import { apiMutation } from '@/modules/api-client';
import { login as loginClient, exchangeCode, logout as logoutClient, init as initClient } from '@/modules/vkid-client';
import type { VkIdTokenSet } from '@/modules/vkid-client';
import { store, clear, onTokenChange, getValidAccessToken, refreshIfExpiring } from '@/modules/token-vault';
import { useSession } from '@/modules/session-manager';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/shared/storage';

const logger = createLogger('Auth');

export const VK_AUTH_SCOPE = 'wall photos';

export const AuthContext = createContext<AuthContextValue | null>(null);

// Helper function to resolve VK ID redirect URI robustly across dev/prod environments
export function getRedirectUri(redirectUriProp?: string): string {
  if (redirectUriProp) return redirectUriProp;
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const envRedirectUri = import.meta.env.VITE_VK_OAUTH_REDIRECT_URL;
  if (isLocalhost || (envRedirectUri && !envRedirectUri.includes('localhost'))) {
    return envRedirectUri;
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

// START_CONTRACT: VkAuthProvider
//   PURPOSE: React context provider backing useAuth with VK ID client and Token Vault
//   INPUTS: { children: ReactNode, appId?: number, redirectUri?: string, apiVersion?: string }
//   OUTPUTS: JSX.Element wrapping children with AuthContext.Provider
//   SIDE_EFFECTS: Subscribes to token vault changes on mount, restores session, triggers login & logout flows
//   LINKS: M-AUTH
// END_CONTRACT: VkAuthProvider
export function VkAuthProvider({
  children,
  appId,
  redirectUri,
  apiVersion,
}: {
  children: ReactNode;
  appId?: number;
  redirectUri?: string;
  apiVersion?: string;
}) {
  const { sessionToken: jwt, setSession } = useSession();
  const processingRef = useRef(false);

  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return safeGetItem('vkpr_access_token');
  });

  const [userId, setUserId] = useState<number | null>(() => {
    const stored = safeGetItem('vkpr_user_id');
    return stored ? Number(stored) : null;
  });

  const isAuthenticated = !!accessToken && !!jwt;

  // Sync state with token vault changes
  useEffect(() => {
    // START_BLOCK_VK_AUTH_FLOW
    const unsubscribe = onTokenChange((token) => {
      setAccessToken(token);
      if (token) {
        const storedUserId = safeGetItem('vkpr_user_id');
        setUserId(storedUserId ? Number(storedUserId) : null);
      } else {
        setUserId(null);
      }
    });

    const resolvedAppId = appId || Number(import.meta.env.VITE_VK_APP_ID || '54669660');
    const resolvedRedirectUri = getRedirectUri(redirectUri);
    initClient(resolvedAppId, resolvedRedirectUri);

    // Proactive refresh on mount (must run AFTER initClient to ensure Config.init is populated)
    refreshIfExpiring().catch((err) => {
      logger.error('VkAuthProvider', 'BLOCK_VK_AUTH_FLOW', 'Proactive refresh failed on mount', { error: err });
    });

    return () => unsubscribe();
    // END_BLOCK_VK_AUTH_FLOW
  }, [appId, redirectUri]);

  // Handle VK ID redirect authentication callback (especially for mobile browsers)
  useEffect(() => {
    // START_BLOCK_VK_REDIRECT_CALLBACK
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const deviceId = params.get('device_id');
    const state = params.get('state');

    const resolvedDeviceId = deviceId || safeGetItem('vkpr_device_id') || '';

    if (code && state) {
      if (processingRef.current) return;
      processingRef.current = true;

      logger.info('VkAuthProvider', 'BLOCK_VK_REDIRECT_CALLBACK', 'Detected VK ID redirect query parameters');

      const processRedirectAuth = async () => {
        try {
          const resolvedAppId = appId || Number(import.meta.env.VITE_VK_APP_ID || '54669660');
          const resolvedRedirectUri = getRedirectUri(redirectUri);
          initClient(resolvedAppId, resolvedRedirectUri);

          // Save state to received state to pass exchangeCode CSRF check
          safeSetItem('vkid_state_received', state);

          // Exchange code for token set
          const tokenSet = await exchangeCode(code, resolvedDeviceId, resolvedRedirectUri);
          store(tokenSet);

          // Authenticate with YC REST backend
          const { sessionToken } = await apiMutation<{ sessionToken: string }>('/auth/login', 'POST', { accessToken: tokenSet.access_token });
          setSession(sessionToken);

          logger.info('VkAuthProvider', 'BLOCK_VK_REDIRECT_CALLBACK', 'Redirect auth successful');
        } catch (err) {
          logger.error('VkAuthProvider', 'BLOCK_VK_REDIRECT_CALLBACK', 'Redirect auth failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          processingRef.current = false;
          // Clean up URL query parameters from history
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }
      };

      processRedirectAuth();
    }
    // END_BLOCK_VK_REDIRECT_CALLBACK
  }, [appId, redirectUri, setSession]);

  const login = useCallback(async (): Promise<void> => {
    logger.info('useAuth', 'BLOCK_VK_AUTH_FLOW', 'Login initiated');
    try {
      // Clear old state before login to force a new one
      safeRemoveItem('vkid_state_sent');
      safeRemoveItem('vkid_code_verifier');
      safeRemoveItem('vkid_code_challenge');
      safeRemoveItem('vkid_state_received');

      const resolvedAppId = appId || Number(import.meta.env.VITE_VK_APP_ID || '54669660');
      const resolvedRedirectUri = getRedirectUri(redirectUri);
      initClient(resolvedAppId, resolvedRedirectUri);

      const loginResult = await loginClient();
      const tokenSet = await exchangeCode(loginResult.code, loginResult.device_id, resolvedRedirectUri);
      store(tokenSet);

      const { sessionToken } = await apiMutation<{ sessionToken: string }>('/auth/login', 'POST', { accessToken: tokenSet.access_token });
      setSession(sessionToken);

      logger.info('useAuth', 'BLOCK_VK_AUTH_FLOW', 'Login successful');
    } catch (err) {
      logger.error('useAuth', 'BLOCK_VK_AUTH_FLOW', 'Login failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }, [appId, redirectUri, setSession]);

  const logout = useCallback(async (): Promise<void> => {
    logger.info('useAuth', 'BLOCK_VK_AUTH_FLOW', 'Logout initiated');
    try {
      const token = await getValidAccessToken();
      if (token) {
        await logoutClient(token);
      }
    } catch (err) {
      logger.error('useAuth', 'BLOCK_VK_AUTH_FLOW', 'Logout error on VK API', { error: err });
    } finally {
      clear();
      setSession(null);
      logger.info('useAuth', 'BLOCK_VK_AUTH_FLOW', 'Logout successful');
    }
  }, [setSession]);

  const handleOneTapLogin = useCallback(async (tokenSet: VkIdTokenSet): Promise<void> => {
    // START_BLOCK_VK_ONETAP_SUCCESS
    const _logMarker1 = "[Auth][VkAuthProvider][BLOCK_VK_ONETAP_SUCCESS]";
    logger.info('VkAuthProvider', 'BLOCK_VK_ONETAP_SUCCESS', 'OneTap login success callback triggered inside VkAuthProvider');
    try {
      store(tokenSet);

      const { sessionToken } = await apiMutation<{ sessionToken: string }>('/auth/login', 'POST', { accessToken: tokenSet.access_token });
      setSession(sessionToken);

      logger.info('VkAuthProvider', 'BLOCK_VK_ONETAP_SUCCESS', 'OneTap session authentication successful');
    } catch (err) {
      logger.error('VkAuthProvider', 'BLOCK_VK_ONETAP_SUCCESS', 'OneTap session authentication failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    // END_BLOCK_VK_ONETAP_SUCCESS
  }, [setSession]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      accessToken,
      sessionToken: jwt,
      userId,
      login,
      logout,
      handleOneTapLogin,
    }),
    [isAuthenticated, accessToken, jwt, userId, login, logout, handleOneTapLogin]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}