/**
 * @grace_module Submit
 */

// START_MODULE_CONTRACT
//   PURPOSE: Types for Submit module
//   SCOPE: Type definitions for M-SUBMIT
//   DEPENDS: none
//   LINKS: M-SUBMIT
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SubmitResult - Shape of VK suggest post response
// END_MODULE_MAP

export interface SubmitResult {
  success: boolean;
  postId?: number;
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Remove unused imports (Community, Template, ImageFile) that were never referenced in this types-only file]
//   PREVIOUS_CHANGES:
//     - [v1.0.0 - Initial type definitions for Submit module]
// END_CHANGE_SUMMARY

