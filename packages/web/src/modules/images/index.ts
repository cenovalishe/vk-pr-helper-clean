/**
 * @grace_module Images
 */

// START_MODULE_CONTRACT
//   PURPOSE: Image upload, preview, reordering (← →), and deletion for post attachments.
//   SCOPE: Public barrel exports for M-IMAGES
//   DEPENDS: none
//   LINKS: M-IMAGES
//   ROLE: BARREL
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ImageUploader - React component for uploading and reordering images
//   useImageStore - Zustand state management hook for uploaded images
//   clearImageStoreCache - Function to clear the image store cache
//   ImageFile - Type representing a single uploaded image metadata
// END_MODULE_MAP

export { ImageUploader } from './ImageUploader';
export { useImageStore, clearImageStoreCache } from './useImageStore';
export type { ImageFile } from './types';
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v4.0.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v4.0.0 - Export clearImageStoreCache for tests/resets]
// END_CHANGE_SUMMARY

// GRACE_MARKER: [Images][useImageStore][BLOCK_IMAGE_UPLOAD]

const _graceLogMarkers = [
  "[Images][useImageStore][BLOCK_IMAGE_UPLOAD]"
];
