import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, CloudOff, Download, FileUp, LoaderCircle, Paperclip, Save, Send, Trash2, Undo2 } from 'lucide-react';
import { errorMessage } from '../app/data';
import { useToast } from '../app/Toasts';
import { ConfirmDialog } from '../components/Dialog';
import { Pill } from '../components/ui';
import { db, type Lesson } from '../db/db';
import { formatBytes } from '../db/storage';
import { FILE_EXTS, isQuotaError, MediaError, prepareDocument } from '../lesson/media';
import type { ActivityBlock } from '../lesson/types';
import { newSubmissionFile, saveSubmission, submissionId, SUBMISSION_LIMITS, withdrawSubmission } from './db';
import { assignmentState } from './rules';
import { ASSIGNMENT_STATE_LABEL, type AssignmentState, type SubmissionFile } from './types';

export const STATE_TONE: Record<AssignmentState, 'neutral' | 'warning' | 'accent' | 'success'> = {
  not_started: 'neutral',
  in_progress: 'warning',
  draft: 'warning',
  submitted: 'accent',
  graded: 'success',
};

const when = (t: number | null) => (t ? new Date(t).toLocaleString('ar', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

function fileUrl(f: SubmissionFile) {
  return URL.createObjectURL(new Blob([f.data], { type: f.mime }));
}

/**
 * The learner's answer to an assignment activity. «حفظ مسودة» keeps it on this device only;
 * «تسليم» marks it as handed in — still on this device, where the teacher grades it in «النتائج».
 * Nothing is sent over the internet.
 */
export function AssignmentPanel({ block, lesson, name, stepsTicked }: { block: ActivityBlock; lesson: Pick<Lesson, 'id' | 'projectId'>; name: string; stepsTicked: number }) {
  const toast = useToast();
  const sub = useLiveQuery(async () => (await db.submissions.get(submissionId(name, lesson.id, block.id))) ?? null, [name, lesson.id, block.id]);
  const [answer, setAnswer] = useState('');
  const [files, setFiles] = useState<SubmissionFile[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sub === undefined || dirty) return;
    setAnswer(sub?.answer ?? '');
    setFiles(sub?.files ?? []);
  }, [sub, dirty]);

  if (sub === undefined) return null;
  const state = assignmentState(sub, stepsTicked);
  const locked = !!sub && sub.status !== 'draft';

  const save = async (submit: boolean) => {
    setBusy(true);
    try {
      await saveSubmission(db, name, lesson, { id: block.id, title: block.title || 'تكليف' }, { answer, files, submit });
      setDirty(false);
      toast({ message: submit ? 'سُلّم التكليف على هذا الجهاز. يراه المعلم في «النتائج» على الجهاز نفسه.' : 'حُفظت المسودة على هذا الجهاز فقط (لم تُسلَّم).', sound: 'save' });
    } catch (e) {
      toast({ message: isQuotaError(e) ? 'مساحة التخزين على الجهاز لا تكفي.' : errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files];
    for (const f of [...list]) {
      if (next.length >= SUBMISSION_LIMITS.files) {
        toast({ message: `الحد الأقصى ${SUBMISSION_LIMITS.files} ملفات.`, tone: 'danger' });
        break;
      }
      try {
        const prepared = await prepareDocument(f, SUBMISSION_LIMITS.fileBytes);
        next.push(newSubmissionFile(prepared.name, prepared.mime, prepared.data));
      } catch (e) {
        toast({ message: e instanceof MediaError ? e.message : 'تعذّرت قراءة الملف.', tone: 'danger' });
      }
    }
    setFiles(next);
    setDirty(true);
  };

  return (
    <div className="assign" data-testid="assignment" data-state={state}>
      <div className="assign-head">
        <strong>إجابتك</strong>
        <span data-testid="assign-state">
          <Pill tone={STATE_TONE[state]}>{ASSIGNMENT_STATE_LABEL[state]}</Pill>
        </span>
      </div>

      {sub?.status === 'graded' && (
        <div className="align-alert is-ok" role="status" data-testid="assign-grade">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <strong>{sub.score !== null ? `تقييم المعلم: ${sub.score} من 100` : 'قيّم المعلم إجابتك'}</strong>
            {sub.feedback && <p className="pre">{sub.feedback}</p>}
          </div>
        </div>
      )}

      {locked ? (
        <>
          <p className="pre assign-answer-read" data-testid="assign-answer-read">
            {sub!.answer || <span className="muted">(بلا نص)</span>}
          </p>
          <FileList files={sub!.files} />
          <p className="muted">سُلّم {when(sub!.submittedAt)} على هذا الجهاز.</p>
          {sub!.status === 'submitted' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                try {
                  await withdrawSubmission(db, sub!.id);
                  toast({ message: 'سُحب التسليم وعاد مسودة. عدّل ثم سلّم من جديد.' });
                } catch (e) {
                  toast({ message: errorMessage(e), tone: 'danger' });
                }
              }}
              data-testid="assign-withdraw"
            >
              <Undo2 size={16} aria-hidden="true" /> سحب التسليم للتعديل
            </button>
          )}
        </>
      ) : (
        <>
          <label className="sr-only" htmlFor={`ans-${block.id}`}>
            إجابتك عن {block.title}
          </label>
          <textarea
            id={`ans-${block.id}`}
            className="input textarea"
            rows={4}
            maxLength={SUBMISSION_LIMITS.answer}
            placeholder="اكتب إجابتك هنا…"
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              setDirty(true);
            }}
            data-testid="assign-answer"
          />
          <FileList
            files={files}
            onRemove={(id) => {
              setFiles(files.filter((f) => f.id !== id));
              setDirty(true);
            }}
          />
          <input
            ref={input}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            accept={FILE_EXTS.map((e) => `.${e}`).join(',')}
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = '';
            }}
            data-testid="assign-file"
          />
          <div className="assign-actions">
            <button type="button" className="btn btn-sm" onClick={() => input.current?.click()} disabled={busy || files.length >= SUBMISSION_LIMITS.files}>
              <FileUp size={16} aria-hidden="true" /> إرفاق ملف
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void save(false)} disabled={busy} data-testid="assign-save-draft">
              {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />} حفظ مسودة
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirm(true)} disabled={busy || (!answer.trim() && !files.length)} data-testid="assign-submit">
              <Send size={16} aria-hidden="true" /> تسليم
            </button>
          </div>
          <p className="field-hint assign-note">
            <CloudOff size={14} aria-hidden="true" /> «حفظ مسودة» يحفظ إجابتك على هذا الجهاز ولا يسلّمها. «تسليم» يعلّمها مسلّمة على هذا الجهاز فقط؛ لا تُرسل عبر الإنترنت.
            {dirty && <strong className="assign-dirty"> لديك تغييرات غير محفوظة.</strong>}
          </p>
          <span className="field-hint">
            الملفات المسموحة: {FILE_EXTS.join('، ')} · حتى {SUBMISSION_LIMITS.files} ملفات، {formatBytes(SUBMISSION_LIMITS.fileBytes)} للملف.
          </span>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        danger={false}
        title="تسليم التكليف؟"
        testId="assign-confirm"
        confirmLabel="تسليم"
        message={
          <>
            <p>تُحفظ إجابتك مسلّمة على هذا الجهاز، ويراها المعلم في «النتائج» على الجهاز نفسه (أو بعد نقل البيانات بملف).</p>
            <p className="muted">لا تُرسل عبر الإنترنت. يمكنك سحب التسليم للتعديل ما دام المعلم لم يقيّمه.</p>
          </>
        }
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void save(true);
        }}
      />
    </div>
  );
}

export function FileList({ files, onRemove }: { files: SubmissionFile[]; onRemove?: (id: string) => void }) {
  if (!files.length) return null;
  return (
    <ul className="assign-files" data-testid="assign-files">
      {files.map((f) => (
        <li key={f.id}>
          <Paperclip size={14} aria-hidden="true" />
          <span className="assign-file-name">{f.name}</span>
          <span className="muted">{formatBytes(f.size)}</span>
          <a
            className="icon-btn"
            href="#"
            aria-label={`تنزيل ${f.name}`}
            onClick={(e) => {
              e.preventDefault();
              const url = fileUrl(f);
              const a = document.createElement('a');
              a.href = url;
              a.download = f.name;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 4000);
            }}
          >
            <Download size={16} />
          </a>
          {onRemove && (
            <button type="button" className="icon-btn danger" aria-label={`إزالة ${f.name}`} onClick={() => onRemove(f.id)}>
              <Trash2 size={16} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
