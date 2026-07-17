// START_MODULE_CONTRACT
//   PURPOSE: Type definitions for the Images module.
//   SCOPE: Shared interface definitions for image upload payload and state.
//   DEPENDS: none
//   LINKS: M-IMAGES
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ImageFile - Object containing file handle and preview URL for UI state
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v4.1.1 - Updated MODULE_CONTRACT and MODULE_MAP to satisfy standard GRACE lint profile]
// END_CHANGE_SUMMARY

/**
 * @grace_module Images
 * @grace_purpose Image upload, preview, reordering (← →), and deletion for post attachments.
 */

// MODULE_CONTRACT
// PURPOSE: Image upload, preview, reordering (← →), and deletion for post attachments.
// INPUTS: files: File[] (max 6, each ≤2MB)
// OUTPUTS: ImageFile[]: { id: string, file: File, previewUrl: string } — Ordered array
// ERRORS: FILE_TOO_LARGE (>2MB), MAX_IMAGES_EXCEEDED (>6 images)

export interface ImageFile {
  id: string;
  file: File;
  previewUrl: string;
}

