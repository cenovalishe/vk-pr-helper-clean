// FILE: packages/web/src/shared/ui/ConfirmModal.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Reusable confirmation modal with title, message, and two action buttons
//   SCOPE: Shared UI component used by M-TEMPLATES (delete confirm, unsaved changes)
//   DEPENDS: none
//   LINKS: M-TEMPLATES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ConfirmModal - Modal dialog component with confirm/cancel buttons
//   ConfirmModalProps - Props interface for the modal
// END_MODULE_MAP

import { useEffect, useRef } from 'react';
import './ConfirmModal.css';

// START_CONTRACT: ConfirmModalProps
//   PURPOSE: Props for the reusable confirmation modal
//   INPUTS: isOpen, title, message, confirmLabel, cancelLabel, confirmColor, onConfirm, onCancel
//   OUTPUTS: none (props type)
//   SIDE_EFFECTS: none
//   LINKS: M-TEMPLATES note-3 (unsaved changes modal), M-TEMPLATES note-4 (delete modal)
// END_CONTRACT: ConfirmModalProps
export interface ConfirmModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Modal title (typically template name) */
  title: string;
  /** Modal body message */
  message: string;
  /** Right action button label */
  confirmLabel: string;
  /** Left cancel button label */
  cancelLabel: string;
  /** Right action button color: red for delete, green for exit-without-save */
  confirmColor: 'red' | 'green' | 'blue';
  /** Called when user clicks the right action button */
  onConfirm: () => void;
  /** Called when user clicks cancel or presses Escape */
  onCancel: () => void;
}

// START_BLOCK_CONFIRM_MODAL
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmColor,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
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
      onClose={onCancel}
      aria-labelledby="confirm-modal-title"
    >
      <h2 id="confirm-modal-title" className="confirm-modal__title">
        {title}
      </h2>
      <p className="confirm-modal__message">{message}</p>
      <div className="confirm-modal__actions">
        <button
          type="button"
          className="confirm-modal__btn confirm-modal__btn--cancel"
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--${confirmColor}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
// END_BLOCK_CONFIRM_MODAL

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial ConfirmModal using native <dialog> element with showModal/close]
// END_CHANGE_SUMMARY
