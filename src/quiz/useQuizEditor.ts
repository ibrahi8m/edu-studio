import { canEditProject } from '../auth/access';
import { getAuth } from '../auth/session';
import { hasAccounts } from '../auth/local';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db, type Project } from '../db/db';
import { ValidationError } from '../db/projects';
import { loadQuiz, QuizConflictError, saveQuiz } from '../db/quizzes';
import { isQuotaError } from '../lesson/media';
import type { SaveState } from '../lesson/useLessonEditor';
import type { Quiz } from './types';

const DEBOUNCE_MS = 600;

/**
 * Loads a quiz once, keeps the editable copy in memory and writes it back to
 * IndexedDB shortly after each change, and right away when the page is hidden
 * or left. One save at a time; never overwrites a newer save from another window.
 */
export function useQuizEditor(quizId: string | undefined) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<SaveState>({ kind: 'loading' });

  const latest = useRef<Quiz | null>(null);
  const baseRev = useRef(0);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const blocked = useRef(false);
  const lastSavedAt = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!quizId) return;
    setStatus({ kind: 'loading' });
    const q = await loadQuiz(db, quizId);
    if (!q) {
      setStatus({ kind: 'missing' });
      return;
    }
    const p = await db.projects.get(q.projectId);
    if (!canEditProject(p, getAuth().user) && hasAccounts()) {
      setStatus({ kind: 'missing' }); // 1.5.0: another teacher's quiz is not opened
      return;
    }
    baseRev.current = q.rev;
    lastSavedAt.current = q.rev > 0 ? q.updatedAt : null;
    latest.current = q;
    dirty.current = false;
    blocked.current = false;
    setProject(p ?? null);
    setQuiz(q);
    setStatus({ kind: 'saved', at: lastSavedAt.current });
  }, [quizId]);

  useEffect(() => {
    void load();
  }, [load]);

  const scheduleRef = useRef<() => void>(() => undefined);

  const save = useCallback(
    async (opts: { force?: boolean } = {}): Promise<void> => {
      if (!latest.current) return;
      if (blocked.current && !opts.force) return;
      while (inFlight.current) await inFlight.current;
      if (blocked.current && !opts.force) return;
      if (!dirty.current && !opts.force) {
        setStatus((s) => (s.kind === 'invalid' || s.kind === 'error' ? s : { kind: 'saved', at: lastSavedAt.current }));
        return;
      }
      const snapshot = latest.current;
      dirty.current = false;
      let retry = true;
      setStatus({ kind: 'saving' });
      const run = (async () => {
        try {
          const res = await saveQuiz(db, snapshot, baseRev.current, opts);
          baseRev.current = res.rev;
          lastSavedAt.current = res.savedAt;
          blocked.current = false;
          if (latest.current !== snapshot) dirty.current = true;
          setStatus(dirty.current ? { kind: 'dirty' } : { kind: 'saved', at: res.savedAt });
        } catch (e) {
          dirty.current = true;
          retry = false;
          if (e instanceof QuizConflictError) {
            blocked.current = true;
            setStatus({ kind: 'conflict' });
          } else if (e instanceof ValidationError) {
            setStatus({ kind: 'invalid', message: Object.values(e.fields).join(' ') });
          } else if (isQuotaError(e)) {
            setStatus({ kind: 'error', message: 'مساحة التخزين على الجهاز ممتلئة.' });
          } else {
            setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'تعذّر الحفظ.' });
          }
        }
      })();
      inFlight.current = run;
      await run;
      inFlight.current = null;
      if (retry && dirty.current && !blocked.current) scheduleRef.current();
    },
    [],
  );

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS);
  }, [save]);
  scheduleRef.current = schedule;

  const edit = useCallback(
    (fn: (q: Quiz) => Quiz) => {
      setQuiz((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        if (next === prev) return prev;
        latest.current = next;
        dirty.current = true;
        return next;
      });
      if (!blocked.current) {
        setStatus((s) => (s.kind === 'conflict' ? s : { kind: 'dirty' }));
        schedule();
      }
    },
    [schedule],
  );

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (dirty.current && !blocked.current) void save();
  }, [save]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush();
    };
  }, [flush]);

  return {
    quiz,
    project,
    status,
    edit,
    saveNow: () => save(),
    overwrite: () => save({ force: true }),
    reload: load,
  };
}
