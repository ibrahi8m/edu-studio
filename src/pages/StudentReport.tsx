import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, BookOpen, CheckCircle2, Layers, ListChecks, RotateCcw, Target } from 'lucide-react';
import { PageHeader, Pill } from '../components/ui';
import { db } from '../db/db';
import { objectivesFor, type ObjectiveRef } from '../db/quizzes';
import { normalizeDoc } from '../lesson/model';
import { bloomStats, MASTERY, objectiveStats, studentQuizRows, type ObjectiveStat } from '../quiz/analytics';
import { normalizeQuiz, SCORE_POLICY_LABEL } from '../quiz/model';
import type { Quiz } from '../quiz/types';
import { summarizeProgress } from '../student/sections';
import { Bar, BloomBars, levelFn, pct, when } from './Results';

/**
 * One student's report for the teacher, from what is saved on this device only:
 * every attempt, the attempt that counts per quiz, objectives mastered or to review, Bloom levels, lesson progress.
 */
export function StudentReport() {
  const { studentKey: raw } = useParams();
  const key = raw ? decodeURIComponent(raw) : '';
  const data = useLiveQuery(async () => {
    const [attempts, quizzes, progress, lessons, projects] = await Promise.all([
      db.attempts.filter((a) => a.studentKey === key && !a.preview).toArray(),
      db.quizzes.toArray(),
      db.progress.where('studentKey').equals(key).toArray(),
      db.lessons.toArray(),
      db.projects.toArray(),
    ]);
    const qs = new Map(quizzes.map(normalizeQuiz).filter((q): q is Quiz => !!q).map((q) => [q.id, q]));
    const projectIds = [...new Set([...attempts.map((a) => a.quiz.projectId), ...progress.map((p) => p.projectId)])];
    const refs = (await Promise.all(projectIds.map((pid) => objectivesFor(db, pid, null)))).flat();
    const objMap = new Map<string, ObjectiveRef>(refs.map((r) => [r.objective.id, r]));
    const docs = await db.lessonDocs.bulkGet(progress.map((p) => p.lessonId));
    const lessonRows = progress
      .map((p, i) => {
        const lesson = lessons.find((l) => l.id === p.lessonId);
        if (!lesson) return null;
        return { p, lesson, project: projects.find((x) => x.id === lesson.projectId)?.title ?? '', summary: summarizeProgress(normalizeDoc(docs[i], lesson.id), p) };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.p.updatedAt - a.p.updatedAt);
    return { attempts, qs, objMap, lessonRows };
  }, [key]);

  const rows = useMemo(() => (data ? studentQuizRows(data.attempts, (id) => data.qs.get(id)?.settings.scorePolicy ?? 'best').sort((a, b) => b.lastAt - a.lastAt) : []), [data]);
  const counted = rows.map((r) => r.counted!).filter(Boolean);

  // Objectives: measured on the counted attempt of each quiz, combined points-weighted.
  const objectives = useMemo(() => objectiveStats(counted), [counted]);
  const bs = useMemo(() => (data ? bloomStats(counted, levelFn(data.objMap)) : []), [counted, data]);

  if (!data) return <div className="page" />;
  const name = rows[0]?.studentName ?? data.lessonRows[0]?.p.studentName ?? '';
  if (!name)
    return (
      <div className="page">
        <div className="empty">
          <p>لا توجد بيانات لهذا الطالب على هذا الجهاز.</p>
          <Link to="/results" className="btn btn-ghost btn-sm">
            العودة إلى النتائج
          </Link>
        </div>
      </div>
    );

  const mastered = objectives.filter((o) => o.mastery >= MASTERY).sort((a, b) => b.mastery - a.mastery);
  const review = objectives.filter((o) => o.mastery < MASTERY).sort((a, b) => a.mastery - b.mastery);
  const avg = counted.length ? Math.round((counted.reduce((s, a) => s + a.result!.percent, 0) / counted.length) * 10) / 10 : 0;
  const objRow = (o: ObjectiveStat) => {
    const ref = data.objMap.get(o.objectiveId);
    return (
      <li key={o.objectiveId} className={o.mastery < 0.5 ? 'is-weak' : ''} data-testid="student-objective">
        <span className="obj-bars-text">
          {ref ? ref.statement : 'هدف لم يعد موجودًا في الدرس'}
          <span className="link-meta">{ref && `${ref.lessonTitle} · ${ref.level ? `مستوى ${ref.level}` : 'بلا مستوى'} · `}{o.questions === 1 ? 'سؤال واحد' : `${o.questions} أسئلة`}</span>
        </span>
        <Bar value={o.mastery} />
        <span className="obj-bars-n">{pct(o.mastery)}</span>
      </li>
    );
  };

  return (
    <div className="page" data-testid="page-student-report">
      <nav className="breadcrumb">
        <Link to="/results">
          <ArrowRight size={16} aria-hidden="true" /> النتائج
        </Link>
      </nav>
      <PageHeader title={name} subtitle="ملخص أداء الطالب من المحاولات والتقدم المحفوظين على هذا الجهاز فقط." />

      <div className="stat-row stat-row-4" data-testid="student-summary">
        <div className="stat">
          <span className="stat-n" data-testid="st-quizzes">{rows.length}</span>
          <span className="stat-l">اختبارات</span>
        </div>
        <div className="stat">
          <span className="stat-n" data-testid="st-attempts">{data.attempts.filter((a) => a.status === 'submitted').length}</span>
          <span className="stat-l">محاولات مُسلَّمة</span>
        </div>
        <div className="stat">
          <span className="stat-n" data-testid="st-average">{avg}٪</span>
          <span className="stat-l">متوسط النتائج المعتمدة</span>
        </div>
        <div className="stat">
          <span className="stat-n" data-testid="st-lessons">{data.lessonRows.filter((l) => l.summary.completed).length}</span>
          <span className="stat-l">دروس مكتملة من {data.lessonRows.length} بدأها</span>
        </div>
      </div>

      {rows.length > 0 && (
        <section className="card">
          <h2 className="card-title">
            <ListChecks size={18} aria-hidden="true" /> الاختبارات والمحاولات
          </h2>
          <ul className="student-list" data-testid="student-quizzes">
            {rows.map((r) => {
              const quiz = data.qs.get(r.quizId);
              const policy = quiz?.settings.scorePolicy ?? 'best';
              return (
                <li key={r.quizId} className="student-report-quiz" data-testid="student-quiz-row">
                  <div className="student-item-main">
                    <strong>{quiz?.title ?? r.attempts[0].quiz.title}</strong>
                    <span className="muted">
                      المعتمدة ({SCORE_POLICY_LABEL[policy]}): <strong data-testid="student-quiz-counted">{r.counted ? `${r.counted.result!.percent}٪` : '—'}</strong>
                    </span>
                  </div>
                  <ol className="take-history">
                    {r.attempts.map((a, i) => (
                      <li key={a.id} data-testid="student-attempt">
                        <Link to={`/results/${a.quizId}/${a.id}`}>
                          المحاولة {i + 1} · {when(a.submittedAt)} · {a.result!.earned}/{a.result!.max} ({a.result!.percent}٪)
                        </Link>
                        {a.id === r.counted?.id && r.attempts.length > 1 && (
                          <Pill tone="accent" icon={RotateCcw}>
                            المعتمدة
                          </Pill>
                        )}
                        {a.result!.pendingReview > 0 && <Pill tone="warning">مبدئية</Pill>}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {rows.length > 0 && (
        <div className="report-grid">
          <section className="card">
            <h2 className="card-title">
              <CheckCircle2 size={18} aria-hidden="true" /> أهداف أتقنها ({mastered.length})
            </h2>
            <p className="muted">{Math.round(MASTERY * 100)}٪ فأكثر من درجات أسئلة الهدف في المحاولات المعتمدة.</p>
            {mastered.length ? <ul className="obj-bars" data-testid="objectives-mastered">{mastered.map(objRow)}</ul> : <p className="muted">لا يوجد بعد.</p>}
          </section>
          <section className="card">
            <h2 className="card-title">
              <Target size={18} aria-hidden="true" /> أهداف تحتاج إلى مراجعة ({review.length})
            </h2>
            <p className="muted">أقل من {Math.round(MASTERY * 100)}٪. ابدأ بالأضعف.</p>
            {review.length ? <ul className="obj-bars" data-testid="objectives-review">{review.map(objRow)}</ul> : <p className="muted">لا يوجد.</p>}
          </section>
        </div>
      )}
      {rows.length > 0 && objectives.length === 0 && <p className="muted">أسئلة اختباراته غير مربوطة بأهداف تعليمية، فلا يمكن تحليل الإتقان حسب الهدف.</p>}

      {rows.length > 0 && (
        <section className="card">
          <h2 className="card-title">
            <Layers size={18} aria-hidden="true" /> الأداء حسب مستوى بلوم
          </h2>
          <BloomBars stats={bs} testId="student-bloom" />
        </section>
      )}

      <section className="card">
        <h2 className="card-title">
          <BookOpen size={18} aria-hidden="true" /> التقدم في الدروس
        </h2>
        {data.lessonRows.length === 0 ? (
          <p className="muted">لم يفتح أي درس في وضع الطالب على هذا الجهاز.</p>
        ) : (
          <ul className="obj-bars" data-testid="student-lessons">
            {data.lessonRows.map((l) => (
              <li key={l.lesson.id} data-testid="student-lesson-row">
                <span className="obj-bars-text">
                  {l.lesson.title}
                  <span className="link-meta">
                    {l.project} · فتح {l.summary.visited} من {l.summary.sections} أقسام
                    {l.summary.activitySteps > 0 && ` · الأنشطة ${l.summary.activityDone}/${l.summary.activitySteps}`} · {when(l.p.updatedAt)}
                  </span>
                </span>
                <Bar value={l.summary.fraction} />
                {l.summary.completed ? <Pill tone="success">مكتمل</Pill> : <span className="obj-bars-n">{pct(l.summary.fraction)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
