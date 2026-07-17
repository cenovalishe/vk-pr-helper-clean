// FILE: yc/templates.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: CRUD endpoints for user templates stored in YDB with owner isolation, rate limits, and spam prevention.
//   SCOPE: listTemplates, createTemplate, updateTemplate, deleteTemplate Express handlers with rate limiting and duplicate check logic.
//   DEPENDS: M-YC-AUTH-CTX, M-YC-DB, M-YC-LOGGER
//   LINKS: M-YC-TEMPLATES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   listTemplates - Express GET /templates handler
//   createTemplate - Express POST /templates handler
//   updateTemplate - Express PATCH /templates/:id handler
//   deleteTemplate - Express DELETE /templates/:id handler
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - Add rate limits and duplicate prevention for template creation and updating]
//   PREVIOUS_CHANGES:
//     - [v1.0.1 - Add NaN/non-positive guard on template ID in updateTemplate and deleteTemplate]
// END_CHANGE_SUMMARY

import { Request, Response } from 'express';
import { TypedValues } from 'ydb-sdk';
import { query, execute } from './db/index';
import { log } from './logger';

// START_CONTRACT: listTemplates
//   PURPOSE: Express GET /templates handler, lists all templates owned by authenticated user (numericHash).
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Queries templates table, returns JSON response.
//   LINKS: M-YC-TEMPLATES
// END_CONTRACT: listTemplates
export async function listTemplates(req: Request, res: Response): Promise<void> {
  // START_BLOCK_TEMPLATE_CRUD
  const numericHash = req.user?.numericHash;
  if (numericHash === undefined) {
    log('YcTemplates', 'listTemplates', 'BLOCK_TEMPLATE_CRUD', 'Unauthorized access attempt', {});
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  try {
    log('YcTemplates', 'listTemplates', 'BLOCK_TEMPLATE_CRUD', 'Listing templates', { numericHash });
    
    const rows = await query(
      'DECLARE $vkUserId AS Uint64; SELECT id, name, text, createdAt, updatedAt FROM templates WHERE vkUserId = $vkUserId',
      { '$vkUserId': TypedValues.uint64(numericHash) }
    );

    const templates = rows.map(row => ({
      id: row.id && typeof row.id === 'object' && 'toString' in row.id ? row.id.toString() : String(row.id),
      name: String(row.name),
      text: String(row.text),
      createdAt: row.createdAt && typeof row.createdAt === 'object' && 'toString' in row.createdAt ? Number(row.createdAt.toString()) : Number(row.createdAt),
      updatedAt: row.updatedAt && typeof row.updatedAt === 'object' && 'toString' in row.updatedAt ? Number(row.updatedAt.toString()) : Number(row.updatedAt)
    }));

    res.json(templates);
  } catch (e: any) {
    log('YcTemplates', 'listTemplates', 'BLOCK_TEMPLATE_CRUD', 'Failed to list templates', { error: e.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  // END_BLOCK_TEMPLATE_CRUD
}

// START_CONTRACT: createTemplate
//   PURPOSE: Express POST /templates handler, creates a new template with optional name (auto-generated if missing) and text.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Inserts a new template row into YDB, returns JSON response.
//   LINKS: M-YC-TEMPLATES
// END_CONTRACT: createTemplate
export async function createTemplate(req: Request, res: Response): Promise<void> {
  // START_BLOCK_TEMPLATE_CRUD_CREATE
  const numericHash = req.user?.numericHash;
  if (numericHash === undefined) {
    log('YcTemplates', 'createTemplate', 'BLOCK_TEMPLATE_CRUD_CREATE', 'Unauthorized access attempt', {});
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const { name, text } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim() === '') {
    log('YcTemplates', 'createTemplate', 'BLOCK_TEMPLATE_CRUD_CREATE', 'Validation failed: empty text', {});
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Text is required' });
    return;
  }

  try {
    const existing = await query(
      'DECLARE $vkUserId AS Uint64; SELECT id, name, text, createdAt FROM templates WHERE vkUserId = $vkUserId',
      { '$vkUserId': TypedValues.uint64(numericHash) }
    );

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const minInterval = 5000; // 5 seconds

    // 1. Rate Limit: Rapid creations (min interval of 5 seconds)
    const mostRecent = existing.reduce((max, t) => {
      const createdVal = t.createdAt !== undefined && t.createdAt !== null
        ? (typeof t.createdAt === 'object' && 'toString' in t.createdAt ? Number(t.createdAt.toString()) : Number(t.createdAt))
        : 0;
      return createdVal > max ? createdVal : max;
    }, 0);

    if (mostRecent > 0 && now - mostRecent < minInterval) {
      log('YcTemplates', 'createTemplate', 'BLOCK_TEMPLATE_CRUD_CREATE', 'Rate limit hit: rapid creation', { numericHash });
      res.status(429).json({ error: 'RATE_LIMITED', message: 'Пожалуйста, подождите между созданием шаблонов' });
      return;
    }

    // 2. Rate Limit: Daily limit (max 20 templates in 24 hours)
    const recentCreations = existing.filter(t => {
      const createdVal = t.createdAt !== undefined && t.createdAt !== null
        ? (typeof t.createdAt === 'object' && 'toString' in t.createdAt ? Number(t.createdAt.toString()) : Number(t.createdAt))
        : 0;
      return createdVal >= oneDayAgo;
    });

    if (recentCreations.length >= 20) {
      log('YcTemplates', 'createTemplate', 'BLOCK_TEMPLATE_CRUD_CREATE', 'Rate limit hit: daily max reached', { numericHash });
      res.status(429).json({ error: 'RATE_LIMITED', message: 'Лимит создания шаблонов исчерпан (максимум 20 шаблонов в сутки)' });
      return;
    }

    // 3. Duplicate Prevention
    let templateName = name;
    if (!templateName || typeof templateName !== 'string' || templateName.trim() === '') {
      templateName = `Шаблон ${existing.length + 1}`;
    }

    const trimmedName = templateName.trim().toLowerCase();
    const trimmedText = text.trim();

    const hasDuplicateName = existing.some(t => String(t.name).trim().toLowerCase() === trimmedName);
    if (hasDuplicateName) {
      log('YcTemplates', 'createTemplate', 'BLOCK_TEMPLATE_CRUD_CREATE', 'Duplicate template name', { name: templateName, numericHash });
      res.status(409).json({ error: 'DUPLICATE_TEMPLATE', message: 'Шаблон с таким именем уже существует' });
      return;
    }

    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    log('YcTemplates', 'createTemplate', 'BLOCK_TEMPLATE_CRUD_CREATE', 'Creating template', {
      id: String(id),
      name: templateName,
      numericHash
    });

    await execute(
      'DECLARE $id AS Uint64; ' +
      'DECLARE $vkUserId AS Uint64; ' +
      'DECLARE $name AS Utf8; ' +
      'DECLARE $text AS Utf8; ' +
      'DECLARE $createdAt AS Uint64; ' +
      'DECLARE $updatedAt AS Uint64; ' +
      'INSERT INTO templates (id, vkUserId, name, text, createdAt, updatedAt) ' +
      'VALUES ($id, $vkUserId, $name, $text, $createdAt, $updatedAt)',
      {
        '$id': TypedValues.uint64(id),
        '$vkUserId': TypedValues.uint64(numericHash),
        '$name': TypedValues.utf8(templateName),
        '$text': TypedValues.utf8(text),
        '$createdAt': TypedValues.uint64(now),
        '$updatedAt': TypedValues.uint64(now)
      }
    );

    res.status(200).json({
      id: String(id),
      name: templateName,
      text,
      createdAt: now,
      updatedAt: now
    });
  } catch (e: any) {
    log('YcTemplates', 'createTemplate', 'BLOCK_TEMPLATE_CRUD_CREATE', 'Failed to create template', { error: e.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  // END_BLOCK_TEMPLATE_CRUD_CREATE
}

// START_CONTRACT: updateTemplate
//   PURPOSE: Express PATCH /templates/:id handler, updates template name and/or text with owner verification.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Updates database row, returns JSON response.
//   LINKS: M-YC-TEMPLATES
// END_CONTRACT: updateTemplate
export async function updateTemplate(req: Request, res: Response): Promise<void> {
  // START_BLOCK_TEMPLATE_CRUD_UPDATE
  const numericHash = req.user?.numericHash;
  if (numericHash === undefined) {
    log('YcTemplates', 'updateTemplate', 'BLOCK_TEMPLATE_CRUD_UPDATE', 'Unauthorized access attempt', {});
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const { id } = req.params;
  if (!id) {
    log('YcTemplates', 'updateTemplate', 'BLOCK_TEMPLATE_CRUD_UPDATE', 'Validation failed: missing id', {});
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'ID is required' });
    return;
  }

  const { name, text } = req.body || {};
  if (text !== undefined && (typeof text !== 'string' || text.trim() === '')) {
    log('YcTemplates', 'updateTemplate', 'BLOCK_TEMPLATE_CRUD_UPDATE', 'Validation failed: empty text', {});
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Text cannot be empty' });
    return;
  }

  try {
    const idNum = Number(id);
    if (isNaN(idNum) || idNum <= 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid template ID' });
      return;
    }

    const rows = await query(
      'DECLARE $id AS Uint64; SELECT id, vkUserId, name, text, createdAt, updatedAt FROM templates WHERE id = $id',
      { '$id': TypedValues.uint64(idNum) }
    );

    if (!rows || rows.length === 0) {
      log('YcTemplates', 'updateTemplate', 'BLOCK_TEMPLATE_CRUD_UPDATE', 'Template not found', { id });
      res.status(404).json({ error: 'TEMPLATE_NOT_FOUND' });
      return;
    }

    const template = rows[0];
    const ownerHash = template.vkUserId && typeof template.vkUserId === 'object' && 'toString' in template.vkUserId 
      ? template.vkUserId.toString() 
      : String(template.vkUserId);

    if (ownerHash !== String(numericHash)) {
      log('YcTemplates', 'updateTemplate', 'BLOCK_TEMPLATE_CRUD_UPDATE', 'Ownership mismatch', {
        id,
        user: numericHash,
        owner: ownerHash
      });
      res.status(403).json({ error: 'OWNER_MISMATCH' });
      return;
    }

    const updatedName = name !== undefined ? name : template.name;
    const updatedText = text !== undefined ? text : template.text;

    // Duplicate check on update
    const existing = await query(
      'DECLARE $vkUserId AS Uint64; SELECT id, name, text FROM templates WHERE vkUserId = $vkUserId',
      { '$vkUserId': TypedValues.uint64(numericHash) }
    );

    const otherTemplates = existing.filter(t => {
      const tId = t.id && typeof t.id === 'object' && 'toString' in t.id ? t.id.toString() : String(t.id);
      return tId !== String(idNum);
    });

    const trimmedUpdatedName = String(updatedName).trim().toLowerCase();
    const trimmedUpdatedText = String(updatedText).trim();

    if (name !== undefined) {
      const hasDuplicateName = otherTemplates.some(t => String(t.name).trim().toLowerCase() === trimmedUpdatedName);
      if (hasDuplicateName) {
        log('YcTemplates', 'updateTemplate', 'BLOCK_TEMPLATE_CRUD_UPDATE', 'Duplicate template name', { name: updatedName, id, numericHash });
        res.status(409).json({ error: 'DUPLICATE_TEMPLATE', message: 'Шаблон с таким именем уже существует' });
        return;
      }
    }

    const now = Date.now();

    log('YcTemplates', 'updateTemplate', 'BLOCK_TEMPLATE_CRUD_UPDATE', 'Updating template', { id });

    await execute(
      'DECLARE $id AS Uint64; ' +
      'DECLARE $name AS Utf8; ' +
      'DECLARE $text AS Utf8; ' +
      'DECLARE $updatedAt AS Uint64; ' +
      'UPDATE templates SET name = $name, text = $text, updatedAt = $updatedAt WHERE id = $id',
      {
        '$id': TypedValues.uint64(idNum),
        '$name': TypedValues.utf8(updatedName),
        '$text': TypedValues.utf8(updatedText),
        '$updatedAt': TypedValues.uint64(now)
      }
    );

    const createdAtVal = template.createdAt && typeof template.createdAt === 'object' && 'toString' in template.createdAt
      ? Number(template.createdAt.toString())
      : Number(template.createdAt);

    res.status(200).json({
      id: String(idNum),
      name: updatedName,
      text: updatedText,
      createdAt: createdAtVal,
      updatedAt: now
    });
  } catch (e: any) {
    log('YcTemplates', 'updateTemplate', 'BLOCK_TEMPLATE_CRUD_UPDATE', 'Failed to update template', { error: e.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  // END_BLOCK_TEMPLATE_CRUD_UPDATE
}

// START_CONTRACT: deleteTemplate
//   PURPOSE: Express DELETE /templates/:id handler, deletes template after verifying ownership.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Deletes database row, returns JSON response.
//   LINKS: M-YC-TEMPLATES
// END_CONTRACT: deleteTemplate
export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  // START_BLOCK_TEMPLATE_CRUD_DELETE
  const numericHash = req.user?.numericHash;
  if (numericHash === undefined) {
    log('YcTemplates', 'deleteTemplate', 'BLOCK_TEMPLATE_CRUD_DELETE', 'Unauthorized access attempt', {});
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const { id } = req.params;
  if (!id) {
    log('YcTemplates', 'deleteTemplate', 'BLOCK_TEMPLATE_CRUD_DELETE', 'Validation failed: missing id', {});
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'ID is required' });
    return;
  }

  try {
    const idNum = Number(id);
    if (isNaN(idNum) || idNum <= 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid template ID' });
      return;
    }

    const rows = await query(
      'DECLARE $id AS Uint64; SELECT id, vkUserId FROM templates WHERE id = $id',
      { '$id': TypedValues.uint64(idNum) }
    );

    if (!rows || rows.length === 0) {
      log('YcTemplates', 'deleteTemplate', 'BLOCK_TEMPLATE_CRUD_DELETE', 'Template not found', { id });
      res.status(404).json({ error: 'TEMPLATE_NOT_FOUND' });
      return;
    }

    const template = rows[0];
    const ownerHash = template.vkUserId && typeof template.vkUserId === 'object' && 'toString' in template.vkUserId 
      ? template.vkUserId.toString() 
      : String(template.vkUserId);

    if (ownerHash !== String(numericHash)) {
      log('YcTemplates', 'deleteTemplate', 'BLOCK_TEMPLATE_CRUD_DELETE', 'Ownership mismatch', {
        id,
        user: numericHash,
        owner: ownerHash
      });
      res.status(403).json({ error: 'OWNER_MISMATCH' });
      return;
    }

    log('YcTemplates', 'deleteTemplate', 'BLOCK_TEMPLATE_CRUD_DELETE', 'Deleting template', { id });

    await execute(
      'DECLARE $id AS Uint64; DELETE FROM templates WHERE id = $id',
      { '$id': TypedValues.uint64(idNum) }
    );

    res.status(200).json({ success: true });
  } catch (e: any) {
    log('YcTemplates', 'deleteTemplate', 'BLOCK_TEMPLATE_CRUD_DELETE', 'Failed to delete template', { error: e.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  // END_BLOCK_TEMPLATE_CRUD_DELETE
}

// GRACE_MARKER: [YcTemplates][BLOCK_TEMPLATE_CRUD]

const _graceLogMarkers = [
  "[YcTemplates][BLOCK_TEMPLATE_CRUD]"
];
