import { useCallback, useEffect, useRef, useState } from 'react';
import { db, type Lesson, type Project } from '../db/db';
import { ConflictError, deleteUnusedAssets, loadLessonDoc, saveLessonEditor, type LessonMeta } from '../db/lessonDocs';
import { ValidationError } from '../db/projects';
import { isQuotaError } from './media';
import type { LessonDoc } from './types';

export type SaveState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'saved'; at: number | null }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'invalid'; message: string }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string };

export interface EditorState {
  doc: LessonDoc;
  meta: LessonMeta;
}

const DEBOUNCE_MS = 600;

/**
 * Loads a lesson once, keeps the editable copy in memory and writes it back
 * to IndexedDB shortly after each change (and immediately when the page is
 * hidden, closed or left). Never overwrites a newer save from another window.
 */
export function useLessonEditor(lessonId: string | undefined) {
  const [state, setState] = useState<EditorState | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<SaveState>({ kind: 'loading' });

  const latest = useRef<EditorState | null>(null);
  const baseRev = useRef(0);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const blocked = useRef(false); // conflict: stop autosaving until the user decides
  const lastSavedAt = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!lessonId) return;
    setStatus({ kind: 'loading' });
    const l = await db.lessons.get(lessonId);
    if (!l) {
      setStatus({ kind: 'missing' });
      return;
    }
    // Media left behind by deleted blocks in earlier sessions.
    await deleteUnusedAssets(db, lessonId).catch(() => 0);
    const [doc, p] = await Promise.all([loadLessonDoc(db, lessonId), db.projects.get(l.projectId)]);
    const s: EditorState = { doc, meta: { title: l.title, summary: l.summary, duration: l.duration, status: l.status } };
    baseRev.current = doc.rev;
    lastSavedAt.current = doc.updatedAt || null;
    latest.current = s;
    dirty.current = false;
    blocked.current = false;
    setLesson(l);
    setProject(p ?? null);
    setState(s);
    setStatus({ kind: 'saved', at: doc.updatedAt || null });
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (opts: { force?: boolean } = {}): Promise<void> => {
      if (!lessonId || !latest.current) return;
      if (blocked.current && !opts.force) return;
      // One save at a time: a caller that arrives during a save waits for it,
      // so "saved" is never shown while a write is still in progress.
      while (inFlight.current) await inFlight.current;
      if (blocked.current && !opts.force) return;
      if (!dirty.current && !opts.force) {
        setStatus((s) => (s.kind === 'invalid' || s.kind === 'error' ? s : { kind: 'saved', at: lastSavedAt.current }));
        return;
      }
      const snapshot = latest.current;
      dirty.current = false;
      // Lasting failures (empty title, storage error) wait for the next edit or "retry" instead of looping.
      let retry = true;
      setStatus({ kind: 'saving' });
      const run = (async () => {
        try {
          const res = await saveLessonEditor(db, lessonId, snapshot.doc, snapshot.meta, baseRev.current, opts);
          baseRev.current = res.rev;
          lastSavedAt.current = res.savedAt;
          blocked.current = false;
          if (latest.current !== snapshot) dirty.current = true;
          setStatus(dirty.current ? { kind: 'dirty' } : { kind: 'saved', at: res.savedAt });
        } catch (e) {
          dirty.current = true;
          if (e instanceof ConflictError) {
            blocked.current = true;
            setStatus({ kind: 'conflict' });
          } else if (e instanceof ValidationError) {
            retry = false;
            setStatus({ kind: 'invalid', message: Object.values(e.fields).join(' ') });
          } else if (isQuotaError(e)) {
            retry = false;
            setStatus({ kind: 'error', message: 'مساحة التخزين على الجهاز ممتلئة. احذف بعض الوسائط الكبيرة ثم أعد المحاولة.' });
          } else {
            retry = false;
            setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'تعذّر الحفظ.' });
          }
        }
      })();
      inFlight.current = run;
      await run;
      inFlight.current = null;
      if (retry && dirty.current && !blocked.current) schedule();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessonId],
  );

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), DEBOUNCE_MS);
  }, [save]);

  /** Applies a change to the in-memory lesson and schedules a save. */
  const edit = useCallback(
    (fn: (s: EditorState) => EditorState) => {
      setState((prev) => {
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

  // Save right away when the app goes to the background, the tab closes, or the editor unmounts.
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
    state,
    lesson,
    project,
    status,
    edit,
    saveNow: () => save(),
    /** Conflict resolution: keep this window's version. */
    overwrite: () => save({ force: true }),
    /** Conflict resolution: discard this window's changes and reload what is stored. */
    reload: load,
  };
}
