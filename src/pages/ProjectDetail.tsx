import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { errorMessage, useAllProjects, useProject, useProjectLessons } from '../app/data';
import { lessonsLabel, minutesLabel, relativeTime } from '../app/format';
import { useToast } from '../app/Toasts';
import { db, type Lesson } from '../db/db';
import {
  createLesson,
  deleteLesson,
  deleteProject,
  distinctSubjects,
  moveLesson,
  queryLessons,
  restoreLesson,
  restoreProject,
  updateLesson,
  updateProject,
} from '../db/projects';
import { ConfirmDialog } from '../components/Dialog';
import { LessonFormDialog, ProjectFormDialog } from '../components/forms';
import { LessonRow, StatusPill, Tags } from '../components/ProjectBits';
import { Pill } from '../components/ui';

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
          <p>هذا المشروع غير موجود على هذا الجهاز.</p>
          <Link to="/projects" className="btn btn-ghost btn-sm">العودة إلى المشاريع</Link>
        </div>
      </div>
    );

  const meta = [project.subject, project.grade].filter(Boolean);

  return (
    <div className="page" data-testid="page-project">
      <nav className="breadcrumb" aria-label="مسار التنقل">
        <Link to="/projects">
          <ArrowRight size={16} aria-hidden="true" /> المشاريع
        </Link>
      </nav>

      <section className={`project-hero c-${project.color}`}>
        <span className="project-card-bar" aria-hidden="true" />
        <div className="project-hero-main">
          <div className="project-hero-tags">
            <StatusPill status={project.status} />
            {meta.map((m) => (
              <Pill key={m}>{m}</Pill>
            ))}
          </div>
          <h1 className="project-hero-title" data-testid="project-heading">{project.title}</h1>
          {project.description && <p className="project-hero-desc">{project.description}</p>}
          <Tags tags={project.tags} />
          <p className="muted">
            {lessonsLabel(lessons.length)}
            {totalMinutes > 0 && ` · ${minutesLabel(totalMinutes)}`} · عُدّل {relativeTime(project.updatedAt)}
          </p>
        </div>
        <div className="project-hero-actions">
          <button type="button" className="btn" onClick={() => setEditing(true)} data-testid="edit-project">
            <Pencil size={16} aria-hidden="true" /> تعديل
          </button>
          <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmDelete(true)} data-testid="delete-project">
            <Trash2 size={16} aria-hidden="true" /> حذف
          </button>
        </div>
      </section>

      <section className="card">
        <div className="lessons-head">
          <h2 className="card-title">
            <BookOpen size={18} aria-hidden="true" /> دروس المشروع
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
            <input type="search" className="search-input" placeholder="ابحث في دروس هذا المشروع…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button type="button" className="icon-btn search-clear" aria-label="مسح البحث" onClick={() => setQ('')}>
                <X size={16} />
              </button>
            )}
          </label>
        )}

        {lessons.length === 0 ? (
          <div className="empty" data-testid="lessons-empty">
            <p>لا توجد دروس في هذا المشروع بعد.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLessonDialog({ open: true, lesson: null })}>
              <Plus size={16} aria-hidden="true" /> إضافة أول درس
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty"><p>لا توجد دروس مطابقة.</p></div>
        ) : (
          <ol className="lesson-list" data-testid="project-lessons">
            {shown.map((l) => {
              const index = lessons.findIndex((x) => x.id === l.id);
              return (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  index={index + 1}
                  highlight={highlight === l.id}
                  onOpen={() => setLessonDialog({ open: true, lesson: l })}
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
            })}
          </ol>
        )}
        <p className="muted builder-note">إضافة الأهداف والمحتوى والأنشطة داخل كل درس تأتي في المرحلة 2 (منشئ الدروس).</p>
      </section>

      <ProjectFormDialog
        open={editing}
        initial={project}
        subjects={distinctSubjects(allProjects ?? [])}
        onClose={() => setEditing(false)}
        onSave={async (input) => {
          try {
            await updateProject(db, project.id, input);
            setEditing(false);
            toast({ message: 'حُفظت تعديلات المشروع.' });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="حذف المشروع"
        testId="confirm-delete-project"
        confirmLabel="حذف المشروع ودروسه"
        onClose={() => setConfirmDelete(false)}
        message={
          <>
            <p>
              سيُحذف «<strong>{project.title}</strong>» مع {lessonsLabel(lessons.length)} من هذا الجهاز.
            </p>
            <p className="muted">يمكنك التراجع خلال ثوانٍ من التنبيه الذي سيظهر.</p>
          </>
        }
        onConfirm={async () => {
          try {
            const snap = await deleteProject(db, project.id);
            setConfirmDelete(false);
            navigate('/projects');
            toast({
              message: `حُذف المشروع «${snap.project.title}».`,
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
        open={lessonDialog.open}
        initial={lessonDialog.lesson}
        projectTitle={project.title}
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
              toast({ message: `أُضيف الدرس «${l.title}».` });
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
        message={<p>سيُحذف الدرس «<strong>{confirmLesson?.title}</strong>» من هذا المشروع.</p>}
        onConfirm={async () => {
          if (!confirmLesson) return;
          try {
            const removed = await deleteLesson(db, confirmLesson.id);
            setConfirmLesson(null);
            toast({
              message: `حُذف الدرس «${removed.title}».`,
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
