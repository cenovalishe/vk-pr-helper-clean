// FILE: yc/__tests__/templates.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Unit tests for yc/templates.ts template CRUD Express handlers.
//   SCOPE: Validate list, create, update, delete operations, owner verification, auto-naming, and validation errors.
//   DEPENDS: M-YC-TEMPLATES
//   LINKS: V-M-YC-TEMPLATES
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   none - Test suite has no public exports
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of template CRUD endpoint unit tests]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from '../templates';
import * as db from '../db/index';
import * as logger from '../logger';

vi.mock('../db/index', () => ({
  query: vi.fn(),
  execute: vi.fn()
}));

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('M-YC-TEMPLATES - YcTemplatesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, 'log').mockImplementation(() => {});
  });

  it('scenario-YT1: GET /templates returns only templates owned by numericHash', async () => {
    const req = {
      user: { numericHash: 12345 }
    } as any;
    const res = mockRes();

    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 100, name: 'Template 1', text: 'Text 1', createdAt: 1000, updatedAt: 1100 },
      { id: '200', name: 'Template 2', text: 'Text 2', createdAt: 2000, updatedAt: 2200 }
    ]);

    await listTemplates(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith([
      { id: '100', name: 'Template 1', text: 'Text 1', createdAt: 1000, updatedAt: 1100 },
      { id: '200', name: 'Template 2', text: 'Text 2', createdAt: 2000, updatedAt: 2200 }
    ]);
    expect(logger.log).toHaveBeenCalledWith('YcTemplates', 'listTemplates', 'BLOCK_TEMPLATE_CRUD', 'Listing templates', { numericHash: 12345 });
  });

  it('scenario-YT2: POST /templates auto-names «Шаблон N» based on count when name is omitted', async () => {
    const req = {
      user: { numericHash: 12345 },
      body: { text: 'New Template Text' }
    } as any;
    const res = mockRes();

    // Mock count query returning 2 existing templates
    vi.mocked(db.query).mockResolvedValueOnce([
      { name: 'Template 1' },
      { name: 'Template 2' }
    ]);
    vi.mocked(db.execute).mockResolvedValueOnce(undefined);

    await createTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);

    const callArgs = vi.mocked(db.execute).mock.calls[0];
    const params = callArgs[1] as any;
    
    expect(params['$name'].value.textValue).toBe('Шаблон 3');
    expect(params['$text'].value.textValue).toBe('New Template Text');
    expect(params['$vkUserId'].value.uint64Value.toString()).toBe('12345');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Шаблон 3',
      text: 'New Template Text'
    }));
  });

  it('scenario-YT3: PATCH /templates/:id updates name+text and verifies ownership', async () => {
    const req = {
      user: { numericHash: 12345 },
      params: { id: '100' },
      body: { name: 'Updated Name', text: 'Updated Text' }
    } as any;
    const res = mockRes();

    // Mock query finding the template with correct ownership, then listing all for duplicate checks
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        { id: 100, vkUserId: 12345, name: 'Old Name', text: 'Old Text', createdAt: 1000 }
      ])
      .mockResolvedValueOnce([
        { id: 100, vkUserId: 12345, name: 'Old Name', text: 'Old Text' }
      ]);
    vi.mocked(db.execute).mockResolvedValueOnce(undefined);

    await updateTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: '100',
      name: 'Updated Name',
      text: 'Updated Text',
      createdAt: 1000
    }));
  });

  it('scenario-YT4: DELETE /templates/:id removes template and verifies ownership', async () => {
    const req = {
      user: { numericHash: 12345 },
      params: { id: '100' }
    } as any;
    const res = mockRes();

    // Mock query finding the template with correct ownership
    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 100, vkUserId: 12345 }
    ]);
    vi.mocked(db.execute).mockResolvedValueOnce(undefined);

    await deleteTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('scenario-YT5: Cross-owner update → 403 OWNER_MISMATCH. Template unchanged', async () => {
    const req = {
      user: { numericHash: 12345 },
      params: { id: '100' },
      body: { name: 'Updated Name', text: 'Updated Text' }
    } as any;
    const res = mockRes();

    // Mock query finding the template owned by another user (99999)
    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 100, vkUserId: 99999, name: 'Old Name', text: 'Old Text' }
    ]);

    await updateTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'OWNER_MISMATCH' });
  });

  it('scenario-YT6: Missing text on create → 400 VALIDATION_ERROR', async () => {
    const req = {
      user: { numericHash: 12345 },
      body: { name: 'Template' } // Missing 'text'
    } as any;
    const res = mockRes();

    await createTemplate(req, res);

    expect(db.query).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
  });

  it('scenario-YT7: POST /templates rate limits rapid creations (<5s)', async () => {
    const req = {
      user: { numericHash: 12345 },
      body: { name: 'New Template', text: 'Some text' }
    } as any;
    const res = mockRes();

    // Mock query finding a template created 2 seconds ago
    const now = Date.now();
    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 99, name: 'Template 1', text: 'Different text', createdAt: now - 2000 }
    ]);

    await createTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'RATE_LIMITED',
      message: 'Пожалуйста, подождите между созданием шаблонов'
    });
  });

  it('scenario-YT8: POST /templates rate limits daily max (>=20)', async () => {
    const req = {
      user: { numericHash: 12345 },
      body: { name: 'New Template', text: 'Some text' }
    } as any;
    const res = mockRes();

    // Mock query finding 20 templates created in the last 2 hours
    const now = Date.now();
    const existingTemplates = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      name: `Template ${i}`,
      text: `Text ${i}`,
      createdAt: now - 7200 * 1000 // 2 hours ago
    }));
    vi.mocked(db.query).mockResolvedValueOnce(existingTemplates);

    await createTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'RATE_LIMITED',
      message: 'Лимит создания шаблонов исчерпан (максимум 20 шаблонов в сутки)'
    });
  });

  it('scenario-YT9: POST /templates duplicate name check → 409 Conflict', async () => {
    const req = {
      user: { numericHash: 12345 },
      body: { name: 'Duplicated Name', text: 'Unique Text' }
    } as any;
    const res = mockRes();

    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 99, name: 'duplicated name', text: 'Other text', createdAt: Date.now() - 10000 }
    ]);

    await createTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'DUPLICATE_TEMPLATE',
      message: 'Шаблон с таким именем уже существует'
    });
  });

  it('scenario-YT10: POST /templates duplicate text with unique name check → 200 OK', async () => {
    const req = {
      user: { numericHash: 12345 },
      body: { name: 'Unique Name', text: 'duplicated text' }
    } as any;
    const res = mockRes();

    vi.mocked(db.query).mockResolvedValueOnce([
      { id: 99, name: 'Other Name', text: 'duplicated text', createdAt: Date.now() - 10000 }
    ]);
    vi.mocked(db.execute).mockResolvedValueOnce(undefined);

    await createTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Unique Name',
      text: 'duplicated text'
    }));
  });

  it('scenario-YT11: PATCH /templates/:id duplicate name check → 409 Conflict', async () => {
    const req = {
      user: { numericHash: 12345 },
      params: { id: '100' },
      body: { name: 'Duplicate Name' }
    } as any;
    const res = mockRes();

    // First query find the template being edited (100)
    // Second query lists existing templates (where template 99 has name "duplicate name")
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        { id: 100, vkUserId: 12345, name: 'Old Name', text: 'Text', createdAt: 1000 }
      ])
      .mockResolvedValueOnce([
        { id: 100, vkUserId: 12345, name: 'Old Name', text: 'Text' },
        { id: 99, vkUserId: 12345, name: 'duplicate name', text: 'Other Text' }
      ]);

    await updateTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.execute).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'DUPLICATE_TEMPLATE',
      message: 'Шаблон с таким именем уже существует'
    });
  });

  it('scenario-YT12: PATCH /templates/:id duplicate text with unique name check → 200 OK', async () => {
    const req = {
      user: { numericHash: 12345 },
      params: { id: '100' },
      body: { text: 'Duplicate Text' }
    } as any;
    const res = mockRes();

    // First query find the template being edited (100)
    // Second query lists existing templates (where template 99 has text "Duplicate Text")
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        { id: 100, vkUserId: 12345, name: 'Name', text: 'Old Text', createdAt: 1000 }
      ])
      .mockResolvedValueOnce([
        { id: 100, vkUserId: 12345, name: 'Name', text: 'Old Text' },
        { id: 99, vkUserId: 12345, name: 'Other Name', text: 'Duplicate Text' }
      ]);
    vi.mocked(db.execute).mockResolvedValueOnce(undefined);

    await updateTemplate(req, res);

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: '100',
      name: 'Name',
      text: 'Duplicate Text'
    }));
  });

  it('should return 401 on unauthorized template CRUD operations', async () => {
    const req = {
      user: undefined // Unauthorized
    } as any;
    const res = mockRes();

    await listTemplates(req, res);
    expect(res.status).toHaveBeenCalledWith(401);

    await createTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(401);

    await updateTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(401);

    await deleteTemplate(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
