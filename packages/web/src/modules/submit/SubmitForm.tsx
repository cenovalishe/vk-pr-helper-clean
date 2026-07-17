// FILE: packages/web/src/modules/submit/SubmitForm.tsx
// VERSION: 3.12.0
// START_MODULE_CONTRACT
//   PURPOSE: Main 3-step form component orchestrating the submit flow matching Screenshot_28
//   SCOPE: Core UI form container managing states and actions for suggest post submission
//   DEPENDS: react, ../communities, ../templates, ../images, ../vk-api, ../auth, ../ui-core, @/shared/logger, M-SUBMIT.StepCommunity, M-SUBMIT.StepText, M-SUBMIT.StepImages, react-router-dom, shared/ui/AlertModal
//   LINKS: M-SUBMIT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SubmitForm - React component managing multi-step post proposal flow with OutlineCard wrappers
//   clearSubmitFormCache - Clear global submit state
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.12.0 - Add rate limiting cooldown AlertModal popup when status is 429 or RATE_LIMITED]
//   PREVIOUS_CHANGES:
//     - [v3.11.0 - Reset template and text state to null and empty when templates array becomes empty, or select first remaining template if current is deleted]
//     - [v3.10.0 - Implement toggle deselect on clicking already selected community in mobile drawer and desktop sidebar]
//     - [v3.9.0 - Correct mobile portal wrapper classes and mount condition to fix mobile hamburger drawer slide-in and horizontal stretch layout bugs]
//     - [v3.8.0 - Centralize URL select template and autoload first template to prevent race conditions during async load]
//     - [v3.7.0 - Thread selectedId and pass derived complete array to step components for StepIndicator layout updates in Phase-PR-1]
//     - [v3.6.0 - Import useIsMobile and safely check viewWidth properties with optional chaining and fallback to prevent WebView blank screen crashes]
// END_CHANGE_SUMMARY

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdaptivityConditionalRender } from '@vkontakte/vkui';
import { Icon28SendOutline, Icon24Cancel } from '@vkontakte/icons';
import { createLogger } from '@/shared/logger';
import { Community, CommunityList } from '../communities';
import { Template, useTemplateStore } from '../templates';
import { useImageStore } from '../images';
import { useAuth } from '../auth';
import { getValidAccessToken } from '../token-vault';
import { OutlineCard, OutlineButton, StepIndicator } from '../ui-core';
import { useIsMobile } from '../adaptive';
import { AlertModal } from '@/shared/ui/AlertModal';
import { suggestPost } from '../vk-api';

import { StepCommunity } from './StepCommunity';
import { StepText } from './StepText';
import { StepImages } from './StepImages';

import './submit.css';

const logger = createLogger('Submit');

let globalCommunity: Community | null = null;
let globalTemplate: Template | null = null;
let globalText = '';

const submitListeners = new Set<() => void>();
const notifySubmitListeners = () => submitListeners.forEach(l => l());

export function clearSubmitFormCache() {
  globalCommunity = null;
  globalTemplate = null;
  globalText = '';
  submitListeners.clear();
}

// START_CONTRACT: SubmitForm
//   PURPOSE: Main 3-step form component orchestrating the submit flow
//   INPUTS: none (reads state from useImageStore, useAuth hooks)
//   OUTPUTS: JSX.Element — 3-column layout: form (OutlineCard + steps) + Поисковики aside (tablet+) or stacked form (tablet-)
//   SIDE_EFFECTS: calls suggestPost on submit; logs BLOCK_SUBMIT_FLOW; throws MISSING_COMMUNITY, MISSING_TEXT, or SUBMIT_FAILED on validation or VK API errors
//   LINKS: M-SUBMIT, V-M-SUBMIT, VF-002, VF-013
// END_CONTRACT: SubmitForm
export const SubmitForm: React.FC = () => {
  const { templates, updateTemplate } = useTemplateStore();
  const { images } = useImageStore();
  const { accessToken, sessionToken } = useAuth();
  const { viewWidth } = useAdaptivityConditionalRender();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  const isTypingRef = useRef(false);
  const debounceTimerRef = useRef<any>(null);
  const typingTimerRef = useRef<any>(null);
  const lastSyncTextRef = useRef<string | null>(null);
  const [isTypingState, setIsTypingState] = useState(false);

  const [community, setCommunityState] = useState<Community | null>(globalCommunity);
  const [template, setTemplateState] = useState<Template | null>(() => {
    if (globalTemplate) return globalTemplate;
    if (templates && templates.length > 0) {
      globalTemplate = templates[0];
      return templates[0];
    }
    return null;
  });
  const [text, setTextState] = useState<string>(() => {
    if (globalText) return globalText;
    if (globalTemplate) {
      globalText = globalTemplate.text;
      return globalTemplate.text;
    }
    if (templates && templates.length > 0) {
      globalText = templates[0].text;
      return templates[0].text;
    }
    return '';
  });
  const [error, setErrorState] = useState<string | null>(null);
  const setError = (val: string | null) => {
    setErrorState(val);
    window.dispatchEvent(new CustomEvent('submit-error-change', { detail: val }));
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCooldownAlertOpen, setIsCooldownAlertOpen] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setCommunityState(globalCommunity);
      setTemplateState(globalTemplate);
      setTextState(globalText);
    };
    submitListeners.add(handleUpdate);
    return () => {
      submitListeners.delete(handleUpdate);
      window.dispatchEvent(new CustomEvent('submit-error-change', { detail: null }));
    };
  }, []);

  useEffect(() => {
    if (viewWidth?.tabletMinus || isMobile) {
      const _logMarker = "[Submit][SubmitForm][BLOCK_MOBILE_LAYOUT]";
      logger.info('SubmitForm', 'BLOCK_MOBILE_LAYOUT', 'Rendering mobile-only communities section');
    }
  }, [viewWidth?.tabletMinus, isMobile]);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const setCommunity = (val: Community | null) => {
    globalCommunity = val;
    setCommunityState(val);
    setError(null);
    notifySubmitListeners();
  };

  const setTemplate = (val: Template | null) => {
    globalTemplate = val;
    setTemplateState(val);
    setError(null);
    if (val) {
      lastSyncTextRef.current = val.text;
    } else {
      lastSyncTextRef.current = null;
    }
    notifySubmitListeners();
  };

  const setText = (val: string) => {
    globalText = val;
    setTextState(val);
    setError(null);
    notifySubmitListeners();

    // If template is selected and text changed, perform writeback debounce
    if (globalTemplate && globalTemplate.text !== val) {
      isTypingRef.current = true;
      setIsTypingState(true);

      // Reset typing timer (500ms post last keystroke)
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        setIsTypingState(false);
      }, 500);

      // Reset 700ms debounce writeback timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      const targetTemplateId = globalTemplate.id;
      debounceTimerRef.current = setTimeout(async () => {
        try {
          logger.info('StepText', 'BLOCK_SUBMIT_FLOW', 'template-writeback', { templateId: targetTemplateId, text: val });
          await updateTemplate(targetTemplateId, { text: val });
        } catch (err) {
          logger.error('StepText', 'BLOCK_SUBMIT_FLOW', 'template-writeback-failed', { error: err });
        }
      }, 700);
    }
  };

  useEffect(() => {
    if (templates.length > 0) {
      const params = new URLSearchParams(location.search);
      const selectTemplateId = params.get('selectTemplateId');
      if (selectTemplateId) {
        const found = templates.find(t => t.id === selectTemplateId);
        if (found) {
          setTemplate(found);
          setText(found.text);
          const _logMarker1 = "[Submit][SubmitForm][BLOCK_SUBMIT_FLOW]";
          logger.info('SubmitForm', 'BLOCK_SUBMIT_FLOW', 'template-auto-selected-from-url', { templateId: found.id });
        }
        navigate('/submit', { replace: true });
      } else if (!template && !text) {
        const firstTemplate = templates[0];
        setTemplate(firstTemplate);
        setText(firstTemplate.text);
      }
    }
  }, [location.search, templates, navigate, template, text]);

  // Initialize lastSyncTextRef.current when template and templates list are loaded
  useEffect(() => {
    if (template && lastSyncTextRef.current === null) {
      const dbTemplate = templates.find(t => t.id === template.id);
      if (dbTemplate) {
        lastSyncTextRef.current = dbTemplate.text;
      }
    }
  }, [template, templates]);

  // Bidirectional sync: cache listener reaction
  useEffect(() => {
    if (template) {
      const dbTemplate = templates.find(t => t.id === template.id);
      if (dbTemplate) {
        // If the database text changed from what we last synced
        if (dbTemplate.text !== lastSyncTextRef.current) {
          if (dbTemplate.text !== text) {
            if (isTypingRef.current === false) {
              setTemplateState(dbTemplate);
              globalTemplate = dbTemplate;
              setTextState(dbTemplate.text);
              globalText = dbTemplate.text;
              lastSyncTextRef.current = dbTemplate.text;
              notifySubmitListeners();
            } else {
              logger.info('StepText', 'BLOCK_SUBMIT_FLOW', 'skip-sync-while-typing', {
                templateId: template.id,
                dbText: dbTemplate.text,
                localText: text,
              });
            }
          } else {
            // Database updated to match our local text (e.g. writeback completed)
            lastSyncTextRef.current = dbTemplate.text;
          }
        }
      }
    }
  }, [templates, template, text, isTypingState]);

  // Synchronize when templates list changes (e.g. template was deleted or changed externally)
  useEffect(() => {
    if (templates.length === 0) {
      setTemplate(null);
      setText('');
    } else if (template) {
      const exists = templates.some(t => t.id === template.id);
      if (!exists) {
        const firstTemplate = templates[0];
        setTemplate(firstTemplate);
        setText(firstTemplate ? firstTemplate.text : '');
      }
    }
  }, [templates, template]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const parseCommunityId = (val: Community | null): string | number | null => {
    if (val) {
      // Backend expects either a numeric ID or a string screen_name.
      // Since our UI uses string IDs like 'general-1', we should pass the shortName to the backend resolver.
      return val.shortName;
    }
    return null;
  };

  // START_BLOCK_SUBMIT_FLOW
  const handleSubmit = async () => {
    const _logMarker2 = "[Submit][SubmitForm][BLOCK_SUBMIT_FLOW]";
    logger.info('SubmitForm', 'BLOCK_SUBMIT_FLOW', 'Starting submit flow');

    if (!community) {
      setError('MISSING_COMMUNITY');
      return;
    }

    if (!text.trim()) {
      setError('MISSING_TEXT');
      return;
    }

    const commId = parseCommunityId(community);
    if (!commId) {
      setError('SUBMIT_FAILED: Invalid community ID');
      return;
    }

    if (!sessionToken) {
      setError('SUBMIT_FAILED: Not authenticated');
      return;
    }

    const vkAccessToken = await getValidAccessToken();
    if (!vkAccessToken) {
      setError('SUBMIT_FAILED: VK token expired, please re-login');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        communityId: Number(commId) || commId,
        text,
        images: images.map(img => img.file),
      };

      const result = await suggestPost(payload as any, vkAccessToken, sessionToken);
      if (result.success) {
        setError(null);
        const _logMarker3 = "[Submit][SubmitForm][BLOCK_SUBMIT_FLOW]";
        logger.info('SubmitForm', 'BLOCK_SUBMIT_FLOW', 'Submit successful', { postId: result.postId });
      } else if (result.error?.code === 'RATE_LIMITED') {
        setIsCooldownAlertOpen(true);
        setError(null);
      } else {
        setError(`SUBMIT_FAILED: ${result.error?.message || 'Unknown error'}`);
      }
    } catch (e) {
      setError('SUBMIT_FAILED');
    } finally {
      setIsSubmitting(false);
    }
  };
  // END_BLOCK_SUBMIT_FLOW


  const hasCommunity = community !== null;
  const hasText = text.trim().length > 0;
  const hasImages = images.length > 0;
  const completeArray = [hasCommunity, hasText, hasImages];

  return (
    <div className="submit-layout" data-testid="submit-form-container">
      <div className="submit-main">
        <OutlineCard className="submit-card">
          <div className="submit-header">
            <Icon28SendOutline className="submit-header__icon" />
            <h1 className="submit-header__title">Отправка</h1>
            <p className="submit-header__subtitle">Пост отправится в предложку от вашего имени</p>
          </div>

          <div className="submit-steps">
            <StepCommunity
              community={community}
              onOpenMenu={() => setIsMobileMenuOpen(true)}
              complete={completeArray}
            />
            <StepText
              text={text}
              onChangeText={setText}
              template={template}
              onChangeTemplate={setTemplate}
              complete={completeArray}
            />
            <StepImages complete={completeArray} />
          </div>

          {error && (
            <div className="submit-error-banner submit-error-banner--inline" data-testid="submit-error">
              <span className="submit-error-banner__title">Ошибка отправки:</span>
              <span className="submit-error-banner__subtitle">{error}</span>
            </div>
          )}

          <div className="submit-actions-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <OutlineButton
              onClick={handleSubmit}
              disabled={isSubmitting}
              data-testid="submit-button"
              className="submit-send-btn"
            >
              {isSubmitting ? 'Отправка...' : 'Отправить'}
            </OutlineButton>
          </div>
        </OutlineCard>

        {/* Mobile bottom communities sheet drawer (rendered via portal so it floats on top of layout) */}
        {isMobile && createPortal(
          <div 
            className={`submit-mobile-menu-overlay ${isMobileMenuOpen ? 'submit-mobile-menu-overlay--open' : ''}`}
            onClick={() => setIsMobileMenuOpen(false)}
            data-testid="submit-mobile-communities"
          >
            <div 
              className="submit-mobile-menu"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="submit-mobile-menu-header">
                <h2>Поисковики</h2>
                <button 
                  className="submit-mobile-menu-close" 
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Закрыть меню"
                >
                  <Icon24Cancel />
                </button>
              </div>
              <div 
                className="submit-mobile-menu-content"
                data-testid="submit-mobile-confinement-scroll"
                style={{ maxHeight: 'none', overflowY: 'auto' }}
              >
                <CommunityList
                  onSelect={(c) => {
                    if (community && community.id === c.id) {
                      setCommunity(null);
                    } else {
                      setCommunity(c);
                    }
                    setIsMobileMenuOpen(false);
                  }}
                  selectedId={community?.id ?? null}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>

      {(viewWidth?.tabletPlus || !isMobile) && (
        <aside 
          className={`submit-sidebar ${typeof viewWidth?.tabletPlus === 'object' ? viewWidth.tabletPlus.className || '' : ''}`} 
          data-testid="submit-sidebar"
        >
          <OutlineCard className="submit-sidebar-card">
            <h2 className="submit-sidebar__title">Поисковики</h2>
            <CommunityList
              onSelect={(c) => {
                if (community && community.id === c.id) {
                  setCommunity(null);
                } else {
                  setCommunity(c);
                }
              }}
              selectedId={community?.id ?? null}
            />
          </OutlineCard>
        </aside>
      )}

      <AlertModal
        isOpen={isCooldownAlertOpen}
        title="Нужно подождать."
        message={`С момента последней отправки прошло менее 24 часов.`}
        buttonLabel="Понятно"
        onClose={() => setIsCooldownAlertOpen(false)}
      />
    </div>
  );
};