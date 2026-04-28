import { useEffect, useRef } from 'react';
import './CloseConfirmDialog.css';

interface CloseConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function CloseConfirmDialog({ onConfirm, onCancel }: CloseConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [onCancel]);

  return (
    <div className="close-confirm__backdrop" onClick={onCancel}>
      <div
        className="close-confirm"
        role="alertdialog"
        aria-label="Close confirmation"
        aria-describedby="close-confirm-msg"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="close-confirm-msg" className="close-confirm__message">
          This terminal has a running process. Close anyway?
        </p>
        <div className="close-confirm__actions">
          <button
            ref={cancelRef}
            type="button"
            className="close-confirm__btn close-confirm__btn--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="close-confirm__btn close-confirm__btn--close"
            onClick={onConfirm}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
