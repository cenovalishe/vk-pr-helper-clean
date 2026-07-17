// START_MODULE_CONTRACT
//   PURPOSE: Type definitions for the VK API integration module.
//   SCOPE: Shared interface definitions for post payload, post execution result, and error shape.
//   DEPENDS: none
//   LINKS: M-VK-API
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   VkPostPayload - Object containing text and optional files for posting
//   VkPostResult - Structure representing api response check success status and post identification
//   VkErrorCode - Code constants for standard VK API error conditions
//   VkApiError - Wrapper structure for api exception data
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.0.1 - Updated MODULE_CONTRACT and MODULE_MAP to satisfy standard GRACE lint profile]
// END_CHANGE_SUMMARY

/*
<!-- MODULE_CONTRACT
ID: M-VK-API
Type: INTEGRATION
Purpose: VK API integration: wall.post with suggest flag, photo upload flow via proxy.
-->
*/

export interface VkPostPayload {
  communityId: number;
  text: string;
  images?: File[];
}

export interface VkPostResult {
  postId?: number;
  success: boolean;
  error?: VkApiError;
}

export type VkErrorCode = 'VK_API_ERROR' | 'UPLOAD_FAILED' | 'UNAUTHORIZED' | 'RATE_LIMITED';

export interface VkApiError {
  code: VkErrorCode;
  message: string;
  vkErrorCode?: number;
}

