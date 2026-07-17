// FILE: packages/web/src/modules/submit/__tests__/mobile-adapt.test.tsx
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for SubmitForm mobile adaptation (scenarios S20, S21, and S22)
//   SCOPE: Testing viewport adaptive styles, text size overrides, scroll confinement, and log emission in M-SUBMIT
//   DEPENDS: M-SUBMIT.SubmitForm, M-ADAPTIVE, @vkontakte/vkui, react-router-dom
//   LINKS: M-SUBMIT, V-M-SUBMIT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   no exported symbols
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - Update S20 test assertions to match mobile-menu maxHeight: none and remove position: sticky header check]
// END_CHANGE_SUMMARY

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmitForm } from '../SubmitForm';
import { useAdaptivityConditionalRender } from '@vkontakte/vkui';
import { useAuth } from '../../auth';
import { useTemplateStore } from '../../templates';
import { useImageStore } from '../../images';
import { useIsMobile } from '../../adaptive';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ search: '' }),
}));

// Mock VKUI adaptivity hooks
vi.mock('@vkontakte/vkui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@vkontakte/vkui')>();
  return {
    ...original,
    useAdaptivityConditionalRender: vi.fn(),
  };
});

// Mock M-ADAPTIVE
vi.mock('../../adaptive', () => ({
  useIsMobile: vi.fn(),
}));

// Mock logger spy hoisted
const { mockLoggerInfo } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock hooks
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

describe('SubmitForm Mobile Adaptability Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ accessToken: 'fake-token' });
    (useImageStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ images: [] });
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: [{ id: 't1', name: 'Шаблон 1', text: 'Содержимое шаблона 1' }],
      loading: false,
    });
  });

  // Scenario S20
  it('S20: tablet- renders mobile search panel with maxHeight:none, scroll and desktop-styled title, and logs BLOCK_MOBILE_LAYOUT', () => {
    vi.mocked(useAdaptivityConditionalRender).mockReturnValue({
      viewWidth: {
        tabletPlus: false,
        tabletMinus: { className: 'mobile-view' },
      },
    } as any);
    vi.mocked(useIsMobile).mockReturnValue(true);

    render(<SubmitForm />);

    // Confinement wrapper assertion
    const mobileConfinement = screen.getByTestId('submit-mobile-confinement-scroll');
    expect(mobileConfinement).toBeInTheDocument();
    expect(mobileConfinement.style.maxHeight).toBe('none');
    expect(mobileConfinement.style.overflowY).toBe('auto');

    // Title assertion
    const title = screen.getByText('Поисковики');
    expect(title).toBeInTheDocument();

    // Trace log assertion
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'SubmitForm',
      'BLOCK_MOBILE_LAYOUT',
      'Rendering mobile-only communities section'
    );
  });

  // Scenario S21
  it('S21: inputs and textareas scale to font-size >= 16px on mobile viewports', () => {
    vi.mocked(useAdaptivityConditionalRender).mockReturnValue({
      viewWidth: {
        tabletPlus: false,
        tabletMinus: { className: 'mobile-view' },
      },
    } as any);
    
    // 1. Mobile viewport
    vi.mocked(useIsMobile).mockReturnValue(true);
    const { unmount } = render(<SubmitForm />);

    const communityInput = screen.getByTestId('community-input');
    const textInput = screen.getByTestId('text-input');

    expect(communityInput.style.fontSize).toBe('16px');
    expect(textInput.style.fontSize).toBe('16px');

    unmount();

    // 2. Desktop viewport regression check
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(<SubmitForm />);

    const communityInputDesktop = screen.getByTestId('community-input');
    const textInputDesktop = screen.getByTestId('text-input');

    expect(communityInputDesktop.style.fontSize).toBe('');
    expect(textInputDesktop.style.fontSize).toBe('');
  });

  // Scenario S22
  it('S22: tabletPlus hides mobile container, renders desktop sidebar, and layout is flexible', () => {
    vi.mocked(useAdaptivityConditionalRender).mockReturnValue({
      viewWidth: {
        tabletPlus: { className: 'desktop-view' },
        tabletMinus: false,
      },
    } as any);
    vi.mocked(useIsMobile).mockReturnValue(false);

    render(<SubmitForm />);

    // Mobile container MUST NOT render
    expect(screen.queryByTestId('submit-mobile-communities')).not.toBeInTheDocument();

    // Desktop sidebar MUST render
    expect(screen.getByTestId('submit-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('submit-form-container').className).toContain('submit-layout');
  });
});
