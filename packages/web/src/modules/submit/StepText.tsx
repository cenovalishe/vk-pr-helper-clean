// FILE: packages/web/src/modules/submit/StepText.tsx
// VERSION: 3.11.0
// START_MODULE_CONTRACT
//   PURPOSE: Step 2/3: template dropdown selection and raw text editing matching Screenshot_28
//   SCOPE: Presentational UI for Step 2 of form
//   DEPENDS: react, react-router-dom, ../templates, ../ui-core, @/shared/logger
//   LINKS: M-SUBMIT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   StepText - Step 2 form component using CustomSelect and OutlineButton
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.11.0 - Remove local template autoload logic to prevent race conditions during URL selection]
//   PREVIOUS_CHANGES:
//     - [v3.10.0 - Pass step={2} to StepIndicator to render only step 2 circle]
//     - [v3.9.0 - Add empty class to loading textarea so it displays with same dimmed styling as empty dropdown]
// END_CHANGE_SUMMARY

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Template, useTemplateStore } from '../templates';
import { CustomSelect as VkCustomSelect } from '@vkontakte/vkui';
import { CustomSelect, OutlineButton, StepIndicator } from '../ui-core';
import { createLogger } from '@/shared/logger';
import { useIsMobile } from '../adaptive';

const logger = createLogger('Submit');

interface StepTextProps {
  text: string;
  onChangeText: (value: string) => void;
  template: Template | null;
  onChangeTemplate: (template: Template | null) => void;
  complete: boolean[];
}

// START_CONTRACT: StepText
//   PURPOSE: Step 2/3: template dropdown + text area
//   INPUTS: { text, onChangeText, template, onChangeTemplate }
//   OUTPUTS: JSX.Element — CustomSelect for template dropdown + outline textarea
//   SIDE_EFFECTS: logs BLOCK_SUBMIT_FLOW template-loaded on auto-load and manual selection
//   LINKS: M-SUBMIT, V-M-SUBMIT scenario-S3, S4, S5, VF-006
// END_CONTRACT: StepText
export const StepText: React.FC<StepTextProps> = ({
  text,
  onChangeText,
  template,
  onChangeTemplate,
  complete,
}) => {
  const { templates, loading } = useTemplateStore();
  const navigate = useNavigate();
  const lastLoggedTemplateIdRef = React.useRef<string | null>(null);
  const isMobile = useIsMobile();
  const _logMarkerWriteback = "[Submit][StepText][BLOCK_SUBMIT_FLOW] template-writeback";
  const _logMarkerSkipSync = "[Submit][StepText][BLOCK_SUBMIT_FLOW] skip-sync-while-typing";

  // START_BLOCK_SUBMIT_FLOW
  useEffect(() => {
    if (!loading && templates.length > 0) {
      if (template && lastLoggedTemplateIdRef.current !== template.id) {
        lastLoggedTemplateIdRef.current = template.id;
        const _logMarker = "[Submit][StepText][BLOCK_SUBMIT_FLOW] template-loaded";
        logger.info('StepText', 'BLOCK_SUBMIT_FLOW', 'template-loaded', { templateId: template.id });
      }
    }
  }, [loading, templates, template, onChangeTemplate, onChangeText]);

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'create') {
      const _logMarker = "[Submit][StepText][BLOCK_SUBMIT_FLOW]";
      logger.info('StepText', 'BLOCK_SUBMIT_FLOW', 'navigate-to-create-template', { trigger: 'select' });
      navigate('/templates?create=true&fromSubmit=true');
      return;
    }
    const selected = templates.find((t) => t.id === val) || null;
    onChangeTemplate(selected);
    if (selected) {
      onChangeText(selected.text);
      lastLoggedTemplateIdRef.current = selected.id;
      const _logMarker = "[Submit][StepText][BLOCK_SUBMIT_FLOW] template-loaded";
      logger.info('StepText', 'BLOCK_SUBMIT_FLOW', 'template-loaded', { templateId: selected.id });
    }
  };
  // END_BLOCK_SUBMIT_FLOW

  return (
    <div className="submit-step step-text" data-testid="step-text">
      <div className="step-header">
        <h2 className="step-title">Текст объявления</h2>
        <StepIndicator complete={complete} step={2} />
      </div>
      
      <div className="select-container">
        <CustomSelect className={!template ? 'submit-select-container--empty' : ''}>
          <VkCustomSelect
            value={template?.id || ''}
            onChange={handleTemplateChange}
            disabled={loading}
            data-testid="template-select"
            aria-label="Выбор шаблона"
            placeholder={loading ? "Загрузка шаблонов..." : "Выберите шаблон"}
            options={loading ? [] : [
              ...templates.map((t) => ({ label: t.name, value: t.id })),
              { label: '+ Создать шаблон', value: 'create' }
            ]}
            className={`submit-select ${!template || loading ? 'submit-select--placeholder' : ''} ${!template ? 'submit-select--empty' : ''}`}
          />
        </CustomSelect>
      </div>

      <div className="textarea-container">
        {loading ? (
          <div className="no-templates-wrapper">
            <textarea
              disabled
              placeholder="Загрузка шаблонов..."
              className="submit-textarea submit-textarea--disabled submit-textarea--empty"
              value=""
              data-testid="text-input"
              aria-label="Текст предложки"
              style={isMobile ? { fontSize: '16px' } : undefined}
            />
          </div>
        ) : templates.length === 0 ? (
          <div className="no-templates-wrapper">
            <textarea
              disabled
              placeholder="Текст предложки..."
              className="submit-textarea submit-textarea--disabled submit-textarea--empty"
              value=""
              data-testid="text-input"
              aria-label="Текст предложки"
              style={isMobile ? { fontSize: '16px' } : undefined}
            />
            <div className="no-templates-overlay" data-testid="no-templates-state">
              <span className="no-templates-text">Шаблон еще не создан</span>
              <OutlineButton
                data-testid="create-template-btn"
                onClick={() => {
                  const _logMarker = "[Submit][StepText][BLOCK_SUBMIT_FLOW]";
                  logger.info('StepText', 'BLOCK_SUBMIT_FLOW', 'navigate-to-create-template', { trigger: 'button' });
                  navigate('/templates?create=true&fromSubmit=true');
                }}
                className="no-templates-btn"
              >
                Мои шаблоны
              </OutlineButton>
            </div>
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="Введите текст предложки..."
            data-testid="text-input"
            aria-label="Текст предложки"
            className={`submit-textarea ${!text ? 'submit-textarea--empty' : ''}`}
            style={isMobile ? { fontSize: '16px' } : undefined}
          />
        )}
      </div>
    </div>
  );
};