import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, ListChecks, Plus, Search, X } from 'lucide-react';
import { errorMessage, useAllLessons, useAllProjects } from '../app/data';
import { relativeTime } from '../app/format';
import { useToast } from '../app/Toasts';
import { db } from '../db/db';
import { createQuiz } from '../db/quizzes';
import { matchesQuery } from '../db/search';
import { PageHeader, Pill } from '../components/ui';
import { quizSummary } from '../quiz/analytics';
import { CreateQuizDialog } from '../quiz/CreateQuizDialog';
import { useAllAttempts, useAllQuizzes } from '../quiz/data';
import { totalPoints } from '../quiz/grading';
import { quizReadiness } from '../quiz/model';
import type { Attempt } from '../quiz/types';

export function questionsLabel(n: number): string {
  if (n === 0) return 'بلا أسئلة';
  if (n === 1) return 'سؤال واحد';
  if (n === 2) return 'سؤالان';
  if (n <= 10) return `${n} أسئلة`;
  return `${n} سؤالًا`;
}

export function QuizzesPage() {
  const quizzes = useAllQuizzes();
  const projects = useAllProjects();
  const lessons = useAllLessons();
  const attempts = useAllAttempts();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const navigate = useNavigate();
  const toast = useToast();
  const q = params.get('q') ?? '';
  const projectFilter = params.get('project') ?? '';

  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);
  const lessonById = useMemo(() => new Map((lessons ?? []).map((l) => [l.id, l])), [lessons]);
  const attemptsByQuiz = useMemo(() => {
    const m = new Map<string, Attempt[]>();
    for (const a of attempts ?? []) m.set(a.quizId, [...(m.get(a.quizId) ?? []), a]);
    return m;
  }, [attempts]);

  const shown = useMemo(
    () =>
      (quizzes ?? [])
        .filter((z) => !projectFilter || z.projectId === projectFilter)
        .filter((z) => matchesQuery(q, z.title, z.description, projectById.get(z.projectId)?.title, z.lessonId ? lessonById.get(z.lessonId)?.title : ''))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [quizzes, q, projectFilter, projectById, lessonById],
  );

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  const loading = quizzes === undefined || projects === undefined;

  return (
    <div className="page" data-testid="page-quizzes">
      <PageHeader
        title="منشئ الاختبارات"
        subtitle="اختبارات مرتبطة بالمشاريع والدروس وأهدافها، تُصحَّح تلقائيًا وتُحفظ على هذا الجهاز."
        actions={
          projects && projects.length > 0 ? (
            <button type="button" className="btn btn-primary fab-mobile" onClick={() => setCreating(true)} data-testid="new-quiz">
              <Plus size={18} aria-hidden="true" />
              <span>اختبار جديد</span>
            </button>
          ) : null
        }
      />

      {!loading && projects!.length === 0 ? (
        <section className="card empty-hero">
          <span className="coming-icon" aria-hidden="true">
            <ListChecks size={30} />
          </span>
          <h2>أنشئ مشروعًا أولًا</h2>
          <p className="muted">كل اختبار ينتمي إلى مشروع، ويمكن ربطه بدرس محدد وأهدافه.</p>
          <Link to="/projects" className="btn btn-primary">
            الذهاب إلى المشاريع
          </Link>
        </section>
      ) : !loading && quizzes!.length === 0 ? (
        <section className="card empty-hero" data-testid="quizzes-empty">
          <span className="coming-icon" aria-hidden="true">
            <ListChecks size={30} />
          </span>
          <h2>لا توجد اختبارات بعد</h2>
          <p className="muted">ابدأ باختبار قصير لدرس واحد: سؤالان أو ثلاثة مرتبطة بأهدافه.</p>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" /> إنشاء اختبار
          </button>
        </section>
      ) : (
        <>
          <div className="search-row">
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">بحث في الاختبارات</span>
              <input type="search" className="search-input" placeholder="ابحث في الاختبارات…" value={q} onChange={(e) => setParam('q', e.target.value)} data-testid="quiz-search" />
              {q && (
                <button type="button" className="icon-btn search-clear" aria-label="مسح البحث" onClick={() => setParam('q', '')}>
                  <X size={16} />
                </button>
              )}
            </label>
            <label className="filter filter-inline">
              <span className="sr-only">المشروع</span>
              <select className="input" value={projectFilter} onChange={(e) => setParam('project', e.target.value)} data-testid="quiz-project-filter">
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
              <p>لا توجد اختبارات مطابقة.</p>
            </div>
          ) : (
            <ul className="quiz-list" data-testid="quiz-list">
              {shown.map((z) => {
                const ready = quizReadiness(z).ready;
                const s = quizSummary(attemptsByQuiz.get(z.id) ?? []);
                const lesson = z.lessonId ? lessonById.get(z.lessonId) : null;
                return (
                  <li key={z.id} className="quiz-row" data-testid="quiz-row">
                    <Link to={`/quizzes/${z.id}`} className="quiz-row-main" aria-label={`فتح الاختبار: ${z.title}`}>
                      <span className="quiz-row-title">{z.title}</span>
                      <span className="quiz-row-meta">
                        <span className="lesson-project">{projectById.get(z.projectId)?.title ?? 'مشروع محذوف'}</span>
                        {lesson && <span>· {lesson.title}</span>}
                        <span>· {questionsLabel(z.questions.length)}</span>
                        <span>· {totalPoints(z.questions)} درجة</span>
                        <span>· عُدّل {relativeTime(z.updatedAt)}</span>
                      </span>
                    </Link>
                    <span className="quiz-row-side">
                      <Pill tone={ready ? 'success' : 'warning'}>{ready ? 'جاهز للطلاب' : 'غير مكتمل'}</Pill>
                      <Link to={`/results/${z.id}`} className="btn btn-ghost btn-sm" aria-label={`نتائج ${z.title}`}>
                        <BarChart3 size={16} aria-hidden="true" /> {s.attempts ? `${s.attempts} محاولة` : 'النتائج'}
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <CreateQuizDialog
        open={creating}
        projects={projects ?? []}
        lessons={lessons ?? []}
        initialProjectId={params.get('project') ?? undefined}
        initialLessonId={params.get('lesson')}
        onClose={() => {
          setCreating(false);
          if (params.get('new')) setParam('new', '');
        }}
        onCreate={async (v) => {
          try {
            const z = await createQuiz(db, v.projectId, v.lessonId, v.title);
            setCreating(false);
            toast({ message: `أُنشئ الاختبار «${z.title}».` });
            navigate(`/quizzes/${z.id}`);
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </div>
  );
}
