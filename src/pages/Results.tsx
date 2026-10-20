import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowRight, BarChart3, ChevronLeft, GraduationCap, Hourglass, Layers, Target, Trash2, Users } from 'lucide-react';
import { errorMessage, useAllProjects } from '../app/data';
import { useToast } from '../app/Toasts';
import { ConfirmDialog } from '../components/Dialog';
import { PageHeader, Pill } from '../components/ui';
import { db } from '../db/db';
import { deleteAttempt, loadQuiz, objectivesFor, restoreAttempt, reviewAnswer, type ObjectiveRef } from '../db/quizzes';
import { bloomInfo } from '../lesson/bloom';
import { attemptObjectives, bloomStats, countable, objectiveStats, questionStats, quizSummary, studentQuizRows, studentSummaries, type LevelStat, type ObjectiveStat } from '../quiz/analytics';
import { useAllAttempts, useAllQuizzes, useQuizAttempts } from '../quiz/data';
import { questionTitle } from '../quiz/describe';
import { questionBloom, SCORE_POLICY_LABEL, TYPE_LABEL } from '../quiz/model';
import { AnswerReview } from '../quiz/take/AnswerReview';
import type { Attempt, Question } from '../quiz/types';

export const pct = (f: number) => `${Math.round(f * 1000) / 10}٪`;
export const when = (t: number | null) => (t ? new Date(t).toLocaleString('ar', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

export function Bar({ value, tone }: { value: number; tone?: 'bad' | 'mid' | 'good' }) {
  const t = tone ?? (value < 0.5 ? 'bad' : value < 0.75 ? 'mid' : 'good');
  return (
    <span className={`bar bar-${t}`} aria-hidden="true">
      <span style={{ inlineSize: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

/* ───────── all quizzes ───────── */

export function ResultsHome() {
  const quizzes = useAllQuizzes();
  const attempts = useAllAttempts();
  const projects = useAllProjects();
  const pMap = new Map((projects ?? []).map((p) => [p.id, p.title]));
  const rows = (quizzes ?? [])
    .map((z) => ({ z, s: quizSummary((attempts ?? []).filter((a) => a.quizId === z.id)) }))
    .sort((a, b) => b.s.attempts - a.s.attempts || b.z.updatedAt - a.z.updatedAt);
  const total = rows.reduce((s, r) => s + r.s.attempts, 0);
  const policy = new Map((quizzes ?? []).map((z) => [z.id, z.settings.scorePolicy]));
  const students = studentSummaries(studentQuizRows(attempts ?? [], (id) => policy.get(id) ?? 'best'));
  return (
    <div className="page" data-testid="page-results">
      <PageHeader title="النتائج والتحليلات" subtitle="من محاولات حقيقية حُفظت على هذا الجهاز فقط. محاولات «التجربة» لا تُحتسب." />
      {quizzes !== undefined && rows.length === 0 ? (
        <section className="card empty-hero">
          <span className="coming-icon" aria-hidden="true">
            <BarChart3 size={30} />
          </span>
          <h2>لا توجد اختبارات بعد</h2>
          <Link to="/quizzes" className="btn btn-primary">
            منشئ الاختبارات
          </Link>
        </section>
      ) : (
        <>
          {total === 0 && quizzes !== undefined && (
            <div className="empty" data-testid="results-none">
              <p>لم يُسلّم أي طالب اختبارًا على هذا الجهاز بعد.</p>
              <p className="muted">تظهر النتائج هنا بعد أول محاولة من «وضع الطالب».</p>
            </div>
          )}
          <ul className="quiz-list">
            {rows.map(({ z, s }) => (
              <li key={z.id} className="quiz-row" data-testid="results-row">
                <Link to={`/results/${z.id}`} className="quiz-row-main">
                  <span className="quiz-row-title">{z.title}</span>
                  <span className="quiz-row-meta">
                    <span className="lesson-project">{pMap.get(z.projectId)}</span>
                    {s.attempts ? (
                      <>
                        <span>· {s.attempts} محاولة</span>
                        <span>· المتوسط {s.averagePercent}٪</span>
                        <span>· النجاح {s.passRate}٪</span>
                      </>
                    ) : (
                      <span>· لا محاولات بعد</span>
                    )}
                  </span>
                </Link>
                {s.pendingReview > 0 && (
                  <Pill tone="warning" icon={Hourglass}>
                    {s.pendingReview} للمراجعة
                  </Pill>
                )}
              </li>
            ))}
          </ul>
          {students.length > 0 && (
            <section className="card" data-testid="students-list">
              <h2 className="card-title">
                <GraduationCap size={18} aria-hidden="true" /> الطلاب ({students.length})
              </h2>
              <p className="muted">لكل طالب: النتيجة المعتمدة في كل اختبار حسب إعداده (أعلى أو آخر أو أول محاولة).</p>
              <ul className="attempt-list">
                {students.map((st) => (
                  <li key={st.studentKey} className="attempt-row" data-testid="student-row">
                    <Link to={`/results/students/${encodeURIComponent(st.studentKey)}`} className="attempt-main">
                      <strong>{st.studentName}</strong>
                      <span className="muted">
                        {st.quizzes} {st.quizzes === 1 ? 'اختبار' : 'اختبارات'} · {st.attempts} محاولة · آخر نشاط {when(st.lastAt)}
                      </span>
                    </Link>
                    <span className="attempt-score" data-testid="student-average">
                      المتوسط {st.averagePercent}٪
                    </span>
                    <ChevronLeft size={18} aria-hidden="true" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Points earned per Bloom level. */
export function BloomBars({ stats, testId }: { stats: LevelStat[]; testId: string }) {
  if (!stats.length) return <p className="muted">لا توجد بيانات.</p>;
  return (
    <ul className="obj-bars" data-testid={testId}>
      {stats.map((b) => (
        <li key={b.level} className={b.mastery < 0.5 ? 'is-weak' : ''} data-testid="bloom-stat" data-level={b.level}>
          <span className="obj-bars-text">
            <span className={`bloom-tag b${b.level}`}>{b.level ? bloomInfo(b.level as 1)!.name : 'بلا مستوى'}</span>
            <span className="link-meta">
              {' '}
              {b.questions === 1 ? 'سؤال واحد' : `${b.questions} أسئلة`} · {b.earned} من {b.max} درجة
            </span>
          </span>
          <Bar value={b.mastery} />
          <span className="obj-bars-n">{pct(b.mastery)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Bloom level of a question: its own tag, else its linked objectives' highest level. */
export function levelFn(map: Map<string, ObjectiveRef> | undefined) {
  return (q: Question) => questionBloom(q, (id) => map?.get(id)?.level);
}

/* ───────── one quiz ───────── */

export function useObjectiveMap(projectId?: string, lessonId?: string | null) {
  return useLiveQuery(async () => {
    if (!projectId) return new Map<string, ObjectiveRef>();
    // All objectives in the project, so links survive a change of the quiz's lesson.
    const refs = await objectivesFor(db, projectId, null);
    void lessonId;
    return new Map(refs.map((r) => [r.objective.id, r]));
  }, [projectId, lessonId]);
}

export function ObjectiveBars({ stats, map, testId }: { stats: ObjectiveStat[]; map: Map<string, ObjectiveRef> | undefined; testId: string }) {
  if (!stats.length) return <p className="muted">لم تُربط الأسئلة بأهداف تعليمية بعد.</p>;
  return (
    <ul className="obj-bars" data-testid={testId}>
      {stats
        .map((s) => ({ s, ref: map?.get(s.objectiveId) }))
        .sort((a, b) => a.s.mastery - b.s.mastery)
        .map(({ s, ref }) => (
          <li key={s.objectiveId} className={s.mastery < 0.5 ? 'is-weak' : ''} data-testid="objective-stat">
            <span className="obj-bars-text">
              {ref ? ref.statement : 'هدف لم يعد موجودًا في الدرس'}
              <span className="link-meta">
                {ref && `${ref.lessonTitle} · ${ref.level ? bloomInfo(ref.level)!.name : 'بلا مستوى'} · `}
                {s.questions === 1 ? 'سؤال واحد' : `${s.questions} أسئلة`}
              </span>
            </span>
            <Bar value={s.mastery} />
            <span className="obj-bars-n">{pct(s.mastery)}</span>
          </li>
        ))}
    </ul>
  );
}

export function QuizResults() {
  const { quizId } = useParams();
  const quiz = useLiveQuery(async () => (quizId ? loadQuiz(db, quizId) : null), [quizId]);
  const attempts = useQuizAttempts(quizId);
  const objMap = useObjectiveMap(quiz?.projectId, quiz?.lessonId);
  const toast = useToast();
  const [confirm, setConfirm] = useState<Attempt | null>(null);

  const done = useMemo(() => countable(attempts ?? []).sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0)), [attempts]);
  const s = useMemo(() => quizSummary(attempts ?? []), [attempts]);
  const qs = useMemo(() => (quiz ? questionStats(attempts ?? [], quiz.questions) : []), [attempts, quiz]);
  const os = useMemo(() => objectiveStats(attempts ?? []), [attempts]);
  const bs = useMemo(() => bloomStats(attempts ?? [], levelFn(objMap)), [attempts, objMap]);
  const perStudent = useMemo(
    () => (quiz ? studentQuizRows(attempts ?? [], () => quiz.settings.scorePolicy).sort((a, b) => a.studentName.localeCompare(b.studentName, 'ar')) : []),
    [attempts, quiz],
  );

  if (quiz === undefined) return <div className="page" />;
  if (quiz === null)
    return (
      <div className="page">
        <div className="empty">
          <p>هذا الاختبار غير موجود.</p>
          <Link to="/results" className="btn btn-ghost btn-sm">
            العودة
          </Link>
        </div>
      </div>
    );

  const pending = done.filter((a) => a.result!.pendingReview > 0);
  const ranked = [...qs].filter((x) => x.seen > 0).sort((a, b) => a.averageFraction - b.averageFraction);

  return (
    <div className="page" data-testid="page-quiz-results">
      <nav className="breadcrumb">
        <Link to="/results">
          <ArrowRight size={16} aria-hidden="true" /> النتائج
        </Link>
      </nav>
      <PageHeader
        title={quiz.title}
        subtitle="من المحاولات المُسلَّمة على هذا الجهاز فقط."
        actions={
          <Link to={`/quizzes/${quiz.id}`} className="btn">
            تحرير الاختبار
          </Link>
        }
      />

      {s.attempts === 0 ? (
        <div className="empty" data-testid="quiz-results-none">
          <p>لم تُسلَّم أي محاولة لهذا الاختبار بعد.</p>
          <p className="muted">لا تُعرض أرقام قبل وجود محاولات حقيقية.</p>
        </div>
      ) : (
        <>
          <div className="stat-row stat-row-4" data-testid="quiz-summary">
            <div className="stat">
              <span className="stat-n" data-testid="sum-attempts">{s.attempts}</span>
              <span className="stat-l">محاولة · {s.students} طالب</span>
            </div>
            <div className="stat">
              <span className="stat-n" data-testid="sum-average">{s.averagePercent}٪</span>
              <span className="stat-l">متوسط الدرجات</span>
            </div>
            <div className="stat">
              <span className="stat-n" data-testid="sum-pass">{s.passRate}٪</span>
              <span className="stat-l">نسبة النجاح</span>
            </div>
            <div className="stat">
              <span className="stat-n" data-testid="sum-best">{s.best}٪</span>
              <span className="stat-l">أعلى نتيجة · الأدنى {s.worst}٪</span>
            </div>
          </div>
          {s.attempts < 5 && <p className="muted">عينة صغيرة ({s.attempts} محاولات): فسّر النسب بحذر.</p>}

          {pending.length > 0 && (
            <section className="card" data-testid="review-queue">
              <h2 className="card-title">
                <Hourglass size={18} aria-hidden="true" /> إجابات بانتظار مراجعتك ({s.pendingReview})
              </h2>
              <ul className="student-list">
                {pending.map((a) => (
                  <li key={a.id} className="student-item">
                    <span className="student-item-main">
                      <strong>{a.studentName}</strong>
                      <span className="muted">
                        {a.result!.pendingReview} {a.result!.pendingReview === 1 ? 'إجابة' : 'إجابات'} · {when(a.submittedAt)}
                      </span>
                    </span>
                    <Link to={`/results/${quiz.id}/${a.id}`} className="btn btn-primary btn-sm" data-testid="open-review">
                      مراجعة
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="card-title">
              <AlertTriangle size={18} aria-hidden="true" /> الأسئلة من الأصعب إلى الأسهل
            </h2>
            <ol className="qstats" data-testid="question-stats">
              {ranked.map((x) => (
                <li key={x.questionId} className={x.difficult ? 'is-hard' : ''} data-testid="question-stat" data-difficult={x.difficult}>
                  <span className="qstats-text">
                    {x.question ? questionTitle(x.question) : 'سؤال محذوف'}
                    <span className="link-meta">
                      {x.question && TYPE_LABEL[x.question.type]} · صحيحة {x.correct} · جزئية {x.partial} · خاطئة {x.incorrect} · بلا إجابة {x.unanswered}
                      {x.review > 0 && ` · للمراجعة ${x.review}`}
                    </span>
                  </span>
                  <Bar value={x.averageFraction} />
                  <span className="obj-bars-n">{pct(x.averageFraction)}</span>
                  {x.difficult && (
                    <Pill tone="danger" icon={AlertTriangle}>
                      يكثر الخطأ فيه
                    </Pill>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="card">
            <h2 className="card-title">
              <Target size={18} aria-hidden="true" /> الأداء حسب الهدف التعليمي
            </h2>
            <ObjectiveBars stats={os} map={objMap} testId="objective-stats" />
          </section>

          <section className="card">
            <h2 className="card-title">
              <Layers size={18} aria-hidden="true" /> الأداء حسب مستوى بلوم
            </h2>
            <BloomBars stats={bs} testId="bloom-stats" />
          </section>

          <section className="card">
            <h2 className="card-title">
              <GraduationCap size={18} aria-hidden="true" /> الطلاب
            </h2>
            <p className="muted">المعتمدة: {SCORE_POLICY_LABEL[quiz.settings.scorePolicy]}. كل المحاولات محفوظة في القائمة التالية.</p>
            <ul className="attempt-list" data-testid="quiz-students">
              {perStudent.map((r) => (
                <li key={r.studentKey} className="attempt-row" data-testid="quiz-student-row">
                  <Link to={`/results/students/${encodeURIComponent(r.studentKey)}`} className="attempt-main">
                    <strong>{r.studentName}</strong>
                    <span className="muted">
                      {r.attempts.length} {r.attempts.length === 1 ? 'محاولة' : 'محاولات'}: {r.attempts.map((a) => `${a.result!.percent}٪`).join('، ')}
                    </span>
                  </Link>
                  <span className="attempt-score" data-testid="quiz-student-counted">
                    {r.counted ? `${r.counted.result!.earned}/${r.counted.result!.max} · ${r.counted.result!.percent}٪` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2 className="card-title">
              <Users size={18} aria-hidden="true" /> المحاولات
            </h2>
            <ul className="attempt-list" data-testid="attempt-list">
              {done.map((a) => (
                <li key={a.id} className="attempt-row" data-testid="attempt-row">
                  <Link to={`/results/${quiz.id}/${a.id}`} className="attempt-main">
                    <strong>{a.studentName}</strong>
                    <span className="muted">
                      {when(a.submittedAt)}
                      {a.timedOut && ' · انتهى الوقت'}
                    </span>
                  </Link>
                  <span className="attempt-score">
                    {a.result!.earned}/{a.result!.max} · {a.result!.percent}٪
                  </span>
                  <Pill tone={a.result!.pendingReview ? 'warning' : a.result!.passed ? 'success' : 'danger'}>
                    {a.result!.pendingReview ? 'مبدئية' : a.result!.passed ? 'ناجح' : 'غير ناجح'}
                  </Pill>
                  <button type="button" className="icon-btn danger" aria-label={`حذف محاولة ${a.studentName}`} onClick={() => setConfirm(a)}>
                    <Trash2 size={17} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="حذف المحاولة"
        confirmLabel="حذف المحاولة"
        testId="confirm-delete-attempt"
        onClose={() => setConfirm(null)}
        message={<p>ستُحذف محاولة «{confirm?.studentName}» ونتيجتها، وتعود محاولة إلى رصيده.</p>}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            const removed = await deleteAttempt(db, confirm.id);
            setConfirm(null);
            toast({ message: 'حُذفت المحاولة.', action: { label: 'تراجع', run: () => restoreAttempt(db, removed) } });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </div>
  );
}

/* ───────── one attempt (teacher view + review) ───────── */

export function AttemptDetail() {
  const { quizId, attemptId } = useParams();
  const attempt = useLiveQuery(async () => (attemptId ? ((await db.attempts.get(attemptId)) ?? null) : null), [attemptId]);
  const objMap = useObjectiveMap(attempt?.quiz.projectId, attempt?.quiz.lessonId);
  const navigate = useNavigate();
  const toast = useToast();

  if (attempt === undefined) return <div className="page" />;
  if (attempt === null || !attempt.result)
    return (
      <div className="page">
        <div className="empty">
          <p>هذه المحاولة غير موجودة أو لم تُسلَّم.</p>
          <Link to={`/results/${quizId}`} className="btn btn-ghost btn-sm">
            العودة
          </Link>
        </div>
      </div>
    );

  const r = attempt.result;
  const byId = new Map(attempt.quiz.questions.map((q) => [q.id, q]));
  const decide = async (questionId: string, earned: number) => {
    try {
      await reviewAnswer(db, attempt.id, questionId, earned);
      toast({ message: 'حُفظ قرارك وأُعيد حساب الدرجة.' });
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'danger' });
    }
  };

  return (
    <div className="page" data-testid="page-attempt">
      <nav className="breadcrumb">
        <button type="button" className="link-btn crumb-btn" onClick={() => navigate(`/results/${attempt.quizId}`)}>
          <ArrowRight size={16} aria-hidden="true" /> {attempt.quiz.title}
        </button>
      </nav>
      <PageHeader title={attempt.studentName} subtitle={`سُلّمت ${when(attempt.submittedAt)}${attempt.timedOut ? ' — عند انتهاء الوقت' : ''}`} />
      <div className="stat-row">
        <div className="stat">
          <span className="stat-n" data-testid="attempt-score">
            {r.earned}/{r.max}
          </span>
          <span className="stat-l">الدرجة</span>
        </div>
        <div className="stat">
          <span className="stat-n" data-testid="attempt-percent">{r.percent}٪</span>
          <span className="stat-l">النسبة</span>
        </div>
        <div className="stat">
          <span className="stat-n" data-testid="attempt-verdict">{r.pendingReview ? 'مبدئية' : r.passed ? 'ناجح' : 'غير ناجح'}</span>
          <span className="stat-l">{r.pendingReview ? `${r.pendingReview} بانتظار المراجعة` : `النجاح من ${attempt.quiz.settings.passPercent}٪`}</span>
        </div>
      </div>

      <section className="card">
        <h2 className="card-title">
          <Target size={18} aria-hidden="true" /> الأداء حسب الهدف
        </h2>
        <ObjectiveBars stats={attemptObjectives(attempt)} map={objMap} testId="attempt-objectives" />
      </section>

      <ol className="review-list" data-testid="attempt-answers">
        {attempt.order.map((id, i) => {
          const q = byId.get(id)!;
          const qr = r.questions.find((x) => x.questionId === id)!;
          return (
            <AnswerReview key={id} q={q} r={qr} answer={attempt.answers[id]} number={i + 1} show={{ correctness: true, correct: true, feedback: true }}>
              <TeacherDecision max={qr.max} earned={qr.earned} review={qr.status === 'review'} overridden={!!qr.override} onDecide={(e) => void decide(id, e)} />
            </AnswerReview>
          );
        })}
      </ol>
    </div>
  );
}

function TeacherDecision({ max, earned, review, overridden, onDecide }: { max: number; earned: number; review: boolean; overridden: boolean; onDecide: (earned: number) => void }) {
  const [open, setOpen] = useState(review);
  const [val, setVal] = useState(String(earned));
  if (!open)
    return (
      <div className="teacher-decision">
        {overridden && <span className="muted">عدّلت هذه الدرجة يدويًا.</span>}
        <button type="button" className="link-btn" onClick={() => setOpen(true)}>
          تعديل الدرجة
        </button>
      </div>
    );
  return (
    <div className={`teacher-decision is-open ${review ? 'is-review' : ''}`} data-testid="teacher-decision">
      {review && <strong>قرارك في هذه الإجابة:</strong>}
      <button type="button" className="btn btn-sm btn-primary" onClick={() => onDecide(max)} data-testid="decide-correct">
        صحيحة ({max})
      </button>
      <button type="button" className="btn btn-sm" onClick={() => onDecide(0)} data-testid="decide-wrong">
        خاطئة (0)
      </button>
      <label className="points-field">
        <span>درجة أخرى</span>
        <input className="input input-sm" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} aria-label="درجة أخرى" data-testid="decide-points" />
      </label>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={() => {
          const n = Number(val.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
          if (Number.isFinite(n)) onDecide(n);
        }}
        data-testid="decide-apply"
      >
        اعتماد
      </button>
    </div>
  );
}
