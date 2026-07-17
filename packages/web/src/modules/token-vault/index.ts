// FILE: packages/web/src/modules/token-vault/index.ts
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Frontend token vault for storing VK ID access/refresh tokens with proactive refresh lifecycle
//   SCOPE: store, getValidAccessToken, refreshIfExpiring, clear, onTokenChange, isAuthenticated
//   DEPENDS: M-VKID-CLIENT
//   LINKS: M-TOKEN-VAULT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   store - Stores VkIdTokenSet in localStorage and memory
//   getValidAccessToken - Retrieves valid access token or refreshes it if expiring
//   refreshIfExpiring - Refreshes token if it expires in <= 5 minutes
//   clear - Clears token vault storage and memory
//   onTokenChange - Registers subscriber for access token change events
//   isAuthenticated - Returns true if access or refresh token is present
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.2 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v1.0.1 - Use safe storage helpers with in-memory fallback to avoid SecurityError crashes in restricted environments]
//     - [v1.0.0 - Initial implementation of token vault storage and auto-refresh lifecycle]
// END_CHANGE_SUMMARY

import { safeGetItem, safeSetItem, safeRemoveItem } from '@/shared/storage';

import { refresh, VkIdTokenSet } from '@/modules/vkid-client';

// In-memory cache for fast access
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let cachedDeviceId: string | null = null;
let cachedExpiresAt: number | null = null;
let cachedUserId: number | null = null;
let cachedScope: string | null = null;

// Subscribers for token change events
let subscribers: ((accessToken: string | null) => void)[] = [];

// Helper: load from localStorage into cache
function loadCache(): void {
  cachedAccessToken = safeGetItem('vkpr_access_token');
  cachedRefreshToken = safeGetItem('vkpr_refresh_token');
  cachedDeviceId = safeGetItem('vkpr_device_id');
  cachedScope = safeGetItem('vkpr_scope');

  const expiresAtStr = safeGetItem('vkpr_expires_at');
  cachedExpiresAt = expiresAtStr ? Number(expiresAtStr) : null;

  const userIdStr = safeGetItem('vkpr_user_id');
  cachedUserId = userIdStr ? Number(userIdStr) : null;
}

// Helper: notify subscribers synchronously
function notifySubscribers(token: string | null): void {
  subscribers.forEach((cb) => {
    try {
      cb(token);
    } catch (err) {
      console.error('Subscriber callback failed', err);
    }
  });
}

// START_CONTRACT: store
//   PURPOSE: Stores VkIdTokenSet in localStorage and memory
//   INPUTS: { tokenSet: VkIdTokenSet }
//   OUTPUTS: void
//   SIDE_EFFECTS: Updates localStorage and in-memory cache, notifies subscribers
//   LINKS: M-TOKEN-VAULT
// END_CONTRACT: store
export function store(tokenSet: any): void {
  // START_BLOCK_TOKEN_STORE
  const expiresAt = Math.floor(Date.now() / 1000) + tokenSet.expires_in;

  // Cache updates
  cachedAccessToken = tokenSet.access_token;
  cachedRefreshToken = tokenSet.refresh_token;
  cachedDeviceId = tokenSet.device_id;
  cachedExpiresAt = expiresAt;
  cachedUserId = tokenSet.user_id;
  cachedScope = tokenSet.scope;

  // LocalStorage atomic updates (write new before clearing old or direct overwrite)
  safeSetItem('vkpr_access_token', tokenSet.access_token);
  safeSetItem('vkpr_refresh_token', tokenSet.refresh_token);
  safeSetItem('vkpr_device_id', tokenSet.device_id);
  safeSetItem('vkpr_expires_at', String(expiresAt));
  safeSetItem('vkpr_user_id', String(tokenSet.user_id));
  safeSetItem('vkpr_scope', tokenSet.scope);

  // Emitting the required log marker without leaking token values
  console.info('[TokenVault][store][BLOCK_TOKEN_STORE] Token stored successfully', {
    expiresAt,
    scope: tokenSet.scope,
  });

  notifySubscribers(tokenSet.access_token);
  // END_BLOCK_TOKEN_STORE
}

// START_CONTRACT: clear
//   PURPOSE: Clears token vault storage and memory
//   INPUTS: {}
//   OUTPUTS: void
//   SIDE_EFFECTS: Updates localStorage and memory cache, notifies subscribers
//   LINKS: M-TOKEN-VAULT
// END_CONTRACT: clear
export function clear(): void {
  // START_BLOCK_TOKEN_CLEAR
  cachedAccessToken = null;
  cachedRefreshToken = null;
  cachedDeviceId = null;
  cachedExpiresAt = null;
  cachedUserId = null;
  cachedScope = null;

  safeRemoveItem('vkpr_access_token');
  safeRemoveItem('vkpr_refresh_token');
  safeRemoveItem('vkpr_device_id');
  safeRemoveItem('vkpr_expires_at');
  safeRemoveItem('vkpr_user_id');
  safeRemoveItem('vkpr_scope');

  console.info('[TokenVault][clear][BLOCK_TOKEN_CLEAR] Token vault cleared');
  notifySubscribers(null);
  // END_BLOCK_TOKEN_CLEAR
}

// START_CONTRACT: refreshIfExpiring
//   PURPOSE: Refreshes token if it expires in <= 5 minutes
//   INPUTS: {}
//   OUTPUTS: Promise<boolean> - true if refresh happened and succeeded, false otherwise
//   SIDE_EFFECTS: Calls M-VKID-CLIENT.refresh, stores new token or clears on failure
//   LINKS: M-TOKEN-VAULT
// END_CONTRACT: refreshIfExpiring
export async function refreshIfExpiring(): Promise<boolean> {
  // START_BLOCK_TOKEN_REFRESH
  loadCache();

  if (!cachedRefreshToken || !cachedDeviceId || !cachedExpiresAt) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const timeRemaining = cachedExpiresAt - now;

  // <= 5 minutes (300 seconds)
  if (timeRemaining <= 300) {

    console.info('[TokenVault][refresh][BLOCK_TOKEN_REFRESH] Initiating proactive token refresh', {
      timeRemaining,
    });
    try {
      const newTokenSet = await refresh(cachedRefreshToken, cachedDeviceId);
      store(newTokenSet);
      return true;
    } catch (error) {
      console.error('Proactive refresh failed, clearing session', error);
      clear();
      return false;
    }
  }

  return false;
  // END_BLOCK_TOKEN_REFRESH
}

// START_CONTRACT: getValidAccessToken
//   PURPOSE: Retrieves valid access token or refreshes it if expiring
//   INPUTS: {}
//   OUTPUTS: Promise<string | null> - valid access token, or null if empty/refresh failed
//   SIDE_EFFECTS: Triggers refreshIfExpiring if necessary
//   LINKS: M-TOKEN-VAULT
// END_CONTRACT: getValidAccessToken
export async function getValidAccessToken(): Promise<string | null> {
  loadCache();

  if (!cachedAccessToken) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = cachedExpiresAt || 0;

  if (expiresAt - now <= 300) {
    // Expiring or expired, trigger refresh
    console.info('[TokenVault][getValidAccessToken][BLOCK_TOKEN_EXPIRED] Token is expiring or expired, triggering refresh');
    const refreshed = await refreshIfExpiring();
    if (refreshed) {
      return cachedAccessToken;
    } else {
      // If refresh failed or was not possible
      return cachedAccessToken && expiresAt - now > 0 ? cachedAccessToken : null;
    }
  }

  return cachedAccessToken;
}

// START_CONTRACT: onTokenChange
//   PURPOSE: Registers subscriber for access token change events
//   INPUTS: { callback: (accessToken: string | null) => void }
//   OUTPUTS: () => void - unsubscribe function
//   SIDE_EFFECTS: Adds callback to subscribers array
//   LINKS: M-TOKEN-VAULT
// END_CONTRACT: onTokenChange
export function onTokenChange(callback: (accessToken: string | null) => void): () => void {
  subscribers.push(callback);
  return () => {
    subscribers = subscribers.filter((cb) => cb !== callback);
  };
}

// START_CONTRACT: isAuthenticated
//   PURPOSE: Returns true if access or refresh token is present
//   INPUTS: {}
//   OUTPUTS: boolean
//   SIDE_EFFECTS: none
//   LINKS: M-TOKEN-VAULT
// END_CONTRACT: isAuthenticated
export function isAuthenticated(): boolean {
  loadCache();
  return !!cachedAccessToken || !!cachedRefreshToken;
}
