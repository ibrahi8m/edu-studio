import { DemoBadge, DemoBanner } from '../demo/DemoUI';
import { isDemoId } from '../demo/content';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BarChart3, BookOpen, Eye, EyeOff, FolderOutput, Layers, ListChecks, Palette, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { errorMessage, useAllProjects, useProject, useProjectLessons } from '../app/data';
import { lessonsLabel, minutesLabel, relativeTime } from '../app/format';
import { useToast } from '../app/Toasts';
import { db, type Lesson } from '../db/db';
import { detailLines, isPublished, KIND_SPECS, kindOf } from '../db/contentKinds';
import {
  createLesson,
  deleteLesson,
  deleteProject,
  distinctSubjects,
  moveLesson,
  queryLessons,
  restoreLesson,
  restoreProject,
  setPublished,
  updateLesson,
  updateProject,
} from '../db/projects';
import { ConfirmDialog } from '../components/Dialog';
import { LessonFormDialog, ProjectFormDialog } from '../components/forms';
import { LessonRow, StatusPill, Tags } from '../components/ProjectBits';
import { Pill } from '../components/ui';
import { useProjectQuizzes } from '../quiz/data';
import { totalPoints } from '../quiz/grading';
import { quizReadiness } from '../quiz/model';
import { questionsLabel } from './Quizzes';
import { KIND_LABEL, normalizeDesign } from '../studio/model';
import type { Design } from '../studio/types';

export function ProjectDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const project = useProject(id);
  const lessons = useProjectLessons(id);
  const allProjects = useAllProjects();

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lessonDialog, setLessonDialog] = useState<{ open: boolean; lesson: Lesson | null }>({ open: false, lesson: null });
  const [confirmLesson, setConfirmLesson] = useState<Lesson | null>(null);
  const [q, setQ] = useState('');
  const highlight = params.get('lesson');

  // Arriving from a search result: open that lesson's row in view.
  useEffect(() => {
    if (!highlight || !lessons) return;
    const el = document.getElementById(`lesson-${highlight}`);
    el?.scrollIntoView({ block: 'center' });
  }, [highlight, lessons]);

  const shown = useMemo(() => {
    if (!lessons || !project) return [];
    return q ? queryLessons(lessons, new Map([[project.id, project]]), { q }).sort((a, b) => a.order - b.order) : lessons;
  }, [lessons, project, q]);

  const totalMinutes = (lessons ?? []).reduce((s, l) => s + (l.duration || 0), 0);

  if (project === undefined || lessons === undefined) return <div className="page"><p className="muted">جارٍ التحميل…</p></div>;
  if (project === null)
    return (
      <div className="page" data-testid="project-missing">
        <div className="empty">
          <p>هذا المحتوى غير موجود على هذا الجهاز.</p>
          <Link to="/projects" className="btn btn-ghost btn-sm">العودة إلى المحتوى التعليمي</Link>
        </div>
      </div>
    );

  const kind = kindOf(project);
  const spec = KIND_SPECS[kind];
  const published = isPublished(project);
  const meta = [project.subject, spec.usesGrade ? project.grade : ''].filter(Boolean);
  const units = [...new Set(lessons.map((l) => l.unit ?? '').filter(Boolean))];
  const details = spec.fields.filter((f) => project.details?.[f.key]);
  const togglePublish = async () => {
    try {
      await setPublished(db, project.id, !published);
      toast({ message: published ? 'أُلغي النشر: لم يعد المحتوى يظهر في بيئة المتعلم.' : 'نُشر المحتوى: يظهر الآن في بيئة المتعلم على هذا الجهاز.' });
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'danger' });
    }
  };

  return (
    <div className="page" data-testid="page-project">
      <nav className="breadcrumb" aria-label="مسار التنقل">
        <Link to="/projects">
          <ArrowRight size={16} aria-hidden="true" /> المحتوى التعليمي
        </Link>
      </nav>

      {isDemoId(project.id) && <DemoBanner where="project" />}

      <section className={`project-hero c-${project.color}`}>
        <span className="project-card-bar" aria-hidden="true" />
        <div className="project-hero-main">
          <div className="project-hero-tags">
            <DemoBadge id={project.id} />
            <Pill tone="accent">{spec.label}</Pill>
            <span data-testid="publish-state">
              <Pill tone={published ? 'success' : 'warning'}>{published ? 'منشور' : 'غير منشور'}</Pill>
            </span>
            <StatusPill status={project.status} />
            {meta.map((m) => (
              <Pill key={m}>{m}</Pill>
            ))}
          </div>
          <h1 className="project-hero-title" data-testid="project-heading">{project.title}</h1>
          {project.description && <p className="project-hero-desc">{project.description}</p>}
          <Tags tags={project.tags} />
          {details.length > 0 && (
            <dl className="kv kind-kv" data-testid="project-details">
              {details.map((f) => (
                <div key={f.key} className="kv-row">
                  <dt>{f.label}</dt>
                  <dd>
                    {f.multiline ? (
                      <ul className="plain-list">
                        {detailLines(project, f.key).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    ) : (
                      project.details![f.key]
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="muted">
            {lessonsLabel(lessons.length)}
            {units.length > 0 && ` · ${units.length.toLocaleString('ar')} ${spec.unitLabel === 'المحور' ? 'محاور' : 'وحدات'}`}
            {totalMinutes > 0 && ` · ${minutesLabel(totalMinutes)}`} · أُنشئ {new Date(project.createdAt).toLocaleDateString('ar')} · عُدّل {relativeTime(project.updatedAt)}
          </p>
        </div>
        <div className="project-hero-actions">
          <button type="button" className="btn" onClick={() => setEditing(true)} data-testid="edit-project">
            <Pencil size={16} aria-hidden="true" /> تعديل
          </button>
          <button type="button" className="btn" onClick={() => void togglePublish()} data-testid="toggle-publish">
            {published ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />} {published ? 'إلغاء النشر' : 'نشر'}
          </button>
          <Link to={`/backup?export=${project.id}`} className="btn" data-testid="export-this-project">
            <FolderOutput size={16} aria-hidden="true" /> تصدير
          </Link>
          <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmDelete(true)} data-testid="delete-project">
            <Trash2 size={16} aria-hidden="true" /> حذف
          </button>
        </div>
      </section>

      <section className="card">
        <div className="lessons-head">
          <h2 className="card-title">
            <BookOpen size={18} aria-hidden="true" /> {kind === 'training' ? 'المحاور والجلسات' : kind === 'university' ? 'الموضوعات والمحاضرات' : 'الوحدات والدروس'}
          </h2>
          <button type="button" className="btn btn-primary fab-mobile" onClick={() => setLessonDialog({ open: true, lesson: null })} data-testid="new-lesson">
            <Plus size={18} aria-hidden="true" />
            <span>درس جديد</span>
          </button>
        </div>

        {lessons.length > 3 && (
          <label className="search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">بحث في الدروس</span>
            <input type="search" className="search-input" placeholder="ابحث في دروس هذا المحتوى…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button type="button" className="icon-btn search-clear" aria-label="مسح البحث" onClick={() => setQ('')}>
                <X size={16} />
              </button>
            )}
          </label>
        )}

        {lessons.length === 0 ? (
          <div className="empty" data-testid="lessons-empty">
            <p>لا توجد دروس في هذا المحتوى بعد.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLessonDialog({ open: true, lesson: null })}>
              <Plus size={16} aria-hidden="true" /> إضافة أول درس
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty"><p>لا توجد دروس مطابقة.</p></div>
        ) : (
          <ol className="lesson-list" data-testid="project-lessons">
            {groupByUnit(shown).map(({ unit, lessons: group }) => [
              unit ? (
                <li key={`u:${unit}`} className="unit-head" data-testid="unit-head">
                  <Layers size={16} aria-hidden="true" /> {unit}
                </li>
              ) : units.length > 0 ? (
                <li key="u:none" className="unit-head is-none">
                  بلا {spec.unitLabel}
                </li>
              ) : null,
              ...group.map((l) => {
              const index = lessons.findIndex((x) => x.id === l.id);
              return (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  index={index + 1}
                  highlight={highlight === l.id}
                  onOpen={() => navigate(`/projects/${project.id}/lessons/${l.id}`)}
                  onEdit={() => setLessonDialog({ open: true, lesson: l })}
                  onMove={
                    q
                      ? undefined
                      : async (dir) => {
                          try {
                            await moveLesson(db, l.id, dir);
                          } catch (e) {
                            toast({ message: errorMessage(e), tone: 'danger' });
                          }
                        }
                  }
                  isFirst={index === 0}
                  isLast={index === lessons.length - 1}
                />
              );
            }),
            ])}
          </ol>
        )}
        <p className="muted builder-note">افتح أي درس لكتابة أهدافه وبناء محتواه ومعاينته كما يراه الطالب. زر القلم يعدّل بيانات الدرس فقط.</p>
      </section>

      <ProjectQuizzes projectId={project.id} lessons={lessons} />
      <ProjectDesigns projectId={project.id} lessons={lessons} />

      <ProjectFormDialog
        key={editing ? 'edit' : 'closed'}
        open={editing}
        initial={project}
        subjects={distinctSubjects(allProjects ?? [])}
        onClose={() => setEditing(false)}
        onSave={async (input) => {
          try {
            await updateProject(db, project.id, input);
            setEditing(false);
            toast({ message: 'حُفظت التعديلات على هذا الجهاز.', sound: 'save' });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="حذف المحتوى التعليمي"
        testId="confirm-delete-project"
        confirmLabel="حذف المحتوى ودروسه"
        onClose={() => setConfirmDelete(false)}
        message={
          <>
            <p>
              سيُحذف «<strong>{project.title}</strong>» مع {lessonsLabel(lessons.length)} من هذا الجهاز.
            </p>
            <p>يُحذف معه أيضًا: اختباراته، ونتائج المتعلمين وتقدمهم فيه، وتسليمات تكاليفه، وتصاميمه.</p>
            <p className="muted">يمكنك التراجع خلال ثوانٍ من التنبيه الذي سيظهر، أو صدّره أولًا لتحتفظ بنسخة.</p>
          </>
        }
        onConfirm={async () => {
          try {
            const snap = await deleteProject(db, project.id);
            setConfirmDelete(false);
            navigate('/projects');
            toast({
              message: `حُذف «${snap.project.title}».`,
              action: {
                label: 'تراجع',
                run: async () => {
                  await restoreProject(db, snap);
                  navigate(`/projects/${snap.project.id}`);
                },
              },
            });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />

      <LessonFormDialog
        // remount on every opening so the form starts from the right values before the first keystroke
        key={lessonDialog.open ? (lessonDialog.lesson?.id ?? 'new') : 'closed'}
        open={lessonDialog.open}
        initial={lessonDialog.lesson}
        projectTitle={project.title}
        unitLabel={spec.unitLabel}
        lessonLabel={spec.lessonLabel}
        units={units}
        onClose={() => setLessonDialog({ open: false, lesson: null })}
        onDelete={() => {
          setConfirmLesson(lessonDialog.lesson);
          setLessonDialog({ open: false, lesson: null });
        }}
        onSave={async (input) => {
          try {
            if (lessonDialog.lesson) {
              await updateLesson(db, lessonDialog.lesson.id, input);
              toast({ message: 'حُفظت تعديلات الدرس.' });
            } else {
              const l = await createLesson(db, project.id, input);
              toast({
                message: `أُضيف الدرس «${l.title}».`,
                action: { label: 'فتح المحرر', run: () => navigate(`/projects/${project.id}/lessons/${l.id}`) },
              });
            }
            setLessonDialog({ open: false, lesson: null });
            if (highlight) setParams({}, { replace: true });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmLesson}
        title="حذف الدرس"
        testId="confirm-delete-lesson"
        confirmLabel="حذف الدرس"
        onClose={() => setConfirmLesson(null)}
        message={
          <>
            <p>سيُحذف الدرس «<strong>{confirmLesson?.title}</strong>» ومحتواه ووسائطه.</p>
            <p>يُحذف معه تقدم المتعلمين فيه وتسليمات تكاليفه. الاختبارات المرتبطة به تبقى، والتصاميم تبقى دون ربط.</p>
            <p className="muted">يمكنك التراجع خلال ثوانٍ من التنبيه.</p>
          </>
        }
        onConfirm={async () => {
          if (!confirmLesson) return;
          try {
            const removed = await deleteLesson(db, confirmLesson.id);
            setConfirmLesson(null);
            toast({
              message: `حُذف الدرس «${removed.lesson.title}».`,
              action: { label: 'تراجع', run: () => restoreLesson(db, removed) },
            });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </div>
  );
}

/** Lessons grouped by unit, units in the order of their first lesson; lessons without a unit last. */
function groupByUnit(list: Lesson[]): { unit: string; lessons: Lesson[] }[] {
  const groups = new Map<string, Lesson[]>();
  for (const l of list) {
    const u = l.unit ?? '';
    if (!groups.has(u)) groups.set(u, []);
    groups.get(u)!.push(l);
  }
  const out = [...groups.entries()].map(([unit, lessons]) => ({ unit, lessons }));
  return [...out.filter((g) => g.unit), ...out.filter((g) => !g.unit)];
}

function ProjectQuizzes({ projectId, lessons }: { projectId: string; lessons: Lesson[] }) {
  const quizzes = useProjectQuizzes(projectId);
  const lessonTitle = new Map(lessons.map((l) => [l.id, l.title]));
  return (
    <section className="card" data-testid="project-quizzes">
      <div className="lessons-head">
        <h2 className="card-title">
          <ListChecks size={18} aria-hidden="true" /> الاختبارات
        </h2>
        <Link to={`/quizzes?new=1&project=${projectId}`} className="btn btn-sm" data-testid="project-new-quiz">
          <Plus size={16} aria-hidden="true" /> اختبار جديد
        </Link>
      </div>
      {!quizzes?.length ? (
        <p className="muted">لا توجد اختبارات لهذا المحتوى بعد.</p>
      ) : (
        <ul className="quiz-list">
          {quizzes
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((z) => {
              const ready = quizReadiness(z).ready;
              return (
                <li key={z.id} className="quiz-row">
                  <Link to={`/quizzes/${z.id}`} className="quiz-row-main" aria-label={`فتح الاختبار: ${z.title}`}>
                    <span className="quiz-row-title">{z.title}</span>
                    <span className="quiz-row-meta">
                      {z.lessonId && <span>{lessonTitle.get(z.lessonId) ?? 'درس محذوف'} · </span>}
                      <span>
                        {questionsLabel(z.questions.length)} · {totalPoints(z.questions)} درجة
                      </span>
                    </span>
                  </Link>
                  <span className="quiz-row-side">
                    <Pill tone={ready ? 'success' : 'warning'}>{ready ? 'جاهز' : 'غير مكتمل'}</Pill>
                    <Link to={`/results/${z.id}`} className="icon-btn" aria-label={`نتائج ${z.title}`}>
                      <BarChart3 size={17} />
                    </Link>
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}

function ProjectDesigns({ projectId, lessons }: { projectId: string; lessons: Lesson[] }) {
  const designs = useLiveQuery(async () => (await db.designs.where('projectId').equals(projectId).toArray()).map(normalizeDesign).filter((d): d is Design => !!d), [projectId]);
  const lessonTitle = new Map(lessons.map((l) => [l.id, l.title]));
  return (
    <section className="card" data-testid="project-designs">
      <div className="lessons-head">
        <h2 className="card-title">
          <Palette size={18} aria-hidden="true" /> التصاميم
        </h2>
        <Link to={`/studio?new=1&project=${projectId}`} className="btn btn-sm" data-testid="project-new-design">
          <Plus size={16} aria-hidden="true" /> تصميم جديد
        </Link>
      </div>
      {!designs?.length ? (
        <p className="muted">لا توجد تصاميم لهذا المحتوى بعد.</p>
      ) : (
        <ul className="quiz-list">
          {designs
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((d) => (
              <li key={d.id} className="quiz-row">
                <Link to={`/studio/${d.id}`} className="quiz-row-main" aria-label={`فتح التصميم: ${d.title}`}>
                  <span className="quiz-row-title">{d.title}</span>
                  <span className="quiz-row-meta">
                    <span>{KIND_LABEL[d.kind]}</span>
                    {d.lessonId && <span> · {lessonTitle.get(d.lessonId) ?? 'درس محذوف'}</span>}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
