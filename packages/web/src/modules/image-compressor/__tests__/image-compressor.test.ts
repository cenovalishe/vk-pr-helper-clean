// FILE: packages/web/src/modules/image-compressor/__tests__/image-compressor.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Tests for ImageCompressor module verifying image compression and format conversion
//   SCOPE: compressImage
//   DEPENDS: M-IMAGE-COMPRESSOR
//   LINKS: M-IMAGE-COMPRESSOR, V-M-IMAGE-COMPRESSOR
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   scenario-COMP1 - Compresses valid image File and returns a JPEG File
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Initial tests for ImageCompressor.
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compressImage } from "../index";
import imageCompression from "browser-image-compression";

vi.mock("browser-image-compression", () => {
  return {
    default: vi.fn().mockImplementation((file: File, options: any) => {
      // Mock returns a new File of type image/jpeg and size 1000
      return Promise.resolve(
        new File(["mock_compressed_data"], "compressed.jpg", {
          type: "image/jpeg",
        })
      );
    }),
  };
});

describe("ImageCompressor", () => {
  let consoleSpy: {
    info: any;
    error: any;
  };

  beforeEach(() => {
    consoleSpy = {
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scenario-COMP1: Compresses valid image File and returns a JPEG File", async () => {
    const originalFile = new File(["some_large_image_data_to_be_compressed"], "test.webp", {
      type: "image/webp",
    });

    const result = await compressImage(originalFile);

    expect(imageCompression).toHaveBeenCalledWith(
      originalFile,
      expect.objectContaining({
        maxSizeMB: 2,
        fileType: "image/jpeg",
        useWebWorker: false,
      })
    );

    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("compressed.jpg");

    // Check log markers are emitted
    const infoCalls = consoleSpy.info.mock.calls.map((call: any[]) => call[0]);
    const hasStartMarker = infoCalls.some((log: string) =>
      log.includes("[ImageCompressor][compress][BLOCK_COMPRESS_START]")
    );
    const hasDoneMarker = infoCalls.some((log: string) =>
      log.includes("[ImageCompressor][compress][BLOCK_COMPRESS_DONE]")
    );

    expect(hasStartMarker).toBe(true);
    expect(hasDoneMarker).toBe(true);
  });
});
