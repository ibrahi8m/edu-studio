import { useAuth } from '../auth/session';
import { canSeeProject } from '../auth/access';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { LayoutGrid, Network, Palette, Plus, Search, SquareStack, X } from 'lucide-react';
import { errorMessage, useAllLessons, useAllProjects } from '../app/data';
import { relativeTime } from '../app/format';
import { useToast } from '../app/Toasts';
import { Dialog } from '../components/Dialog';
import { PageHeader } from '../components/ui';
import { db, type Lesson, type Project } from '../db/db';
import { createDesign } from '../db/designs';
import { loadLessonDoc } from '../db/lessonDocs';
import { matchesQuery } from '../db/search';
import { KIND_HINT, KIND_LABEL, LIMITS, normalizeDesign } from '../studio/model';
import { prefill, prefillCounts } from '../studio/prefill';
import { DesignThumb } from '../studio/DesignThumb';
import type { Design, DesignKind } from '../studio/types';

export const KIND_ICON = { cards: SquareStack, summary: LayoutGrid, conceptmap: Network } as const;
const KINDS: DesignKind[] = ['conceptmap', 'summary', 'cards'];

export function useAllDesigns(): Design[] | undefined {
  const user = useAuth().user;
  return useLiveQuery(async () => {
    const ok = new Set((await db.projects.toArray()).filter((p) => canSeeProject(p, user)).map((p) => p.id)); // 1.5.0
    return (await db.designs.toArray()).map(normalizeDesign).filter((d): d is Design => !!d && ok.has(d.projectId));
  }, [user?.id, user?.role]);
}

export function StudioPage() {
  const designs = useAllDesigns();
  const projects = useAllProjects();
  const lessons = useAllLessons();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const navigate = useNavigate();
  const toast = useToast();
  const q = params.get('q') ?? '';
  const kind = (params.get('kind') ?? '') as DesignKind | '';
  const projectFilter = params.get('project') ?? '';
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const lessonById = useMemo(() => new Map((lessons ?? []).map((l) => [l.id, l])), [lessons]);

  const shown = useMemo(
    () =>
      (designs ?? [])
        .filter((d) => !kind || d.kind === kind)
        .filter((d) => !projectFilter || d.projectId === projectFilter)
        .filter((d) => matchesQuery(q, d.title, projectById.get(d.projectId)?.title, d.lessonId ? lessonById.get(d.lessonId)?.title : ''))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [designs, kind, projectFilter, q, projectById, lessonById],
  );

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  const loading = designs === undefined || projects === undefined;

  return (
    <div className="page" data-testid="page-studio">
      <PageHeader
        title="استوديو التصميم"
        subtitle="بطاقات تعليمية وملخصات بصرية وخرائط مفاهيم، تُحفظ على هذا الجهاز وتُصدَّر صورًا دون إنترنت."
        actions={
          projects && projects.length > 0 ? (
            <button type="button" className="btn btn-primary fab-mobile" onClick={() => setCreating(true)} data-testid="new-design">
              <Plus size={18} aria-hidden="true" />
              <span>تصميم جديد</span>
            </button>
          ) : null
        }
      />

      {!loading && projects!.length === 0 ? (
        <section className="card empty-hero">
          <span className="coming-icon" aria-hidden="true">
            <Palette size={30} />
          </span>
          <h2>أنشئ مشروعًا أولًا</h2>
          <p className="muted">كل تصميم ينتمي إلى مشروع، ويمكن ربطه بدرس وإضافته إليه صورةً.</p>
          <Link to="/projects" className="btn btn-primary">
            الذهاب إلى المشاريع
          </Link>
        </section>
      ) : !loading && designs!.length === 0 ? (
        <section className="card empty-hero" data-testid="studio-empty">
          <span className="coming-icon" aria-hidden="true">
            <Palette size={30} />
          </span>
          <h2>لا توجد تصاميم بعد</h2>
          <p className="muted">ابدأ بخريطة مفاهيم لدرس، أو حوّل بطاقات الدرس وملخصه إلى صورة جاهزة للعرض والطباعة.</p>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" /> إنشاء تصميم
          </button>
        </section>
      ) : (
        <>
          <div className="search-row">
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">بحث في التصاميم</span>
              <input type="search" className="search-input" placeholder="ابحث في التصاميم…" value={q} onChange={(e) => setParam('q', e.target.value)} data-testid="design-search" />
              {q && (
                <button type="button" className="icon-btn search-clear" aria-label="مسح البحث" onClick={() => setParam('q', '')}>
                  <X size={16} />
                </button>
              )}
            </label>
            <label className="filter filter-inline">
              <span className="sr-only">النوع</span>
              <select className="input" value={kind} onChange={(e) => setParam('kind', e.target.value)} data-testid="design-kind-filter">
                <option value="">كل الأنواع</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter filter-inline">
              <span className="sr-only">المشروع</span>
              <select className="input" value={projectFilter} onChange={(e) => setParam('project', e.target.value)} data-testid="design-project-filter">
                <option value="">كل المشاريع</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {shown.length === 0 ? (
            <div className="empty">
              <p>لا توجد تصاميم مطابقة.</p>
            </div>
          ) : (
            <ul className="design-grid" data-testid="design-list">
              {shown.map((d) => {
                const Icon = KIND_ICON[d.kind];
                const lesson = d.lessonId ? lessonById.get(d.lessonId) : null;
                return (
                  <li key={d.id} className="design-tile" data-testid="design-tile" data-kind={d.kind}>
                    <Link to={`/studio/${d.id}`} className="design-tile-link" aria-label={`فتح التصميم: ${d.title}`}>
                      <span className="design-thumb" aria-hidden="true">
                        <DesignThumb design={d} />
                      </span>
                      <span className="design-tile-body">
                        <span className="design-tile-kind">
                          <Icon size={14} aria-hidden="true" /> {KIND_LABEL[d.kind]}
                        </span>
                        <strong className="design-tile-title">{d.title}</strong>
                        <span className="muted design-tile-meta">
                          {projectById.get(d.projectId)?.title ?? 'مشروع محذوف'}
                          {lesson && ` · ${lesson.title}`} · عُدّل {relativeTime(d.updatedAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <CreateDesignDialog
        open={creating}
        projects={projects ?? []}
        lessons={lessons ?? []}
        initialProjectId={params.get('project') ?? undefined}
        initialLessonId={params.get('lesson')}
        initialKind={(params.get('kind') as DesignKind) || undefined}
        onClose={() => {
          setCreating(false);
          if (params.get('new')) setParam('new', '');
        }}
        onCreate={async (v) => {
          try {
            let data: Design['data'] | undefined;
            if (v.fromLesson && v.lessonId) {
              const lesson = await db.lessons.get(v.lessonId);
              const doc = await loadLessonDoc(db, v.lessonId);
              data = prefill(v.kind, { title: lesson?.title ?? v.title, doc }) ?? undefined;
            }
            const d = await createDesign(db, { projectId: v.projectId, lessonId: v.lessonId, kind: v.kind, title: v.title, data });
            setCreating(false);
            toast({ message: `أُنشئ التصميم «${d.title}».` });
            navigate(`/studio/${d.id}`);
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </div>
  );
}

function CreateDesignDialog({
  open,
  projects,
  lessons,
  initialProjectId,
  initialLessonId,
  initialKind,
  onClose,
  onCreate,
}: {
  open: boolean;
  projects: Project[];
  lessons: Lesson[];
  initialProjectId?: string;
  initialLessonId?: string | null;
  initialKind?: DesignKind;
  onClose: () => void;
  onCreate: (v: { kind: DesignKind; title: string; projectId: string; lessonId: string | null; fromLesson: boolean }) => Promise<void>;
}) {
  const uid = useId();
  const active = projects.filter((p) => p.status !== 'archived');
  const [kind, setKind] = useState<DesignKind>('conceptmap');
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [fromLesson, setFromLesson] = useState(true);
  const [errors, setErrors] = useState<{ title?: string; project?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind && KINDS.includes(initialKind) ? initialKind : 'conceptmap');
    setTitle('');
    setProjectId(initialProjectId ?? (active.length === 1 ? active[0].id : ''));
    setLessonId(initialLessonId ?? '');
    setFromLesson(true);
    setErrors({});
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const projectLessons = useMemo(() => lessons.filter((l) => l.projectId === projectId).sort((a, b) => a.order - b.order), [lessons, projectId]);
  const counts = useLiveQuery(async () => {
    if (!lessonId) return null;
    const l = await db.lessons.get(lessonId);
    return prefillCounts({ title: l?.title ?? '', doc: await loadLessonDoc(db, lessonId) });
  }, [lessonId]);
  const available = counts ? counts[kind] : 0;
  const what = kind === 'cards' ? 'بطاقات الدرس' : kind === 'summary' ? 'ملخص الدرس أو أهدافه' : 'عناوين الدرس الرئيسية أو أهدافه';

  return (
    <Dialog
      open={open}
      title="تصميم جديد"
      onClose={onClose}
      testId="create-design-dialog"
      onSubmit={async () => {
        const e: typeof errors = {};
        if (!title.trim()) e.title = 'عنوان التصميم مطلوب.';
        if (!projectId) e.project = 'اختر المشروع.';
        setErrors(e);
        if (Object.keys(e).length) return;
        setBusy(true);
        try {
          await onCreate({ kind, title, projectId, lessonId: lessonId || null, fromLesson: fromLesson && available > 0 });
        } finally {
          setBusy(false);
        }
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="create-design-save">
            إنشاء التصميم
          </button>
        </>
      }
    >
      <div className="form-grid">
        <fieldset className="kind-pick">
          <legend className="field-label">النوع</legend>
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <label key={k} className={`kind-option ${kind === k ? 'is-on' : ''}`}>
                <input type="radio" name={`${uid}-kind`} value={k} checked={kind === k} onChange={() => setKind(k)} data-testid={`kind-${k}`} />
                <Icon size={22} aria-hidden="true" />
                <span>
                  <strong>{KIND_LABEL[k]}</strong>
                  <span className="muted">{KIND_HINT[k]}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className={`field ${errors.title ? 'has-error' : ''}`}>
          <label className="field-label" htmlFor={`${uid}-t`}>
            عنوان التصميم <span className="req" aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-t`}
            className="input"
            value={title}
            maxLength={LIMITS.title}
            placeholder="مثال: خريطة مفاهيم — مصادر الطاقة"
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!errors.title}
            data-testid="design-title-input"
          />
          {errors.title && (
            <span className="field-error" role="alert">
              {errors.title}
            </span>
          )}
        </div>
        <div className={`field ${errors.project ? 'has-error' : ''}`}>
          <label className="field-label" htmlFor={`${uid}-p`}>
            المشروع <span className="req" aria-hidden="true">*</span>
          </label>
          <select
            id={`${uid}-p`}
            className="input"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setLessonId('');
            }}
            data-testid="design-project-select"
          >
            <option value="">اختر مشروعًا</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {errors.project && (
            <span className="field-error" role="alert">
              {errors.project}
            </span>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-l`}>
            الدرس (اختياري)
          </label>
          <select id={`${uid}-l`} className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)} disabled={!projectId} data-testid="design-lesson-select">
            <option value="">بلا درس</option>
            {projectLessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <span className="field-hint">يتيح إضافة صورة التصميم إلى الدرس، والبدء من محتواه.</span>
        </div>
        {lessonId && counts && (
          <label className={`toggle-row ${available ? '' : 'is-disabled'}`}>
            <input type="checkbox" checked={fromLesson && available > 0} disabled={!available} onChange={(e) => setFromLesson(e.target.checked)} data-testid="design-from-lesson" />
            <span>
              ابدأ من محتوى الدرس
              <span className="muted"> — {available ? `${what} (${available})` : `لا يوجد في الدرس ما يُبدأ منه لهذا النوع`}</span>
            </span>
          </label>
        )}
      </div>
    </Dialog>
  );
}
