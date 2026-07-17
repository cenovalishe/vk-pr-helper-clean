// FILE: packages/web/src/modules/image-compressor/index.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Client-side image compression and format conversion (WEBP/PNG/HEIC -> JPEG) using browser-image-compression
//   SCOPE: compressImage
//   DEPENDS: none
//   LINKS: M-IMAGE-COMPRESSOR
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   compressImage - function that compresses the image and converts it to JPEG
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v1.0.0 - Initial implementation of M-IMAGE-COMPRESSOR using browser-image-compression.]
// END_CHANGE_SUMMARY

import imageCompression from "browser-image-compression";
import { createLogger } from "../../shared/logger";

const logger = createLogger("ImageCompressor");

// START_CONTRACT: compressImage
//   PURPOSE: Compresses the image and converts it to JPEG
//   INPUTS: { file: File }
//   OUTPUTS: Promise<File> (type: image/jpeg)
//   SIDE_EFFECTS: Logs compression start and complete
//   LINKS: M-IMAGE-COMPRESSOR
// END_CONTRACT: compressImage
export async function compressImage(file: File): Promise<File> {
  // START_BLOCK_COMPRESS_START
  logger.info("compress", "BLOCK_COMPRESS_START", "Starting image compression", { // [ImageCompressor][compress][BLOCK_COMPRESS_START]
    name: file.name,
    size: file.size,
    type: file.type,
  });
  // END_BLOCK_COMPRESS_START

  const options = {
    maxSizeMB: 2, // VK upload limit is ~5MB, so 2MB is a safe target
    maxWidthOrHeight: 1920, // Keep resolution reasonable
    useWebWorker: false, // Set false for better compatibility in tests/environments
    fileType: "image/jpeg", // Convert all formats (WEBP, PNG, HEIC) to JPEG
  };

  try {
    const compressedFile = await imageCompression(file, options);

    // START_BLOCK_COMPRESS_DONE
    logger.info("compress", "BLOCK_COMPRESS_DONE", "Image compression complete", { // [ImageCompressor][compress][BLOCK_COMPRESS_DONE]
      name: compressedFile.name,
      originalSize: file.size,
      compressedSize: compressedFile.size,
      type: compressedFile.type,
    });
    // END_BLOCK_COMPRESS_DONE

    return compressedFile;
  } catch (error: any) {
    logger.error("compress", "BLOCK_COMPRESS_DONE", "Image compression failed", { // [ImageCompressor][compress][BLOCK_COMPRESS_DONE]
      error: error?.message || error,
    });
    throw new Error("COMPRESSION_FAILED");
  }
}
