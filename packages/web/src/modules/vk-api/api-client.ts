// FILE: packages/web/src/modules/vk-api/api-client.ts
// VERSION: 3.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Low-level VK API integration wrapper for generic fetch calls and error parsing.
//   SCOPE: Handles HTTP POST to api.vk.ru and normalizes errors into VkApiError.
//   DEPENDS: M-LOGGER
//   LINKS: M-VK-API
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   VK_API_VERSION - Constant defining the targeted VK API version
//   callVkApi - Generic wrapper for calling VK API methods
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.0.1 - Migrate api.vk.com to api.vk.ru]
// END_CHANGE_SUMMARY
import { createLogger } from '@/shared/logger';
import { VkApiError } from './types';

const logger = createLogger('VkApi');

export const VK_API_VERSION = '5.199';

// <!-- START_CONTRACT callVkApi -->
/**
 * Low-level VK API call wrapper (handles fetch + error parsing)
 * @param method VK API method
 * @param params Request parameters
 * @param accessToken VK Access Token
 * @returns Parsed response
 */
// <!-- END_CONTRACT -->
export async function callVkApi<T>(method: string, params: Record<string, string | number>, accessToken: string): Promise<T> {
  if (!accessToken) {
    throw { code: 'UNAUTHORIZED', message: 'No valid token provided' } as VkApiError;
  }
  
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    urlParams.append(key, String(value));
  }
  urlParams.append('access_token', accessToken);
  urlParams.append('v', VK_API_VERSION);

  const url = `https://api.vk.ru/method/${method}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: urlParams.toString(),
    });

    if (!response.ok) {
        throw { code: 'VK_API_ERROR', message: `HTTP error ${response.status}` } as VkApiError;
    }

    const data = await response.json();

    if (data.error) {
      throw { 
        code: 'VK_API_ERROR', 
        message: data.error.error_msg,
        vkErrorCode: data.error.error_code
      } as VkApiError;
    }

    return data.response as T;
  } catch (error) {
    if ((error as VkApiError).code) {
      throw error;
    }
    throw { code: 'VK_API_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } as VkApiError;
  }
}
