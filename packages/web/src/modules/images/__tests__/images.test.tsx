// START_MODULE_CONTRACT
//   PURPOSE: Unit/integration tests for the Images module.
//   SCOPE: Checks image compression flow, validation limits, upload triggers, reordering, and store logic.
//   DEPENDS: none
//   LINKS: M-IMAGES, V-M-IMAGES
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   test - Unit/integration tests
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v4.2.0 - Add tests for isUploading loading state and concurrent upload/limit protection]
//   PREVIOUS_CHANGES:
//     - [v4.1.2 - Update I-7 test assertion to look for "Загрузить" instead of "Загрузить с устройства" per user request]
//     - [v4.1.1 - Updated MODULE_CONTRACT to satisfy standard GRACE lint profile]
// END_CHANGE_SUMMARY

/**
 * @grace_module Images
 */

import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ImageUploader } from '../ImageUploader';
import { clearImageStoreCache } from '../useImageStore';
import { useIsMobile } from '../../adaptive';
import { compressImage } from '../../image-compressor';

vi.mock('../../adaptive', () => ({
  useIsMobile: vi.fn(),
}));

// Mock ImageCompressor
vi.mock('../../image-compressor', () => ({
  compressImage: vi.fn().mockImplementation((file: File) => Promise.resolve(file)),
}));

// Mock URL API
const mockCreateObjectURL = vi.fn((file: File) => `blob:${file.name}`);
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;
  clearImageStoreCache();
  vi.mocked(useIsMobile).mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

function createMockFile(name: string, size: number, type = 'image/png'): File {
  const file = new File([''], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('Images Module', () => {
  it('I-7: Empty state: preview area empty, button visible', () => {
    render(<ImageUploader />);
    
    const button = screen.getByText('Загрузить');
    expect(button).toBeInTheDocument();
    
    const previews = screen.queryAllByRole('img');
    expect(previews).toHaveLength(0);
  });

  it('I-1: Upload 1-6 images: each preview rendered, File stored', async () => {
    render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    const files = Array.from({ length: 6 }, (_, i) => createMockFile(`test${i}.png`, 1024));
    
    await userEvent.upload(input, files);
    
    const previews = screen.getAllByRole('img');
    expect(previews).toHaveLength(6);
    
    previews.forEach((preview, i) => {
      expect(preview).toHaveAttribute('src', `blob:test${i}.png`);
    });
  });

  it('I-2: 7th image rejected: MAX_IMAGES_EXCEEDED error, 6 images unchanged', async () => {
    render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    const files = Array.from({ length: 7 }, (_, i) => createMockFile(`test${i}.png`, 1024));
    
    await userEvent.upload(input, files);
    
    const previews = screen.getAllByRole('img');
    expect(previews).toHaveLength(6);
    
    // Check that the first 6 were added
    expect(previews[0]).toHaveAttribute('src', 'blob:test0.png');
    expect(previews[5]).toHaveAttribute('src', 'blob:test5.png');
  });

  it('I-3: File >7MB rejected: FILE_TOO_LARGE error', async () => {
    render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    const validFile = createMockFile('valid.png', 1024);
    const invalidFile = createMockFile('large.png', 8 * 1024 * 1024); // 8MB
    
    await userEvent.upload(input, [validFile, invalidFile]);
    
    const previews = screen.getAllByRole('img');
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveAttribute('src', 'blob:valid.png');
  });

  it('I-4: Reorder ← (move left): image at index N moves to N-1', async () => {
    render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    const files = [createMockFile('1.png', 1024), createMockFile('2.png', 1024)];
    
    await userEvent.upload(input, files);
    
    // Initial order: 1, 2
    let previews = screen.getAllByRole('img');
    expect(previews[0]).toHaveAttribute('src', 'blob:1.png');
    
    const moveLeftBtns = screen.getAllByLabelText('Move left');
    expect(moveLeftBtns[0]).toBeDisabled(); // First image can't move left
    
    // Click move left on the second image
    await userEvent.click(moveLeftBtns[1]);
    
    previews = screen.getAllByRole('img');
    expect(previews[0]).toHaveAttribute('src', 'blob:2.png');
    expect(previews[1]).toHaveAttribute('src', 'blob:1.png');
  });

  it('I-5: Reorder → (move right): image at index N moves to N+1', async () => {
    render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    const files = [createMockFile('1.png', 1024), createMockFile('2.png', 1024)];
    
    await userEvent.upload(input, files);
    
    const moveRightBtns = screen.getAllByLabelText('Move right');
    expect(moveRightBtns[1]).toBeDisabled(); // Second image can't move right
    
    // Click move right on the first image
    await userEvent.click(moveRightBtns[0]);
    
    const previews = screen.getAllByRole('img');
    expect(previews[0]).toHaveAttribute('src', 'blob:2.png');
    expect(previews[1]).toHaveAttribute('src', 'blob:1.png');
  });

  it('I-6: Delete image via × button: removed, remaining re-indexed', async () => {
    render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    const files = [
      createMockFile('1.png', 1024),
      createMockFile('2.png', 1024),
      createMockFile('3.png', 1024)
    ];
    
    await userEvent.upload(input, files);
    
    const deleteBtns = screen.getAllByLabelText('Delete image');
    
    // Delete second image
    await userEvent.click(deleteBtns[1]);
    
    const previews = screen.getAllByRole('img');
    expect(previews).toHaveLength(2);
    expect(previews[0]).toHaveAttribute('src', 'blob:1.png');
    expect(previews[1]).toHaveAttribute('src', 'blob:3.png');
  });

  it('I-8: Images state is preserved when ImageUploader is unmounted and remounted', async () => {
    const { unmount } = render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    const files = [createMockFile('test1.png', 1024)];
    
    await userEvent.upload(input, files);
    
    let previews = screen.getAllByRole('img');
    expect(previews).toHaveLength(1);
    
    // Unmount
    unmount();
    
    // Render again
    render(<ImageUploader />);
    
    previews = screen.getAllByRole('img');
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveAttribute('src', 'blob:test1.png');
  });

  // I-9: Mobile button touch target size and safe area margin
  it('I-9: v4.2.1 (Phase-MOBILE-ADAPT): buttons size and bottom safe area margin are applied on mobile', async () => {
    const mockUseIsMobile = vi.mocked(useIsMobile);

    // 1. Desktop case
    mockUseIsMobile.mockReturnValue(false);
    const { rerender } = render(<ImageUploader />);
    
    // Add one image to render delete/reorder buttons
    const input = screen.getByTestId('file-upload-input');
    await userEvent.upload(input, [createMockFile('test.png', 1024)]);

    const uploaderContainer = screen.getByTestId('image-previews').parentElement!;
    expect(uploaderContainer.style.marginBottom).toBe('');

    const deleteBtn = screen.getByLabelText('Delete image');
    expect(deleteBtn.style.width).toBe('');
    expect(deleteBtn.style.height).toBe('');

    const moveBtns = screen.getAllByLabelText(/Move /);
    expect(moveBtns[0].style.height).toBe('');
    expect(moveBtns[0].style.minWidth).toBe('');

    // 2. Mobile case
    mockUseIsMobile.mockReturnValue(true);
    rerender(<ImageUploader />);

    expect(uploaderContainer.style.marginBottom).toBe('var(--safe-area-inset-bottom, 0px)');
    expect(deleteBtn.style.width).toBe('26px');
    expect(deleteBtn.style.height).toBe('26px');
    expect(moveBtns[0].style.height).toBe('24px');
    expect(moveBtns[0].style.minWidth).toBe('24px');
  });

  it('I-10: isUploading state is true during uploads and false after', async () => {
    let resolveCompression: (file: File) => void = () => {};
    const compressionPromise = new Promise<File>((resolve) => {
      resolveCompression = resolve;
    });
    
    vi.mocked(compressImage).mockImplementation(() => compressionPromise);

    render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    const file = createMockFile('async_test.png', 1024);

    // Use fireEvent to trigger event handler synchronously
    fireEvent.change(input, {
      target: { files: [file] }
    });

    const loadingText = await screen.findByText('Загрузка...');
    expect(loadingText).toBeInTheDocument();
    
    const spinner = screen.getByTestId('upload-spinner');
    expect(spinner).toBeInTheDocument();

    const fileInput = screen.getByTestId('file-upload-input') as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);

    await act(async () => {
      resolveCompression(file);
      await compressionPromise;
    });

    const buttonText = await screen.findByText('Загрузить');
    expect(buttonText).toBeInTheDocument();
    expect(screen.queryByTestId('upload-spinner')).not.toBeInTheDocument();
    expect(fileInput.disabled).toBe(false);
  });

  it('I-11: concurrent uploads reject additional files if limits would be exceeded', async () => {
    let resolveCompression: (file: File) => void = () => {};
    const compressionPromise = new Promise<File>((resolve) => {
      resolveCompression = resolve;
    });

    vi.mocked(compressImage).mockImplementation(() => compressionPromise);

    render(<ImageUploader />);
    
    const input = screen.getByTestId('file-upload-input');
    
    const wave1 = Array.from({ length: 5 }, (_, i) => createMockFile(`w1_${i}.png`, 1024));
    const wave2 = Array.from({ length: 2 }, (_, i) => createMockFile(`w2_${i}.png`, 1024));

    // Fire both wave events synchronously
    fireEvent.change(input, { target: { files: wave1 } });
    fireEvent.change(input, { target: { files: wave2 } });

    await act(async () => {
      resolveCompression(wave1[0]);
      await compressionPromise;
    });

    const previews = screen.getAllByRole('img');
    expect(previews).toHaveLength(6);
  });
});
