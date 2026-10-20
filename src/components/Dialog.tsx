import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Native <dialog> modal: focus is trapped, Esc closes, background is inert.
 * Opens as a centred panel on large screens and a bottom sheet on phones.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  onSubmit,
  testId,
  size = 'md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  testId?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const body = (
    <>
      <header className="dialog-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="dialog-body">{children}</div>
      {footer && <footer className="dialog-foot">{footer}</footer>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      aria-label={title}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) onClose();
      }}
    >
      {open &&
        (onSubmit ? (
          <form
            className="dialog-inner"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(e);
            }}
          >
            {body}
          </form>
        ) : (
          <div className="dialog-inner">{body}</div>
        ))}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  danger = true,
  testId = 'confirm-dialog',
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
  testId?: string;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      size="sm"
      testId={testId}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
    </Dialog>
  );
}
