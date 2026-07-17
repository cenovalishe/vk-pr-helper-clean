// FILE: packages/web/src/shared/ui/AlertModal.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Reusable alert/notification modal with title, message, and a single close button
//   SCOPE: Shared UI component for alert notifications
//   DEPENDS: none
//   LINKS: M-UI-CORE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AlertModal - Modal dialog component with a single confirm/close button
//   AlertModalProps - Props interface for the modal
// END_MODULE_MAP

import { useEffect, useRef } from 'react';
import './ConfirmModal.css';

// START_CONTRACT: AlertModalProps
//   PURPOSE: Props for the reusable alert modal
//   INPUTS: isOpen, title, message, buttonLabel, onClose
//   OUTPUTS: none (props type)
//   SIDE_EFFECTS: none
//   LINKS: M-UI-CORE
// END_CONTRACT: AlertModalProps
export interface AlertModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Modal title */
  title: string;
  /** Modal body message */
  message: string;
  /** Button label */
  buttonLabel: string;
  /** Called when user clicks close or presses Escape */
  onClose: () => void;
}

// START_BLOCK_ALERT_MODAL
export function AlertModal({
  isOpen,
  title,
  message,
  buttonLabel,
  onClose,
}: AlertModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="confirm-modal"
      onClose={onClose}
      aria-labelledby="alert-modal-title"
      data-testid="alert-modal"
    >
      <h2 id="alert-modal-title" className="confirm-modal__title">
        {title}
      </h2>
      <div className="confirm-modal__message" style={{ whiteSpace: 'pre-line' }}>
        {message}
      </div>
      <div className="confirm-modal__actions">
        <button
          type="button"
          className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--blue"
          onClick={onClose}
          data-testid="alert-modal-close-btn"
        >
          {buttonLabel}
        </button>
      </div>
    </dialog>
  );
}
// END_BLOCK_ALERT_MODAL

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial AlertModal using native <dialog> element for single-button popup alert]
// END_CHANGE_SUMMARY
