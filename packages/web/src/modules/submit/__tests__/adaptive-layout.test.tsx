// FILE: packages/web/src/modules/submit/__tests__/adaptive-layout.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for SubmitForm adaptive layout (scenarios S9 and S13)
//   SCOPE: Testing adaptive layouts (side panel presence/absence) in M-SUBMIT
//   DEPENDS: M-SUBMIT.SubmitForm, @vkontakte/vkui, react-router-dom
//   LINKS: M-SUBMIT, V-M-FE-SUBMIT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   no exported symbols
// END_MODULE_MAP

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmitForm } from '../SubmitForm';
import { useAdaptivityConditionalRender } from '@vkontakte/vkui';
import { useAuth } from '../../auth';
import { useTemplateStore } from '../../templates';
import { useImageStore } from '../../images';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ search: '' }),
}));

// Mock VKUI adaptivity hooks to control viewport rendering
vi.mock('@vkontakte/vkui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vkontakte/vkui')>();
  return {
    ...original,
    useAdaptivityConditionalRender: vi.fn(),
  };
});

// Mock other hooks
vi.mock('../../auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../templates', () => ({
  useTemplateStore: vi.fn(),
}));

vi.mock('../../images', () => ({
  useImageStore: vi.fn(),
  ImageUploader: () => <div data-testid="mock-image-uploader" />,
}));

vi.mock('../../communities', () => ({
  CommunityList: () => <div data-testid="mock-community-list" />,
}));

// Mock logger
vi.mock('@/shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('SubmitForm Adaptive Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ accessToken: 'fake-token' });
    (useImageStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ images: [] });
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: [],
      loading: false,
    });
  });

  // S-9 & S-13 tests
  it('S-9 & S-13: tablet- layout hides sidebar; tablet+ layout renders sidebar', () => {
    // 1. Test tablet- (Mobile)
    vi.mocked(useAdaptivityConditionalRender).mockReturnValue({
      viewWidth: {
        tabletPlus: false,
        tabletMinus: { className: 'mobile-view' },
      },
      viewHeight: {},
      sizeX: {},
      sizeY: {},
    } as any);

    const { unmount } = render(<SubmitForm />);

    expect(screen.queryByTestId('submit-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-picker-button')).not.toBeInTheDocument();

    unmount();

    // 2. Test tablet+ (Desktop)
    vi.mocked(useAdaptivityConditionalRender).mockReturnValue({
      viewWidth: {
        tabletPlus: { className: 'desktop-view' },
        tabletMinus: false,
      },
      viewHeight: {},
      sizeX: {},
      sizeY: {},
    } as any);

    render(<SubmitForm />);

    expect(screen.getByTestId('submit-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('open-picker-button')).not.toBeInTheDocument();
  });
});

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Create adaptive layout tests focusing on panel presence and verifying button is removed]
// END_CHANGE_SUMMARY
