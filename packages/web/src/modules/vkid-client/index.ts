// FILE: packages/web/src/modules/vkid-client/index.ts
// VERSION: 1.4.1
// START_MODULE_CONTRACT
//   PURPOSE: VK ID SDK wrapper for OneTap widget and Authorization Code Flow + PKCE authentication
//   SCOPE: generatePkce, init, login, renderOneTap, exchangeCode, refresh, logout, VkIdTokenSet
//   DEPENDS: @vkid/sdk, @/shared/storage
//   LINKS: M-VKID-CLIENT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   generatePkce - Helper to generate PKCE challenge and state values
//   init - Initializes VK ID SDK with Callback response mode
//   login - Kept for legacy compatibility
//   renderOneTap - Renders inline VK ID OneTap widget, handles success callback
//   exchangeCode - Exchanges auth code for Token Set
//   refresh - Refreshes VK ID access token using refresh token
//   logout - Calls VK ID SDK logout endpoint
//   VkIdTokenSet - token set interface
// END_MODULE_MAP
//










// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.4.1 - Revert offline scope addition as it is unsupported under VK ID OAuth 2.1; NAT static IP routes solve the IP address mismatch directly]
//   PREVIOUS_CHANGES:
//     - [v1.4.0 - Add offline to default scope config to prevent access_token IP address binding errors in serverless NAT environments]
//     - [v1.3.0 - Add runtime getRedirectUri safety validation and ensureInitialized checks to prevent invalid OAuth flows]
//     - [v1.2.3 - Remove dead-code GRACE_AUTONOMY_MARKERS block and VITEST test backdoor in CSRF state validation]
//     - [v1.2.2 - Use safe storage helpers with in-memory fallback to prevent SecurityError crashes in restricted environments]
//     - [v1.2.1 - Clear target container innerHTML inside renderOneTap to prevent duplicate widget rendering during React mount/unmount cycles]
//     - [v1.2.0 - Add renderOneTap function and support Callback responseMode for VK ID OneTap widget integration]
//     - [v1.1.0 - Detect mobile user-agent to use redirect auth flow and prevent mobile popup blockers]
//     - [v1.0.0 - Initial implementation of VK ID wrapper client with PKCE]
// END_CHANGE_SUMMARY

import { Config, Auth, ConfigAuthMode, ConfigResponseMode, OneTap, OneTapInternalEvents, WidgetEvents } from '@vkid/sdk';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/shared/storage';

let isSdkInitialized = false;
let sdkRedirectUrl = '';

function ensureInitialized(): void {
  if (!isSdkInitialized) {
    throw new Error('[VkIdClient] VK ID SDK has not been initialized. Call init() before calling login, refresh, renderOneTap, or exchangeCode.');
  }
}

export interface VkIdTokenSet {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  user_id: number;
  device_id: string;
  scope: string;
}

// Helper: SHA-256 implementation in pure JS (synchronous)
function sha256(ascii: string): Uint8Array {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const result = new Uint8Array(32);
  const words: number[] = [];
  const asciiLength = ascii.length;
  let i;

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const blocks: number[] = [];
  for (i = 0; i < asciiLength; i++) {
    const charCode = ascii.charCodeAt(i);
    blocks[i >> 2] |= (charCode & 0xff) << (24 - (i % 4) * 8);
  }

  const totalBytes = asciiLength;
  blocks[totalBytes >> 2] |= 0x80 << (24 - (totalBytes % 4) * 8);

  const wordLengthIndex = ((totalBytes + 8) >> 6) * 16 + 14;
  blocks[wordLengthIndex] = 0;
  blocks[wordLengthIndex + 1] = totalBytes * 8;

  for (i = 0; i < wordLengthIndex + 2; i++) {
    if (blocks[i] === undefined) blocks[i] = 0;
  }

  for (let blockStart = 0; blockStart < blocks.length; blockStart += 16) {
    const w = new Array(64);
    for (i = 0; i < 16; i++) {
      w[i] = blocks[blockStart + i];
    }
    for (i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    const value = hash[i];
    result[i * 4] = (value >>> 24) & 0xff;
    result[i * 4 + 1] = (value >>> 16) & 0xff;
    result[i * 4 + 2] = (value >>> 8) & 0xff;
    result[i * 4 + 3] = value & 0xff;
  }

  return result;
}

// Helper: base64url encoder
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper: cryptographically strong or pseudo-random string generator
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let result = '';
  const cryptoObj = typeof window !== 'undefined' ? (window.crypto || (window as any).msCrypto) : (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
  if (cryptoObj && cryptoObj.getRandomValues) {
    const values = new Uint8Array(length);
    cryptoObj.getRandomValues(values);
    for (let i = 0; i < length; i++) {
      result += charset[values[i] % charset.length];
    }
  } else {
    console.warn('[VkIdClient] Cryptographical API (window.crypto/globalThis.crypto) is unavailable. Falling back to Math.random() for PKCE/state generation, which is insecure.');
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
  }
  return result;
}

// START_CONTRACT: generatePkce
//   PURPOSE: Generates PKCE codeVerifier, codeChallenge, and state
//   INPUTS: {}
//   OUTPUTS: { codeVerifier: string, codeChallenge: string, state: string }
//   SIDE_EFFECTS: none
//   LINKS: M-VKID-CLIENT
// END_CONTRACT: generatePkce
export function generatePkce(): { codeVerifier: string; codeChallenge: string; state: string } {
  // START_BLOCK_GENERATE_PKCE
  const codeVerifier = generateRandomString(64);
  const hashBytes = sha256(codeVerifier);
  const codeChallenge = base64UrlEncode(hashBytes);
  const state = generateRandomString(32);
  return { codeVerifier, codeChallenge, state };
  // END_BLOCK_GENERATE_PKCE
}

// START_CONTRACT: init
//   PURPOSE: Initializes VKID SDK Config
//   INPUTS: { appId: number, redirectUrl: string, scope?: string }
//   OUTPUTS: void
//   SIDE_EFFECTS: Writes to localStorage, calls Config.init
//   LINKS: M-VKID-CLIENT
// END_CONTRACT: init
export function init(appId: number, redirectUrl: string, scope?: string): void {
  // START_BLOCK_INIT_CONFIG
  const currentScope = scope || 'wall photos';
  sdkRedirectUrl = redirectUrl;

  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost && redirectUrl.includes('localhost')) {
      console.error(
        `[VkIdClient] SECURITY WARNING: VK ID redirectUrl is set to "${redirectUrl}" in a non-localhost production environment (hostname: "${window.location.hostname}"). ` +
        `This will cause the VK ID authentication request to fail due to origin and redirect_uri mismatch.`
      );
    }
  }

  let state = safeGetItem('vkid_state_sent');
  let codeVerifier = safeGetItem('vkid_code_verifier');
  let codeChallenge = safeGetItem('vkid_code_challenge');

  // Generate and store PKCE values only if they don't exist
  // This prevents the popup from overwriting the parent's PKCE state
  if (!state || !codeVerifier || !codeChallenge) {
    const pkce = generatePkce();
    state = pkce.state;
    codeVerifier = pkce.codeVerifier;
    codeChallenge = pkce.codeChallenge;
    safeSetItem('vkid_state_sent', state);
    safeSetItem('vkid_code_verifier', codeVerifier);
    safeSetItem('vkid_code_challenge', codeChallenge);
  }

  Config.init({
    app: appId,
    redirectUrl: redirectUrl,
    scope: currentScope,
    state: state,
    codeChallenge: codeChallenge,
    mode: ConfigAuthMode.InNewWindow, // Always use InNewWindow to prevent full page redirect, as requested
    responseMode: ConfigResponseMode.Callback,
  });
  isSdkInitialized = true;
  // END_BLOCK_INIT_CONFIG
}

// START_CONTRACT: renderOneTap
//   PURPOSE: Renders inline VK ID OneTap widget, handles success callback and exchangeCode
//   INPUTS: { container: HTMLElement, options: { onSuccess: (tokenSet: VkIdTokenSet) => void, onError?: (error: any) => void } }
//   OUTPUTS: void
//   SIDE_EFFECTS: Instantiates and renders VKID.OneTap, handles LOGIN_SUCCESS, calls exchangeCode
//   LINKS: M-VKID-CLIENT
// END_CONTRACT: renderOneTap
export function renderOneTap(
  container: HTMLElement,
  options: {
    onSuccess: (tokenSet: VkIdTokenSet) => void;
    onError?: (error: any) => void;
  }
): void {
  // START_BLOCK_VKID_ONETAP_RENDER
  ensureInitialized();
  console.info('[VkIdClient][renderOneTap][BLOCK_VKID_ONETAP_RENDER] Rendering OneTap');
  try {
    container.innerHTML = ''; // Clear container to avoid duplicate widgets from React StrictMode/multiple calls
    const oneTap = new OneTap();
    oneTap
      .render({ container })
      .on(OneTapInternalEvents.LOGIN_SUCCESS, (event: any) => {
        // START_BLOCK_VKID_ONETAP_SUCCESS
        console.info('[VkIdClient][renderOneTap][BLOCK_VKID_ONETAP_SUCCESS] OneTap login success event received');
        const payload = event || {};
        const code = payload.code;
        const state = payload.state;
        const deviceId = payload.device_id;

        if (state) {
          safeSetItem('vkid_state_received', state);
        }

        exchangeCode(code, deviceId)
          .then((tokenSet) => {
            options.onSuccess(tokenSet);
          })
          .catch((err) => {
            if (options.onError) {
              options.onError(err);
            } else {
              console.error('[VkIdClient][renderOneTap] OneTap exchange failed', err);
            }
          });
        // END_BLOCK_VKID_ONETAP_SUCCESS
      })
      .on(WidgetEvents.ERROR, (err: any) => {
        console.error('[VkIdClient][renderOneTap] Widget error', err);
        if (options.onError) {
          options.onError(err);
        }
      });
  } catch (error) {
    console.error('[VkIdClient][renderOneTap] Failed to render OneTap', error instanceof Error ? error.stack || error.message : String(error));
    if (options.onError) {
      options.onError(error);
    }
  }
  // END_BLOCK_VKID_ONETAP_RENDER
}

// START_CONTRACT: login
//   PURPOSE: Triggers VKID login popup
//   INPUTS: {}
//   OUTPUTS: Promise<{ code: string, state: string, device_id: string }>
//   SIDE_EFFECTS: Emits logs, calls Auth.login
//   LINKS: M-VKID-CLIENT
// END_CONTRACT: login
export async function login(): Promise<{ code: string; state: string; device_id: string }> {
  // START_BLOCK_VKID_LOGIN
  ensureInitialized();
  console.info('[VkIdClient][login][BLOCK_VKID_LOGIN] Triggering login');
  try {
    const loginResult = (await Auth.login()) as {
      code: string;
      state: string;
      device_id: string;
    };
    safeSetItem('vkid_state_received', loginResult.state);
    return loginResult;
  } catch (error) {
    console.error('Login failed', error);
    throw error;
  }
  // END_BLOCK_VKID_LOGIN
}

// START_CONTRACT: exchangeCode
//   PURPOSE: Exposes code for access/refresh tokens with CSRF state validation
//   INPUTS: { code: string, device_id: string, redirectUri?: string }
//   OUTPUTS: Promise<VkIdTokenSet>
//   SIDE_EFFECTS: Reads localStorage, calls backend /auth/exchange, logs outcome (redacted)
//   LINKS: M-VKID-CLIENT
// END_CONTRACT: exchangeCode
export async function exchangeCode(code: string, device_id: string, redirectUri?: string): Promise<VkIdTokenSet> {
  // START_BLOCK_VKID_EXCHANGE
  ensureInitialized();
  const sentState = safeGetItem('vkid_state_sent');
  const receivedState = safeGetItem('vkid_state_received');

  const isStateValid = sentState === receivedState;

  if (!sentState || !receivedState || !isStateValid) {
    console.error('[VkIdClient][login][BLOCK_VKID_STATE_MISMATCH] State mismatch');
    throw new Error('VKID_STATE_MISMATCH: CSRF guard state mismatch');
  }

  try {
    const codeVerifier = safeGetItem('vkid_code_verifier') || '';
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const exchangeRes = await fetch(`${baseUrl}/auth/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        device_id,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri || sdkRedirectUrl,
      }),
    });

    if (!exchangeRes.ok) {
      const errText = await exchangeRes.text();
      throw new Error(`Exchange request failed: ${errText}`);
    }

    const response = await exchangeRes.json();
    const data = response.response || response;

    const tokenSet: VkIdTokenSet = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      id_token: data.id_token || '',
      token_type: data.token_type || 'Bearer',
      expires_in: data.expires_in,
      user_id: data.user_id,
      device_id: device_id,
      scope: data.scope || '',
    };

    console.info('[VkIdClient][exchangeCode][BLOCK_VKID_EXCHANGE] Exchange success', {
      device_id,
      expires_in: response.expires_in,
      scope: response.scope,
    });

    // Clear PKCE state so the next login generates a fresh one
    safeRemoveItem('vkid_state_sent');
    safeRemoveItem('vkid_code_verifier');
    safeRemoveItem('vkid_code_challenge');
    safeRemoveItem('vkid_state_received');

    return tokenSet;
  } catch (error) {
    console.error('Exchange code failed', error);
    throw new Error('VKID_EXCHANGE_FAILED: ' + (error instanceof Error ? error.message : String(error)));
  }
  // END_BLOCK_VKID_EXCHANGE
}

// START_CONTRACT: refresh
//   PURPOSE: Proactive/reactive token refresh
//   INPUTS: { refreshToken: string, deviceId: string }
//   OUTPUTS: Promise<VkIdTokenSet>
//   SIDE_EFFECTS: Calls backend /auth/refresh, logs outcome (redacted)
//   LINKS: M-VKID-CLIENT
// END_CONTRACT: refresh
export async function refresh(refreshToken: string, deviceId: string): Promise<VkIdTokenSet> {
  // START_BLOCK_VKID_REFRESH
  ensureInitialized();
  console.info('[VkIdClient][refresh][BLOCK_VKID_REFRESH] Token refresh requested', {
    device_id: deviceId,
  });
  try {
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        device_id: deviceId,
      }),
    });

    if (!refreshRes.ok) {
      const errText = await refreshRes.text();
      throw new Error(`Refresh request failed: ${errText}`);
    }

    const response = await refreshRes.json();
    const data = response.response || response;

    const tokenSet: VkIdTokenSet = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || '',
      id_token: data.id_token || '',
      token_type: data.token_type || 'Bearer',
      expires_in: data.expires_in,
      user_id: data.user_id,
      device_id: deviceId,
      scope: data.scope || '',
    };

    return tokenSet;
  } catch (error) {
    console.error('Refresh token failed', error);
    throw new Error('VKID_REFRESH_FAILED: ' + (error instanceof Error ? error.message : String(error)));
  }
  // END_BLOCK_VKID_REFRESH
}

// START_CONTRACT: logout
//   PURPOSE: Calls VKID logout
//   INPUTS: { accessToken: string }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Calls Auth.logout, logs outcome
//   LINKS: M-VKID-CLIENT
// END_CONTRACT: logout
export async function logout(accessToken: string): Promise<void> {
  // START_BLOCK_VKID_LOGOUT
  console.info('[VkIdClient][logout][BLOCK_VKID_LOGOUT] Logout requested');
  try {
    await Auth.logout(accessToken);
  } catch (error) {
    console.error('Logout failed', error);
    throw error;
  }
  // END_BLOCK_VKID_LOGOUT
}
