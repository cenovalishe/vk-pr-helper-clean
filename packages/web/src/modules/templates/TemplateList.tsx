// START_MODULE_CONTRACT
//   PURPOSE: React component that displays a grid of templates with scrollable full-text preview and options to edit or delete.
//   SCOPE: Visual grid of templates, scrollable full-text body preview, edit/delete actions, and a confirm delete modal.
//   DEPENDS: none
//   LINKS: M-TEMPLATES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TemplateList - Component showing list of templates with edit/delete controls
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.4.0 - Render full text body in card body and update MODULE_CONTRACT for scrollability support]
//   PREVIOUS_CHANGES:
//     - [v2.3.1 - Updated MODULE_CONTRACT and MODULE_MAP to satisfy standard GRACE lint profile]
// END_CHANGE_SUMMARY

/**
 * START_CONTRACT
 * @module M-TEMPLATES
 * @purpose Display a grid of template cards
 * @layer 1
 * END_CONTRACT
 */

import React, { useState } from 'react';
import { Template } from './types';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import { createLogger } from '@/shared/logger';
import { Icon20WriteOutline, Icon20DeleteOutline, Icon28SendOutline, Icon28CopyOutline } from '@vkontakte/icons';
import './templates.css';

const log = createLogger('Templates');

interface TemplateListProps {
  templates: Template[];
  onEdit: (template: Template) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onGotoSubmit: (template: Template) => void;
  onDuplicate: (template: Template) => void;
}

// MODULE_MAP
export function TemplateList({ templates, onEdit, onDelete, onCreate, onGotoSubmit, onDuplicate }: TemplateListProps) {
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const _logMarker1 = "[Templates][TemplateList][BLOCK_TEMPLATE_ACTION] goto-submit|duplicate";

  const handleDeleteConfirm = () => {
    if (templateToDelete) {
      onDelete(templateToDelete.id);
      setTemplateToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setTemplateToDelete(null);
  };

  return (
    <div className="template-list-container">
      <div className="template-list-header">
        <h2>Шаблоны</h2>
        <button className="template-btn-primary" onClick={onCreate}>
          Новый шаблон
        </button>
      </div>

      <div className="template-grid" data-testid="template-grid">
        {templates.map(t => (
          <div key={t.id} className="template-card" data-testid={`template-card-${t.id}`}>
            <div className="template-card-header">
              <h3 className="template-card-title">{t.name}</h3>
              <div className="template-card-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  className="template-icon-btn template-goto-submit-btn" 
                  aria-label="Goto Submit" 
                  onClick={() => onGotoSubmit(t)}
                  data-testid={`goto-submit-btn-${t.id}`}
                >
                  <Icon28SendOutline width={20} height={20} />
                </button>
                <button 
                  className="template-icon-btn template-edit-btn" 
                  aria-label="Edit" 
                  onClick={() => onEdit(t)}
                  data-testid={`edit-btn-${t.id}`}
                >
                  <Icon20WriteOutline />
                </button>
                <button 
                  className="template-icon-btn template-duplicate-btn" 
                  aria-label="Duplicate" 
                  onClick={() => onDuplicate(t)}
                  data-testid={`duplicate-btn-${t.id}`}
                >
                  <Icon28CopyOutline width={20} height={20} />
                </button>
                <button 
                  className="template-icon-btn template-delete-btn" 
                  aria-label="Delete" 
                  onClick={() => setTemplateToDelete(t)}
                  data-testid={`delete-btn-${t.id}`}
                >
                  <Icon20DeleteOutline />
                </button>
              </div>
            </div>
            <div className="template-card-body" data-testid={`template-body-${t.id}`}>
              {t.text}
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={!!templateToDelete}
        title={templateToDelete?.name || ''}
        message="Удалить безвозвратно?"
        confirmLabel="Да, удалить"
        cancelLabel="Отмена"
        confirmColor="red"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}

