import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, FolderPlus, Plus, Search, X } from 'lucide-react';
import { errorMessage, useAllLessons, useAllProjects } from '../app/data';
import { useToast } from '../app/Toasts';
import { db, type Project } from '../db/db';
import { createLesson, queryLessons } from '../db/projects';
import { Dialog } from '../components/Dialog';
import { LessonRow } from '../components/ProjectBits';
import { PageHeader } from '../components/ui';

/** Entry point to the lesson editor: pick any lesson, or start a new one inside a project. */
export function BuilderPage() {
  const projects = useAllProjects();
  const lessons = useAllLessons();
  const docCounts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.lessonDocs.each((d) => m.set(d.lessonId, (d.blocks?.length ?? 0) + (d.objectives?.length ?? 0)));
    return m;
  }, []);
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [err, setErr] = useState('');

  const map = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p] as [string, Project])), [projects]);
  const shown = useMemo(() => (lessons ? queryLessons(lessons, map, { q }) : []), [lessons, map, q]);
  const active = (projects ?? []).filter((p) => p.status !== 'archived');

  if (projects && projects.length === 0)
    return (
      <div className="page" data-testid="page-builder">
        <PageHeader title="منشئ الدروس" subtitle="صمّم الدرس من الهدف إلى النشاط، ثم عاينه كما يراه الطالب." />
        <section className="card empty-hero">
          <span className="coming-icon" aria-hidden="true">
            <FolderPlus size={30} />
          </span>
          <h2>أنشئ مشروعًا أولًا</h2>
          <p className="muted">كل درس ينتمي إلى مشروع (وحدة أو مقرر).</p>
          <Link to="/projects" className="btn btn-primary">
            الذهاب إلى المشاريع
          </Link>
        </section>
      </div>
    );

  return (
    <div className="page" data-testid="page-builder">
      <PageHeader
        title="منشئ الدروس"
        subtitle="اختر درسًا لتحرير أهدافه ومحتواه، أو ابدأ درسًا جديدًا."
        actions={
          <button
            type="button"
            className="btn btn-primary fab-mobile"
            onClick={() => {
              setNewProject(active[0]?.id ?? '');
              setNewTitle('');
              setErr('');
              setCreating(true);
            }}
            data-testid="builder-new-lesson"
          >
            <Plus size={18} aria-hidden="true" />
            <span>درس جديد</span>
          </button>
        }
      />
      <label className="search">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">بحث في الدروس</span>
        <input type="search" className="search-input" placeholder="ابحث عن درس…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && (
          <button type="button" className="icon-btn search-clear" aria-label="مسح البحث" onClick={() => setQ('')}>
            <X size={16} />
          </button>
        )}
      </label>
      {lessons && lessons.length === 0 ? (
        <div className="empty">
          <BookOpen size={24} className="muted-icon" aria-hidden="true" />
          <p>لا توجد دروس بعد.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p>لا توجد دروس مطابقة.</p>
        </div>
      ) : (
        <ul className="lesson-list" data-testid="builder-lessons">
          {shown.map((l) => (
            <LessonRow
              key={l.id}
              lesson={l}
              project={map.get(l.projectId)}
              onOpen={() => navigate(`/projects/${l.projectId}/lessons/${l.id}`)}
              badge={docCounts?.get(l.id) ? undefined : 'لم يُبنَ بعد'}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={creating}
        title="درس جديد"
        onClose={() => setCreating(false)}
        testId="builder-dialog"
        onSubmit={async () => {
          if (!newTitle.trim()) return setErr('عنوان الدرس مطلوب.');
          if (!newProject) return setErr('اختر المشروع.');
          try {
            const l = await createLesson(db, newProject, { title: newTitle });
            setCreating(false);
            navigate(`/projects/${newProject}/lessons/${l.id}`);
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" data-testid="builder-create">
              إنشاء وفتح المحرر
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="b-project">
              المشروع
            </label>
            <select id="b-project" className="input" value={newProject} onChange={(e) => setNewProject(e.target.value)} data-testid="builder-project">
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div className={`field ${err ? 'has-error' : ''}`}>
            <label className="field-label" htmlFor="b-title">
              عنوان الدرس
            </label>
            <input id="b-title" className="input" value={newTitle} maxLength={120} onChange={(e) => setNewTitle(e.target.value)} data-testid="builder-title" />
            {err && (
              <span className="field-error" role="alert">
                {err}
              </span>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
