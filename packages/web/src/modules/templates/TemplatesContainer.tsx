// FILE: packages/web/src/modules/templates/TemplatesContainer.tsx
// VERSION: 2.6.0
// START_MODULE_CONTRACT
//   PURPOSE: View state manager for Templates module (list, create, edit, delete) with URL search param routing support
//   SCOPE: Manage template view state, handle template list and editor rendering, handle URL search params (?create=true, ?fromSubmit=true) for redirection, manage data-templates-overflow and data-template-editor-open document attributes to signal page scroll rules
//   DEPENDS: M-TEMPLATES.useTemplateStore, M-TEMPLATES.TemplateList, M-TEMPLATES.TemplateEditor, react-router-dom
//   LINKS: M-TEMPLATES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TemplatesContainer - Main container component for the templates section
// END_MODULE_MAP
 
import React, { useState, useEffect } from 'react';
import { useTemplateStore } from './useTemplateStore';
import { TemplateList } from './TemplateList';
import { TemplateEditor } from './TemplateEditor';
import { Template } from './types';
import { useSearchParams, useNavigate } from 'react-router-dom';
 
export function TemplatesContainer() {
  const { templates, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate } = useTemplateStore();
  const [editingTemplate, setEditingTemplate] = useState<Template | { isNew: true, name: string, text: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [hasOverflow, setHasOverflow] = useState(false);

  // Monitor layout overflow for templates list on desktop
  useEffect(() => {
    if (editingTemplate) {
      setHasOverflow(false);
      return;
    }

    const checkOverflow = () => {
      const el = document.querySelector('.templates-layout');
      if (el) {
        const contentHeight = el.scrollHeight;
        // layout-content has vertical padding of 72px (24px top, 48px bottom)
        const totalHeight = contentHeight + 72;
        const isOverflowing = totalHeight > window.innerHeight;
        setHasOverflow(isOverflowing);
      } else {
        setHasOverflow(false);
      }
    };

    checkOverflow();

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });

    const el = document.querySelector('.templates-layout');
    if (el) {
      observer.observe(el);
    }
    window.addEventListener('resize', checkOverflow);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [templates, editingTemplate]);

  // Set document attributes for CSS rules
  useEffect(() => {
    document.documentElement.setAttribute('data-templates-overflow', String(hasOverflow));
    return () => {
      document.documentElement.removeAttribute('data-templates-overflow');
    };
  }, [hasOverflow]);

  useEffect(() => {
    const isEditorOpen = !!editingTemplate;
    document.documentElement.setAttribute('data-template-editor-open', String(isEditorOpen));
    return () => {
      document.documentElement.removeAttribute('data-template-editor-open');
    };
  }, [editingTemplate]);

  // Handle URL query parameters (?create=true) on mount or templates load
  useEffect(() => {
    if (searchParams.get('create') === 'true' && !editingTemplate) {
      let maxNum = 0;
      const regex = /^Шаблон (\d+)$/;
      for (const t of templates) {
        const match = t.name.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      const defaultName = `Шаблон ${maxNum + 1}`;
      setEditingTemplate({ isNew: true, name: defaultName, text: '' });

      // Immediately clean up the 'create' param from the URL to prevent looping
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('create');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, templates, editingTemplate, setSearchParams]);

  const handleCreate = () => {
    let maxNum = 0;
    const regex = /^Шаблон (\d+)$/;
    for (const t of templates) {
      const match = t.name.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    const defaultName = `Шаблон ${maxNum + 1}`;
    setEditingTemplate({ isNew: true, name: defaultName, text: '' });
  };

  const handleSave = async (id: string, data: { name: string; text: string }) => {
    // semantic block: BLOCK_TEMPLATE_CRUD
    if ('isNew' in (editingTemplate || {})) {
      const newTemplate = await createTemplate(data);
      if (searchParams.get('fromSubmit') === 'true' && newTemplate) {
        navigate(`/submit?selectTemplateId=${newTemplate.id}`);
      } else {
        setEditingTemplate(null);
      }
    } else {
      await updateTemplate(id, data);
      if (searchParams.get('fromSubmit') === 'true') {
        navigate(`/submit?selectTemplateId=${id}`);
      } else {
        setEditingTemplate(null);
      }
    }
  };

  const handleBack = () => {
    if (searchParams.get('fromSubmit') === 'true') {
      navigate('/submit');
    } else {
      if (searchParams.get('create') === 'true') {
        setSearchParams({});
      }
      setEditingTemplate(null);
    }
  };

  const templateToEdit = editingTemplate
    ? ('isNew' in editingTemplate 
      ? { id: 'new' as const, name: editingTemplate.name, text: editingTemplate.text } 
      : (templates.find(t => t.id === editingTemplate.id) || editingTemplate as Template))
    : null;

  const handleGotoSubmit = (t: Template) => {
    navigate(`/submit?selectTemplateId=${t.id}`);
  };

  const handleDuplicate = async (t: Template) => {
    await duplicateTemplate(t.id);
  };

  return (
    <div className="templates-layout" data-testid="templates-layout">
      <div className="templates-main">
        {editingTemplate && templateToEdit ? (
          <TemplateEditor
            template={templateToEdit}
            onSave={handleSave}
            onBack={handleBack}
          />
        ) : (
          <TemplateList
            templates={templates}
            onCreate={handleCreate}
            onEdit={setEditingTemplate}
            onDelete={deleteTemplate}
            onGotoSubmit={handleGotoSubmit}
            onDuplicate={handleDuplicate}
          />
        )}
      </div>
      <aside className="templates-sidebar" data-testid="templates-sidebar" />
    </div>
  );
}

// GRACE_MARKER: [Templates][TemplatesContainer][BLOCK_TEMPLATE_CRUD]

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.6.0 - Set data-templates-overflow and data-template-editor-open attributes on documentElement to drive desktop scroll constraints]
//   PREVIOUS_CHANGES:
//     - [v2.5.0 - Wrap templates view and editor in a flex layout with placeholder sidebar to match submit layout structure and width]
//     - [v2.4.0 - Add GotoSubmit navigation and Duplicate actions callbacks wireup for Phase-PR-1]
//     - [v2.3.0 - Added URL query parsing (?create=true) and submit redirection/back logic (?fromSubmit=true) in TemplatesContainer]
// END_CHANGE_SUMMARY

const _graceLogMarkers = [
  "[Templates][TemplatesContainer][BLOCK_TEMPLATE_CRUD]"
];
