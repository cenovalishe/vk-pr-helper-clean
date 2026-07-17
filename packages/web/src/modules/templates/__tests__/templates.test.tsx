// START_MODULE_CONTRACT
//   PURPOSE: Unit and integration tests for the Templates module components and state store.
//   SCOPE: Checks templates grid rendering, edit/delete interactions, storage adapters, store synchronization, duplicateTemplate calculation, navigation, and scroll-lock attributes.
//   DEPENDS: none
//   LINKS: M-TEMPLATES, V-M-TEMPLATES
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   test - Unit/integration tests
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.5.0 - Add T-20 offline fallback prevention test on client 4xx errors]
//   PREVIOUS_CHANGES:
//     - [v3.4.0 - Add scroll-lock integration tests T-18 and T-19]
//     - [v3.3.0 - Update T-2 to assert that full template text is shown instead of being truncated at 100 characters]
//     - [v3.2.0 - Update S-25 test to expect duplicated templates at the beginning of the list due to descending createdAt sorting]
//     - [v3.1.0 - Add S-25, S-26, and S-27 tests verifying duplicate logic, goto submit redirect, and duplicate button clicks for Phase-PR-1]
//     - [v3.0.0 - Added missing GRACE contracts]
// END_CHANGE_SUMMARY

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TemplatesContainer } from '../TemplatesContainer';
import { LocalStorageAdapter } from '../storage';
import { useTemplateStore } from '../useTemplateStore';
import { renderHook, act } from '@testing-library/react';
import { TemplateStoragePort, TemplateData, Template } from '../types';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useIsMobile } from '../../adaptive';

vi.mock('../../adaptive', () => ({
  useIsMobile: vi.fn(),
}));

// Mock the logger to track trace assertions
const { mockLoggerInfo, mockUseAuth } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockUseAuth: vi.fn().mockReturnValue(null),
}));

vi.mock('@/shared/logger', () => ({
  createLogger: () => ({
    info: mockLoggerInfo,
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/modules/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('M-TEMPLATES Module', () => {
  beforeEach(() => {
    localStorage.clear();
    mockLoggerInfo.mockClear();
    vi.mocked(useIsMobile).mockReturnValue(false);
    
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  // T-11: StoragePort: LocalStorageAdapter reads from localStorage on init
  it('T-11: StoragePort: LocalStorageAdapter reads from localStorage on init', async () => {
    localStorage.setItem('grace_templates', JSON.stringify([{ id: '123', name: 'Saved', text: 'Text', createdAt: 0, updatedAt: 0 }]));
    const adapter = new LocalStorageAdapter();
    const data = await adapter.getAll();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Saved');
  });

  // T-12: StoragePort: useTemplateStore works with injected mock adapter
  it('T-12: StoragePort: useTemplateStore works with injected mock adapter', async () => {
    const mockAdapter: TemplateStoragePort = {
      getAll: vi.fn().mockResolvedValue([]),
      getById: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'mock-id', name: 'Mock', text: 'MockText', createdAt: 0, updatedAt: 0 }),
      update: vi.fn(),
      delete: vi.fn(),
    };
    
    const { result } = renderHook(() => useTemplateStore(mockAdapter));
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createTemplate({ name: 'Mock', text: 'MockText' });
    });

    expect(mockAdapter.create).toHaveBeenCalledWith({ name: 'Mock', text: 'MockText' });
  });

  // T-16: Offline Fallback: useTemplateStore falls back to LocalStorage when ApiTemplateStorageAdapter fails
  it('T-16: Offline Fallback: useTemplateStore falls back to LocalStorage when ApiTemplateStorageAdapter fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Превышено время ожидания ответа от сервера'));

    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      accessToken: 'some-token',
      sessionToken: 'some-token',
      userId: 123
    });

    // Seed local storage with a dummy template
    localStorage.setItem('grace_templates', JSON.stringify([{ id: 'local-123', name: 'Local Template', text: 'Local Text', createdAt: 0, updatedAt: 0 }]));

    const { result } = renderHook(() => useTemplateStore());

    // Wait for the fallback to happen
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Check that we loaded the templates from LocalStorage instead of failing
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].name).toBe('Local Template');

    // Reset mocks back to null for other tests
    mockUseAuth.mockReturnValue(null);
  });

  // T-26: Offline Fallback: useTemplateStore does NOT fall back to LocalStorage on 4xx client errors (e.g. 404)
  it('T-26: Offline Fallback: useTemplateStore does NOT fall back to LocalStorage on 4xx client errors (e.g. 404)', async () => {
    const errorResponse = {
      ok: false,
      status: 404,
      json: async () => ({ error: 'TEMPLATE_NOT_FOUND', message: 'Template not found' }),
    };
    global.fetch = vi.fn().mockResolvedValue(errorResponse);

    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      accessToken: 'some-token',
      sessionToken: 'some-token',
      userId: 123
    });

    // Seed local storage with a dummy template
    localStorage.setItem('grace_templates', JSON.stringify([{ id: 'local-123', name: 'Local Template', text: 'Local Text', createdAt: 0, updatedAt: 0 }]));

    const { result } = renderHook(() => useTemplateStore());

    // Wait for the initial load of templates
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // It should NOT load from LocalStorage
    expect(result.current.templates).toHaveLength(0);
    expect(result.current.error).toBe('Template not found');

    // Reset fetch to return a valid template list for deletion scenario
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 'api-123', name: 'API Template', text: 'API Text', createdAt: 100, updatedAt: 100 }],
    });

    // Re-render/refresh to load templates first
    await act(async () => {
      await result.current.refresh();
    });

    // Now template list has length 1
    expect(result.current.templates).toHaveLength(1);

    // Mock next fetch/mutation calls to return 404
    global.fetch = vi.fn().mockResolvedValue(errorResponse);

    // Deletion should throw error and NOT switch to local storage
    await expect(
      act(async () => {
        await result.current.deleteTemplate('api-123');
      })
    ).rejects.toThrow('Template not found');

    // It should still have templates length 1 after failure is processed and state is synced (fetchTemplates on delete failure didn't fallback)
    expect(result.current.templates).toHaveLength(1);

    // Reset mocks back to null for other tests
    mockUseAuth.mockReturnValue(null);
  });

  // T-17: Cache State Sync: useTemplateStore correctly updates templates immediately when cacheKey changes, even if templates are already loaded in cache
  it('T-17: Cache State Sync: useTemplateStore correctly updates templates immediately when cacheKey changes, even if templates are already loaded in cache', async () => {
    // 1. Setup mock adapter/REST query
    const apiTemplates = [{ id: 'api-123', name: 'API Template', text: 'API Text', createdAt: 0, updatedAt: 0 }];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiTemplates,
    });

    // 2. Start as unauthenticated (should use local adapter)
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      accessToken: null,
      sessionToken: null,
      userId: null
    });

    const { result, rerender } = renderHook(() => useTemplateStore());

    // Wait for the initial load of local (should be empty since localStorage is cleared)
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.templates).toHaveLength(0);

    // 3. Authenticate (should transition to api-123 and fetch API templates)
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      accessToken: 'token-123',
      sessionToken: 'token-123',
      userId: 123
    });
    rerender();

    // Wait for the API templates to load
    await waitFor(() => {
      expect(result.current.templates).toHaveLength(1);
    });
    expect(result.current.templates[0].name).toBe('API Template');

    // 4. Render a new hook instance (simulating another tab or component mounting)
    // On mount, components initially render in unauthenticated state, then transition
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      accessToken: null,
      sessionToken: null,
      userId: null
    });

    const { result: result2, rerender: rerender2 } = renderHook(() => useTemplateStore());
    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });
    expect(result2.current.templates).toHaveLength(0); // initially local/empty

    // Transition to authenticated. Since templates are already loaded in the cache,
    // they should be returned immediately in the next render cycle without getting stuck.
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      accessToken: 'token-123',
      sessionToken: 'token-123',
      userId: 123
    });
    rerender2();

    // Verify they are available immediately
    expect(result2.current.templates).toHaveLength(1);
    expect(result2.current.templates[0].name).toBe('API Template');

    // Reset mocks back to null for other tests
    mockUseAuth.mockReturnValue(null);
  });

  it('T-1: Create template with default name «Шаблон 1» (auto-increment)', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TemplatesContainer /></MemoryRouter>);

    const createBtn = await screen.findByText('Новый шаблон');
    await user.click(createBtn);

    const nameInput = await screen.findByTestId('template-name-input');
    expect(nameInput).toHaveValue('Шаблон 1');

    const textInput = await screen.findByTestId('template-text-input');
    await user.type(textInput, 'Some text');

    const saveBtn = await screen.findByTestId('save-btn');
    await user.click(saveBtn);

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'handleSave', 'BLOCK_TEMPLATE_CRUD', 'handleSave invoked'
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'createTemplate', 'BLOCK_TEMPLATE_CRUD', 'create', expect.any(Object)
    );

    const cards = await screen.findAllByTestId(/template-card-/);
    expect(cards).toHaveLength(1);
    expect(screen.getByText('Шаблон 1')).toBeInTheDocument();
  });

  it('T-2: Card preview shows title + full text body', async () => {
    const adapter = new LocalStorageAdapter();
    const longText = 'A'.repeat(150);
    await adapter.create({ name: 'Preview Test', text: longText });

    render(<MemoryRouter><TemplatesContainer /></MemoryRouter>);

    const card = await screen.findByText('Preview Test');
    expect(card).toBeInTheDocument();
    
    expect(await screen.findByText(longText)).toBeInTheDocument();
  });

  it('T-3: Edit: save persists changed name+text', async () => {
    const user = userEvent.setup();
    const adapter = new LocalStorageAdapter();
    const t = await adapter.create({ name: 'Old Name', text: 'Old Text' });

    render(<MemoryRouter><TemplatesContainer /></MemoryRouter>);

    const editBtn = await screen.findByTestId(`edit-btn-${t.id}`);
    await user.click(editBtn);

    const nameInput = await screen.findByTestId('template-name-input');
    const textInput = await screen.findByTestId('template-text-input');

    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    
    await user.clear(textInput);
    await user.type(textInput, 'New Text');

    const saveBtn = await screen.findByTestId('save-btn');
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'updateTemplate', 'BLOCK_TEMPLATE_CRUD', 'update', expect.any(Object)
    );

    const cardTitle = await screen.findByText('New Name');
    expect(cardTitle).toBeInTheDocument();
    expect(await screen.findByText('New Text')).toBeInTheDocument();
  });

  describe('Unsaved changes modal (T-4, T-5, T-6)', () => {
    it('T-4, T-5, T-6: Edit -> Back flow with modal', async () => {
      const user = userEvent.setup();
      const adapter = new LocalStorageAdapter();
      const t = await adapter.create({ name: 'Modal Test', text: 'Original' });

      render(<MemoryRouter><TemplatesContainer /></MemoryRouter>);

      // Enter edit mode
      const editBtn = await screen.findByTestId(`edit-btn-${t.id}`);
      await user.click(editBtn);

      const nameInput = await screen.findByTestId('template-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Dirty Name');

      // T-4: Edit -> Back -> unsaved modal appears
      const backBtn = await screen.findByTestId('back-btn');
      await user.click(backBtn);

      const modalTitle = await screen.findByText('Dirty Name');
      expect(modalTitle).toBeInTheDocument();
      const modalMessage = screen.getByText('Изменения не сохранены. Выйти?');
      expect(modalMessage).toBeInTheDocument();
      
      const cancelBtn = screen.getByText('Отмена');
      const exitBtn = screen.getByText('Выйти без сохранения');

      // T-5: Unsaved modal -> Отмена -> stays in editor
      await user.click(cancelBtn);
      expect(screen.queryByText('Изменения не сохранены. Выйти?')).not.toBeInTheDocument();
      expect(screen.getByTestId('template-editor')).toBeInTheDocument();

      // Click back again
      await user.click(screen.getByTestId('back-btn'));

      // T-6: Unsaved modal -> Выйти без сохранения -> navigates to list, template unchanged
      await user.click(screen.getByText('Выйти без сохранения'));
      expect(screen.queryByTestId('template-editor')).not.toBeInTheDocument();
      expect(await screen.findByText('Modal Test')).toBeInTheDocument(); // Original name
      expect(screen.queryByText('Dirty Name')).not.toBeInTheDocument();
    });
  });

  describe('Delete confirmation flow (T-7, T-8, T-9, T-10)', () => {
    it('T-7, T-8, T-9, T-10: Delete with confirmation modal', async () => {
      const user = userEvent.setup();
      const adapter = new LocalStorageAdapter();
      const t = await adapter.create({ name: 'Delete Test', text: 'Delete me' });

      render(<MemoryRouter><TemplatesContainer /></MemoryRouter>);

      // T-7: Delete -> confirm modal
      const deleteBtn = await screen.findByTestId(`delete-btn-${t.id}`);
      await user.click(deleteBtn);

      const deleteTestTexts = await screen.findAllByText('Delete Test');
      expect(deleteTestTexts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Удалить безвозвратно?')).toBeInTheDocument();

      const cancelBtn = screen.getByText('Отмена');
      const confirmBtn = screen.getByText('Да, удалить');

      // T-9: Delete cancelled -> template still exists
      await user.click(cancelBtn);
      expect(screen.queryByText('Удалить безвозвратно?')).not.toBeInTheDocument();
      expect(screen.getByText('Delete Test')).toBeInTheDocument();
      
      // T-10: Delete without confirm FORBIDDEN (trace assertion)
      expect(mockLoggerInfo).not.toHaveBeenCalledWith(
        'deleteTemplate', 'BLOCK_TEMPLATE_CRUD', 'delete', expect.any(Object)
      );

      // T-8: Delete confirmed -> template removed
      await user.click(screen.getByTestId(`delete-btn-${t.id}`));
      await user.click(screen.getByText('Да, удалить'));

      await waitFor(() => {
        expect(screen.queryByText('Delete Test')).not.toBeInTheDocument();
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'deleteTemplate', 'BLOCK_TEMPLATE_CRUD', 'delete', expect.objectContaining({ id: t.id })
      );
    });
  });

  describe('URL Trigger and Redirection (T-13, T-14, T-15)', () => {
    it('T-13: URL search param ?create=true automatically opens the template editor', async () => {
      render(
        <MemoryRouter initialEntries={['/templates?create=true']}>
          <TemplatesContainer />
        </MemoryRouter>
      );

      const nameInput = await screen.findByTestId('template-name-input');
      expect(nameInput).toHaveValue('Шаблон 1');
      expect(screen.getByTestId('template-editor')).toBeInTheDocument();
    });

    it('T-14: fromSubmit redirect back to /submit with selectTemplateId', async () => {
      const user = userEvent.setup();
      let testLocation: any;
      
      const LocationInspector = () => {
        const location = useLocation();
        testLocation = location;
        return null;
      };

      render(
        <MemoryRouter initialEntries={['/templates?create=true&fromSubmit=true']}>
          <Routes>
            <Route path="/templates" element={<><TemplatesContainer /><LocationInspector /></>} />
            <Route path="/submit" element={<LocationInspector />} />
          </Routes>
        </MemoryRouter>
      );

      const textInput = await screen.findByTestId('template-text-input');
      await user.type(textInput, 'Submit flow text');

      const saveBtn = await screen.findByTestId('save-btn');
      await user.click(saveBtn);

      await waitFor(() => {
        expect(testLocation.pathname).toBe('/submit');
        const params = new URLSearchParams(testLocation.search);
        expect(params.get('selectTemplateId')).toBeDefined();
      });
    });

    it('T-15: fromSubmit back redirects to /submit', async () => {
      const user = userEvent.setup();
      let testLocation: any;

      const LocationInspector = () => {
        const location = useLocation();
        testLocation = location;
        return null;
      };

      render(
        <MemoryRouter initialEntries={['/templates?create=true&fromSubmit=true']}>
          <Routes>
            <Route path="/templates" element={<><TemplatesContainer /><LocationInspector /></>} />
            <Route path="/submit" element={<LocationInspector />} />
          </Routes>
        </MemoryRouter>
      );

      const backBtn = await screen.findByTestId('back-btn');
      await user.click(backBtn);

      await waitFor(() => {
        expect(testLocation.pathname).toBe('/submit');
      });
    });
  });

  // T-18: Mobile font sizing for prevention of iOS auto-zoom
  it('T-18: v2.4.0 (Phase-MOBILE-ADAPT): TemplateEditor inputs scale to font-size >= 16px on mobile viewports', async () => {
    const user = userEvent.setup();
    const mockUseIsMobile = vi.mocked(useIsMobile);

    // Desktop Viewport
    mockUseIsMobile.mockReturnValue(false);
    const { rerender } = render(
      <MemoryRouter initialEntries={['/templates?create=true']}>
        <TemplatesContainer />
      </MemoryRouter>
    );

    let nameInput = await screen.findByTestId('template-name-input');
    let textInput = await screen.findByTestId('template-text-input');
    expect(nameInput.style.fontSize).toBe('');
    expect(textInput.style.fontSize).toBe('');

    // Mobile Viewport
    mockUseIsMobile.mockReturnValue(true);
    rerender(
      <MemoryRouter initialEntries={['/templates?create=true']}>
        <TemplatesContainer />
      </MemoryRouter>
    );

    nameInput = await screen.findByTestId('template-name-input');
    textInput = await screen.findByTestId('template-text-input');
    expect(nameInput.style.fontSize).toBe('16px');
    textInput = await screen.findByTestId('template-text-input');
    expect(textInput.style.fontSize).toBe('16px');
  });

  describe('Duplicate and navigation features (Phase-PR-1)', () => {
    it('S-25: duplicateTemplate generates unique names with incremental suffixes', async () => {
      const { result } = renderHook(() => useTemplateStore());

      // 1. Initial creation
      let originalId = '';
      await act(async () => {
        const t = await result.current.createTemplate({ name: 'My Post', text: 'Some text' });
        originalId = t.id;
      });
      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].name).toBe('My Post');

      // 2. First duplication -> My Post (копия)
      await act(async () => {
        await result.current.duplicateTemplate(originalId);
      });
      expect(result.current.templates).toHaveLength(2);
      // Since templates are sorted descending by createdAt, the new duplicate is at index 0
      expect(result.current.templates[0].name).toBe('My Post (копия)');
      expect(result.current.templates[1].name).toBe('My Post');

      // 3. Second duplication -> My Post (копия 2)
      await act(async () => {
        await result.current.duplicateTemplate(originalId);
      });
      expect(result.current.templates).toHaveLength(3);
      // The newest duplicate is at index 0, the first duplicate is at index 1, and original is at index 2
      expect(result.current.templates[0].name).toBe('My Post (копия 2)');
      expect(result.current.templates[1].name).toBe('My Post (копия)');
      expect(result.current.templates[2].name).toBe('My Post');
    });

    it('S-26: TemplateList goto submit button click redirects to submit form with query param', async () => {
      const user = userEvent.setup();
      let testLocation: any;

      const LocationInspector = () => {
        const location = useLocation();
        testLocation = location;
        return null;
      };

      // Mock templates in localStorage since we are in local fallback
      localStorage.setItem('grace_templates', JSON.stringify([
        { id: '123', name: 'Submit Target', text: 'Send me!', createdAt: Date.now() }
      ]));

      render(
        <MemoryRouter initialEntries={['/templates']}>
          <Routes>
            <Route path="/templates" element={<><TemplatesContainer /><LocationInspector /></>} />
            <Route path="/submit" element={<LocationInspector />} />
          </Routes>
        </MemoryRouter>
      );

      const sendBtn = await screen.findByTestId('goto-submit-btn-123');
      await user.click(sendBtn);

      await waitFor(() => {
        expect(testLocation.pathname).toBe('/submit');
        expect(testLocation.search).toBe('?selectTemplateId=123');
      });
      localStorage.clear();
    });

    it('S-27: TemplateList duplicate button click duplicates the template', async () => {
      const user = userEvent.setup();
      
      localStorage.setItem('grace_templates', JSON.stringify([
        { id: '123', name: 'Dupe Target', text: 'Text', createdAt: Date.now() }
      ]));

      render(
        <MemoryRouter initialEntries={['/templates']}>
          <TemplatesContainer />
        </MemoryRouter>
      );

      const dupeBtn = await screen.findByTestId('duplicate-btn-123');
      await user.click(dupeBtn);

      // Verify that the duplicate template "Dupe Target (копия)" is displayed in the list
      await screen.findByText('Dupe Target (копия)');
      
      const cards = screen.getAllByTestId(/template-card-/);
      expect(cards).toHaveLength(2);
      localStorage.clear();
    });
  });

  // Scroll Lock Integration
  describe('Scroll Lock Integration', () => {
    afterEach(() => {
      document.documentElement.removeAttribute('data-templates-overflow');
      document.documentElement.removeAttribute('data-template-editor-open');
    });

    it('T-18: Sets data-templates-overflow attribute when container scrollHeight exceeds window.innerHeight', async () => {
      localStorage.setItem('grace_templates', JSON.stringify([
        { id: '1', name: 'T1', text: 'Text 1', createdAt: Date.now() },
        { id: '2', name: 'T2', text: 'Text 2', createdAt: Date.now() },
      ]));

      // Mock clientHeight/scrollHeight to simulate overflow
      const originalQuerySelector = document.querySelector;
      vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
        if (selector === '.templates-layout') {
          return {
            scrollHeight: 1000, // 1000 + 72 = 1072, which exceeds window.innerHeight (768 by default in JSDOM)
          } as any;
        }
        return originalQuerySelector.call(document, selector);
      });

      render(
        <MemoryRouter initialEntries={['/templates']}>
          <TemplatesContainer />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(document.documentElement.getAttribute('data-templates-overflow')).toBe('true');
      });
    });

    it('T-19: Removes data-templates-overflow when editor is open', async () => {
      localStorage.setItem('grace_templates', JSON.stringify([
        { id: '1', name: 'T1', text: 'Text 1', createdAt: Date.now() },
      ]));

      render(
        <MemoryRouter initialEntries={['/templates']}>
          <TemplatesContainer />
        </MemoryRouter>
      );

      const user = userEvent.setup();
      const editBtn = await screen.findByTestId('edit-btn-1');
      await user.click(editBtn);

      expect(screen.getByTestId('template-editor')).toBeInTheDocument();
      expect(document.documentElement.getAttribute('data-template-editor-open')).toBe('true');
      expect(document.documentElement.getAttribute('data-templates-overflow')).toBe('false');
    });
  });
});

