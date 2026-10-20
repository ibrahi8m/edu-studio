import { useEffect, useId, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { LIMITS } from './model';

/** Title, description and tags for an item saved to (or edited in) the library. */
export function SaveToLibraryDialog({
  open,
  heading,
  initial,
  note,
  onClose,
  onSave,
}: {
  open: boolean;
  heading: string;
  initial: { title: string; description?: string; tags?: string[] };
  note?: string;
  onClose: () => void;
  onSave: (v: { title: string; description: string; tags: string }) => Promise<void>;
}) {
  const uid = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(initial.title);
    setDescription(initial.description ?? '');
    setTags((initial.tags ?? []).join('، '));
    setError('');
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog
      open={open}
      title={heading}
      onClose={onClose}
      testId="library-save-dialog"
      onSubmit={async () => {
        if (!title.trim()) {
          setError('العنوان مطلوب.');
          return;
        }
        setBusy(true);
        try {
          await onSave({ title, description, tags });
        } finally {
          setBusy(false);
        }
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="library-save">
            حفظ في المكتبة
          </button>
        </>
      }
    >
      <div className="form-grid">
        {note && <p className="muted">{note}</p>}
        <div className={`field ${error ? 'has-error' : ''}`}>
          <label className="field-label" htmlFor={`${uid}-t`}>
            العنوان <span className="req" aria-hidden="true">*</span>
          </label>
          <input id={`${uid}-t`} className="input" value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} data-testid="library-title" />
          {error && (
            <span className="field-error" role="alert">
              {error}
            </span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-d`}>
            وصف (اختياري)
          </label>
          <textarea id={`${uid}-d`} className="input" rows={2} value={description} maxLength={LIMITS.description} onChange={(e) => setDescription(e.target.value)} data-testid="library-description" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-g`}>
            وسوم للتصنيف (اختياري)
          </label>
          <input id={`${uid}-g`} className="input" value={tags} placeholder="مثال: علوم، الصف السابع، تعاوني" onChange={(e) => setTags(e.target.value)} data-testid="library-tags" />
          <span className="field-hint">افصل بين الوسوم بفاصلة.</span>
        </div>
      </div>
    </Dialog>
  );
}
