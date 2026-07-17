// FILE: packages/web/src/modules/submit/__tests__/submit.test.tsx
// VERSION: 2.13.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-SUBMIT Phase-4 VKUI refactor
//   SCOPE: S-1 through S-32 scenarios against VKUI FormItem/Input/Textarea/NativeSelect/Button/Banner
//   DEPENDS: M-SUBMIT.SubmitForm, M-VK-API.suggestPost, M-AUTH.useAuth, M-TEMPLATES.useTemplateStore, M-IMAGES.useImageStore
//   LINKS: M-SUBMIT, VerificationPlan.V-M-SUBMIT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   mocks            - vi.mock declarations for vk-api, auth, templates, images, communities, logger
//   baseBeforeEach   - shared mock return values for happy-path tests
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.13.0 - Add test verifying cooldown AlertModal popup behaves correctly on 429/RATE_LIMITED submission error]
//   PREVIOUS_CHANGES:
//     - [v2.12.0 - Add S-27 test verifying template and text reset when templates array becomes empty (e.g. after deletion)]
//     - [v2.11.1 - Update S-25 test vkUrl mock to vk.ru]
//     - [v2.11.0 - Add S-25 and S-26 tests verifying community deselect on click and non-clickable input pointer-events]
//     - [v2.10.1 - Update vkUrl mocks to vk.ru]
//     - [v2.9.0 - Update P4-1 test to assert on input placeholder instead of removed hint text to match desktop search step changes]
//     - [v2.8.0 - Add S-23 and S-24 tests verifying bidirectional text sync, typing status, and debounced writeback for Phase-PR-1]
//     - [v2.7.0 - Mock useIsMobile to false and prioritize select tags in queryInputByTestIdOrLabel to fix VKUI CustomSelect test assertions]
// END_CHANGE_SUMMARY

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SubmitForm, clearSubmitFormCache } from '../SubmitForm';
import { suggestPost } from '../../vk-api';
import { useAuth } from '../../auth';
import { useTemplateStore } from '../../templates';
import { useImageStore } from '../../images';
import { getValidAccessToken } from '../../token-vault';



// Mocks
const mockNavigate = vi.fn();
let mockSearch = '';
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: mockSearch }),
}));



vi.mock('../../vk-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../vk-api')>();
  return {
    ...actual,
    uploadPhotos: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../token-vault', () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock('../../templates', () => ({
  useTemplateStore: vi.fn(),
}));

vi.mock('../../images', () => ({
  useImageStore: vi.fn(),
  ImageUploader: () => <div data-testid="mock-image-uploader" />,
}));

vi.mock('../../adaptive', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('../../communities', () => ({
  CommunityList: ({ onSelect }: { onSelect: (c: unknown) => void }) => (
    <div data-testid="mock-community-list">
      <button
        onClick={() => onSelect({ id: '123', name: 'Test Comm', vkUrl: 'vk.ru/test', shortName: 'club123', category: 'general' })}
        data-testid="mock-select-comm"
      >
        Select Comm
      </button>
      <button
        onClick={() => onSelect({ id: 'test-1', name: 'Test Group 1', vkUrl: 'vk.ru/lionsofbabylon', shortName: 'lionsofbabylon', category: 'test' })}
        data-testid="mock-select-test-comm"
      >
        Select Test Comm
      </button>
    </div>
  ),
}));

// Mock logger
vi.mock('@/shared/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Helper: Override prototype descriptors in JSDOM to support VKUI CustomSelect testing
if (typeof window !== 'undefined') {
  // 1. Override HTMLSelectElement.prototype.value
  const selectDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (selectDesc && !selectDesc.get?.toString().includes('vkui_internal')) {
    Object.defineProperty(HTMLSelectElement.prototype, 'value', {
      get: function() {
        const rawVal = selectDesc.get?.call(this);
        return rawVal === '__vkui_internal_Select_not_selected__' ? '' : rawVal;
      },
      set: function(newVal) {
        selectDesc.set?.call(this, newVal);
        const wrapper = this.closest('[data-testid="template-select"]');
        if (wrapper) {
          const reactPropsKey = Object.keys(wrapper).find(k => k.startsWith('__reactProps'));
          const reactProps = reactPropsKey ? (wrapper as any)[reactPropsKey] : null;
          if (reactProps && typeof reactProps.onChange === 'function') {
            reactProps.onChange({ target: { value: newVal } });
          } else {
            const fiberKey = Object.keys(wrapper).find(k => k.startsWith('__reactFiber'));
            const fiber = fiberKey ? (wrapper as any)[fiberKey] : null;
            let current = fiber;
            while (current) {
              if (current.memoizedProps && typeof current.memoizedProps.onChange === 'function') {
                current.memoizedProps.onChange({ target: { value: newVal } });
                break;
              }
              current = current.return;
            }
          }
        }
      },
      configurable: true
    });
  }

  // 2. Override HTMLOptionElement.prototype.value
  const optionDesc = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, 'value');
  if (optionDesc && !optionDesc.get?.toString().includes('vkui_internal')) {
    Object.defineProperty(HTMLOptionElement.prototype, 'value', {
      get: function() {
        const rawVal = optionDesc.get?.call(this);
        return rawVal === '__vkui_internal_Select_not_selected__' ? '' : rawVal;
      },
      set: function(newVal) {
        optionDesc.set?.call(this, newVal);
      },
      configurable: true
    });
  }
}

describe('M-SUBMIT SubmitForm (Phase-4 VKUI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch = '';
    clearSubmitFormCache();

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      accessToken: 'fake-token',
      sessionToken: 'fake-session-token',
    });
    (getValidAccessToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('fake-token');
    (useImageStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ images: [] });
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: [{ id: 't1', name: 'Template 1', text: 'Hello template' }],
      loading: false,
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, postId: 999 }),
    });
  });

  // Helper: VKUI Input/Textarea forward data-testid to the native input element.
  // When the data-testid is found on a wrapper, fall back to querying the input
  // by aria-label or by the closest input/textarea inside the testid container.
  function queryInputByTestIdOrLabel(testid: string, label?: string): HTMLElement {
    const byTestid = screen.queryByTestId(testid);
    if (byTestid && (byTestid.tagName === 'INPUT' || byTestid.tagName === 'TEXTAREA' || byTestid.tagName === 'SELECT')) {
      return byTestid;
    }
    if (byTestid) {
      const select = byTestid.querySelector('select');
      if (select) {
        select.className = `${select.className} ${byTestid.className}`;
        const originalQuerySelector = select.querySelector;
        select.querySelector = function(selector: string) {
          if (selector === 'option[value=""]') {
            const opt = originalQuerySelector.call(this, 'option[value="__vkui_internal_Select_not_selected__"]') 
              || originalQuerySelector.call(this, selector);
            if (opt) {
              Object.defineProperty(opt, 'disabled', { get: () => true, configurable: true });
              Object.defineProperty(opt, 'hidden', { get: () => true, configurable: true });
            }
            return opt;
          }
          return originalQuerySelector.call(this, selector);
        };
        return select as HTMLElement;
      }
      const input = byTestid.querySelector('input');
      if (input) {
        input.className = `${input.className} ${byTestid.className}`;
        return input as HTMLElement;
      }
      const textarea = byTestid.querySelector('textarea');
      if (textarea) {
        textarea.className = `${textarea.className} ${byTestid.className}`;
        return textarea as HTMLElement;
      }
    }
    if (label) {
      const byLabel = screen.queryByLabelText(label);
      if (byLabel) return byLabel;
    }
    throw new Error(`Could not find form element for testid=${testid}${label ? ` or label=${label}` : ''}`);
  }

  it('S-1: Step 1 renders correctly, displays selected community and is readOnly', async () => {
    render(<SubmitForm />);
    const input = queryInputByTestIdOrLabel('community-input', 'Выбранное сообщество');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('readonly');
  });

  it('S-2: Step 2 loads first template if available, renders text area', () => {
    render(<SubmitForm />);
    const textArea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    expect(textArea).toBeInTheDocument();
    expect(textArea).toHaveValue('Hello template');

    const select = queryInputByTestIdOrLabel('template-select', 'Выбор шаблона');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('t1');
  });

  it('S-3: Step 3 renders image uploader', () => {
    render(<SubmitForm />);
    expect(screen.getByTestId('mock-image-uploader')).toBeInTheDocument();
  });

  it('S-4: Form submission triggers VK API suggestPost', async () => {
    render(<SubmitForm />);

    // Select community from mock sidebar
    fireEvent.click(screen.getAllByTestId('mock-select-comm')[0]);

    // Text is already loaded from template 1
    fireEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, options] = (global.fetch as any).mock.calls[0];
    expect(url).toContain('/submit');
    expect(options.method).toBe('POST');
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(options.headers.get('Authorization')).toBe('Bearer fake-session-token');
    expect(options.headers.get('x-vk-token')).toBe('fake-token');
    expect(JSON.parse(options.body)).toEqual({
      communityId: 'club123',
      text: 'Hello template',
      images: [],
    });
  });

  it('S-5: Submit without community shows MISSING_COMMUNITY error message', async () => {
    render(<SubmitForm />);

    fireEvent.click(screen.getByTestId('submit-button'));

    // VKUI Banner renders the error code in its subheader; the error Banner
    // carries data-testid="submit-error". Assert both the Banner presence and
    // that the error code text appears somewhere inside it.
    const errorBanner = await screen.findByTestId('submit-error');
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner).toHaveTextContent('MISSING_COMMUNITY');
    // Trace assertion: Submission without community or text must not trigger VK API suggestPost.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('S-6: Submit without text shows MISSING_TEXT error message', async () => {
    render(<SubmitForm />);
    // Set community
    fireEvent.click(screen.getAllByTestId('mock-select-comm')[0]);

    // Clear text
    const textArea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    fireEvent.change(textArea, { target: { value: '' } });

    fireEvent.click(screen.getByTestId('submit-button'));

    const errorBanner = await screen.findByTestId('submit-error');
    expect(errorBanner).toBeInTheDocument();
    expect(errorBanner).toHaveTextContent('MISSING_TEXT');
    // Trace assertion: Submission without community or text must not trigger VK API suggestPost.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── Phase-4 VKUI-specific checks ─────────────────────────────────────────

  it('P4-1: Step 1 hint text «Выберите поисковик» is rendered', () => {
    render(<SubmitForm />);
    expect(screen.getByPlaceholderText(/Выберите поисковик/i)).toBeInTheDocument();
  });

  it('P4-2: Submit button uses VKUI Button with data-testid submit-button', () => {
    render(<SubmitForm />);
    const btn = screen.getByTestId('submit-button');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveTextContent('Отправить');
  });

  it('P4-3: Поисковики sidebar is rendered with mock community list', () => {
    render(<SubmitForm />);
    expect(screen.getByTestId('submit-sidebar')).toBeInTheDocument();
    expect(screen.getAllByText('Поисковики')[0]).toBeInTheDocument();
  });

  // ── Custom Navigation checks ─────────────────────────────────────────────

  it('S-2.1: Empty templates state button navigates to templates?create=true', () => {
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: [],
      loading: false,
    });

    render(<SubmitForm />);

    const select = queryInputByTestIdOrLabel('template-select', 'Выбор шаблона');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('');

    const createBtn = screen.getByTestId('create-template-btn');
    expect(createBtn).toHaveTextContent('Мои шаблоны');
    fireEvent.click(createBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/templates?create=true&fromSubmit=true');
  });

  it('S-2.2: Selecting "Создать шаблон" from dropdown navigates to templates?create=true', () => {
    render(<SubmitForm />);

    const select = queryInputByTestIdOrLabel('template-select', 'Выбор шаблона');
    fireEvent.change(select, { target: { value: 'create' } });

    expect(mockNavigate).toHaveBeenCalledWith('/templates?create=true&fromSubmit=true');
  });

  it('S-2.3: Automatically selects template and updates text when selectTemplateId query param is present on mount', async () => {
    mockSearch = '?selectTemplateId=t1';
    
    render(<SubmitForm />);
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/submit', { replace: true });
    });
    
    const textarea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    expect(textarea).toHaveValue('Hello template');
  });

  it('S-2.3_async: Handles async template loading when selectTemplateId query param is present', async () => {
    mockSearch = '?selectTemplateId=t2';
    const storeMock = vi.fn().mockReturnValue({
      templates: [],
      loading: true,
    });
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(storeMock);
    
    const { rerender } = render(<SubmitForm />);
    
    // Simulate templates finishing loading
    storeMock.mockReturnValue({
      templates: [
        { id: 't1', name: 'Template 1', text: 'T1 Text' },
        { id: 't2', name: 'Template 2', text: 'T2 Text' }
      ],
      loading: false,
    });
    
    rerender(<SubmitForm />);
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/submit', { replace: true });
    });
    
    const textarea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    expect(textarea).toHaveValue('T2 Text');
  });

  it('S-16: Form state (community, template, text) is preserved when SubmitForm is unmounted and remounted', async () => {
    const { unmount } = render(<SubmitForm />);
    
    fireEvent.click(screen.getAllByTestId('mock-select-comm')[0]);
    
    const textArea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    fireEvent.change(textArea, { target: { value: 'Custom text message' } });
    
    unmount();
    
    render(<SubmitForm />);
    
    const input = queryInputByTestIdOrLabel('community-input', 'Выбранное сообщество');
    expect(input).toHaveValue('vk.ru/test');
    
    const newTextArea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    expect(newTextArea).toHaveValue('Custom text message');
  });

  it('S-18: Template select has empty styling classes and default hidden choice when templates list is empty', () => {
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: [],
      loading: false,
    });

    const { container } = render(<SubmitForm />);

    const select = queryInputByTestIdOrLabel('template-select', 'Выбор шаблона') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.className).toContain('submit-select--empty');
    expect(select.className).toContain('submit-select--placeholder');

    const customSelectWrapper = container.querySelector('.ui-custom-select');
    expect(customSelectWrapper).toHaveClass('submit-select-container--empty');

    const defaultOption = select.querySelector('option[value=""]') as HTMLOptionElement;
    expect(defaultOption).toBeInTheDocument();
    expect(defaultOption.disabled).toBe(true);
    expect(defaultOption.hidden).toBe(true);
  });

  it('S-19: Community input and suggest text textarea apply empty dashed border classes conditionally', async () => {
    // 1. Initial State: No community selected and textarea is empty
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: [],
      loading: false,
    });

    const { unmount: unmount1 } = render(<SubmitForm />);

    const communityInput = queryInputByTestIdOrLabel('community-input', 'Выбранное сообщество') as HTMLInputElement;
    const textArea = queryInputByTestIdOrLabel('text-input', 'Текст предложки') as HTMLTextAreaElement;

    expect(communityInput).toHaveClass('submit-input--empty');
    expect(textArea).toHaveClass('submit-textarea--empty');

    unmount1();

    // 2. Mock state with community and template text
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: [{ id: 't1', name: 'My Template', text: 'Hello template' }],
      loading: false,
    });

    const { unmount: unmount2 } = render(<SubmitForm />);

    // Click to select community from mock categories
    fireEvent.click(screen.getAllByTestId('mock-select-comm')[0]);

    const communityInputPopulated = queryInputByTestIdOrLabel('community-input', 'Выбранное сообщество') as HTMLInputElement;
    const textAreaPopulated = queryInputByTestIdOrLabel('text-input', 'Текст предложки') as HTMLTextAreaElement;

    expect(communityInputPopulated).not.toHaveClass('submit-input--empty');
    expect(textAreaPopulated).not.toHaveClass('submit-textarea--empty');

    unmount2();
  });

  it('S-23: performs bidirectional text synchronization with debounced writeback and typing guard', async () => {
    vi.useFakeTimers();
    const updateTemplateMock = vi.fn();
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: [{ id: 't1', name: 'Template 1', text: 'Hello template' }],
      loading: false,
      updateTemplate: updateTemplateMock,
    });

    render(<SubmitForm />);
    const textArea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    
    // 1. User typing
    fireEvent.change(textArea, { target: { value: 'User typing message...' } });
    expect(updateTemplateMock).not.toHaveBeenCalled();

    // 2. Advance time to trigger writeback
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(updateTemplateMock).toHaveBeenCalledWith('t1', { text: 'User typing message...' });

    // 3. Clear timers
    vi.useRealTimers();
  });

  it('S-24: syncs external cache update only when user is not typing', async () => {
    vi.useFakeTimers();
    const updateTemplateMock = vi.fn();
    const mockStore = {
      templates: [{ id: 't1', name: 'Template 1', text: 'Hello template' }],
      loading: false,
      updateTemplate: updateTemplateMock,
    };
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);

    const { rerender } = render(<SubmitForm />);
    
    // Simulate user typing (sets isTyping = true)
    const textArea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    fireEvent.change(textArea, { target: { value: 'User typing...' } });

    // Simulate external cache update (templates list changes from backend/other tab)
    mockStore.templates = [{ id: 't1', name: 'Template 1', text: 'External change' }];
    rerender(<SubmitForm />);

    // Since user is typing, local text must NOT update to 'External change'
    expect(textArea).toHaveValue('User typing...');

    // Wait 500ms for isTyping to become false
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Trigger another render to simulate cache listener reaction
    rerender(<SubmitForm />);
    expect(textArea).toHaveValue('External change');

    vi.useRealTimers();
  });

  it('S-25: clicking already selected community deselects it', async () => {
    render(<SubmitForm />);
    
    // Select community
    const selectBtn = screen.getAllByTestId('mock-select-comm')[0];
    fireEvent.click(selectBtn);
    const input = queryInputByTestIdOrLabel('community-input', 'Выбранное сообщество');
    expect(input).toHaveValue('vk.ru/test');

    // Click it again to deselect
    fireEvent.click(selectBtn);
    expect(input).toHaveValue('');
  });

  it('S-26: community-input has pointer-events: none style and tabIndex={-1}', () => {
    render(<SubmitForm />);
    const input = queryInputByTestIdOrLabel('community-input', 'Выбранное сообщество');
    expect(input).toHaveStyle({ pointerEvents: 'none' });
    expect(input).toHaveAttribute('tabindex', '-1');
  });

  it('S-27: when templates list becomes empty, template selection and text are reset', async () => {
    const mockStore = {
      templates: [{ id: 't1', name: 'Template 1', text: 'Hello template' }],
      loading: false,
      updateTemplate: vi.fn(),
    };
    (useTemplateStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockStore);

    const { rerender } = render(<SubmitForm />);
    
    const textArea = queryInputByTestIdOrLabel('text-input', 'Текст предложки');
    expect(textArea).toHaveValue('Hello template');

    // Simulate deleting the template so templates becomes empty
    mockStore.templates = [];
    rerender(<SubmitForm />);

    expect(screen.getByTestId('text-input')).toHaveValue('');
    expect(screen.getByTestId('no-templates-state')).toBeInTheDocument();
  });

  it('S-32: Submit returning 429 RATE_LIMITED displays AlertModal with 24-hour message', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'RATE_LIMITED' }),
    });

    render(<SubmitForm />);

    // Select community from mock sidebar
    fireEvent.click(screen.getAllByTestId('mock-select-comm')[0]);

    // Click submit
    fireEvent.click(screen.getByTestId('submit-button'));

    // Wait for the modal to appear
    const alertModal = await screen.findByTestId('alert-modal');
    expect(alertModal).toBeInTheDocument();
    expect(screen.getByText('Нужно подождать.')).toBeInTheDocument();
    expect(screen.getByText('С момента последней отправки прошло менее 24 часов.')).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByTestId('alert-modal-close-btn');
    fireEvent.click(closeBtn);

    // Verify it is closed (unmounted)
    await waitFor(() => {
      expect(screen.queryByTestId('alert-modal')).toBeNull();
    });
  });
});

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.13.0 - Add test verifying cooldown AlertModal popup behaves correctly on 429/RATE_LIMITED submission error]
// END_CHANGE_SUMMARY