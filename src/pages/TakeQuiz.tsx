import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Award, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck, Eye, Flag, Hourglass, ListChecks, Lock, MinusCircle, Play, RotateCcw, Send, Timer, XCircle } from 'lucide-react';
import { errorMessage } from '../app/data';
import { useToast } from '../app/Toasts';
import { ConfirmDialog } from '../components/Dialog';
import { db } from '../db/db';
import { AttemptLimitError, checkAnswer, findOpenAttempt, loadQuiz, saveProgress, startAttempt, submitAttempt, usedAttempts } from '../db/quizzes';
import { countable, countedAttempt } from '../quiz/analytics';
import { useStudent } from '../student/identity';
import { describeCorrect, questionTitle, STATUS_LABEL } from '../quiz/describe';
import { gradeQuestion, isAnswered, totalPoints } from '../quiz/grading';
import { FEEDBACK_TIMING_LABEL, quizReadiness, SCORE_POLICY_LABEL, studentKey, TYPE_LABEL } from '../quiz/model';
import { AnswerReview } from '../quiz/take/AnswerReview';
import { QuestionView } from '../quiz/take/QuestionView';
import type { Answer, Attempt, Question, QuestionResult } from '../quiz/types';
import { questionsLabel } from './Quizzes';

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

type View = 'intro' | 'question' | 'review' | 'result';

/** Student mode: full screen, outside the app shell. */
export function TakeQuiz() {
  const { quizId } = useParams();
  const [params] = useSearchParams();
  const preview = params.get('preview') === '1';
  const navigate = useNavigate();
  const toast = useToast();
  const quiz = useLiveQuery(async () => (quizId ? loadQuiz(db, quizId) : null), [quizId]);
  const project = useLiveQuery(async () => (quiz ? ((await db.projects.get(quiz.projectId)) ?? null) : null), [quiz?.projectId]);

  const from = params.get('from');
  const [student, setStudent] = useStudent();
  const [name, setName] = useState(() => (preview ? 'تجربة المعلم' : student));
  const [editingName, setEditingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [confirmAgain, setConfirmAgain] = useState(false);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [view, setView] = useState<View>('intro');
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef<Attempt | null>(null);
  latest.current = attempt;

  const used = useLiveQuery(async () => (quizId && name.trim() && !preview ? usedAttempts(db, quizId, name) : 0), [quizId, name, preview, attempt?.status]);
  const open = useLiveQuery(async () => (quizId && name.trim() ? findOpenAttempt(db, quizId, name, preview) : null), [quizId, name, preview, attempt?.id]);
  /** This student's submitted attempts of this quiz, oldest first (for numbering and the counted score). */
  const mine = useLiveQuery(
    async () =>
      quizId && name.trim() && !preview
        ? countable(await db.attempts.where('[quizId+studentKey]').equals([quizId, studentKey(name)]).toArray()).sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0))
        : [],
    [quizId, name, preview, attempt?.status],
  );

  const questions = useMemo(() => {
    if (!attempt) return [];
    const byId = new Map(attempt.quiz.questions.map((q) => [q.id, q]));
    return attempt.order.map((id) => byId.get(id)!).filter(Boolean);
  }, [attempt]);

  /* ───────── persistence of answers while taking ───────── */
  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const a = latest.current;
    if (a && a.status === 'in_progress') await saveProgress(db, a.id, a.answers, a.flagged);
  }, []);
  const scheduleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), 300);
  }, [flushSave]);
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flushSave();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushSave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushSave);
      void flushSave();
    };
  }, [flushSave]);

  const setAnswer = (qid: string, a: Answer) => {
    setAttempt((cur) => (cur && !(cur.checked ?? []).includes(qid) ? { ...cur, answers: { ...cur.answers, [qid]: a } } : cur));
    scheduleSave();
  };
  const toggleFlag = (qid: string) => {
    setAttempt((cur) => (cur ? { ...cur, flagged: cur.flagged.includes(qid) ? cur.flagged.filter((x) => x !== qid) : [...cur.flagged, qid] } : cur));
    scheduleSave();
  };

  const check = async (qid: string) => {
    const a = latest.current;
    if (!a) return;
    setChecking(true);
    try {
      const { attempt: next } = await checkAnswer(db, a.id, qid, a.answers[qid]);
      // Keep the other answers typed since the last save; the checked one is now locked.
      setAttempt((cur) => (cur ? { ...cur, answers: { ...cur.answers, [qid]: next.answers[qid] }, checked: next.checked } : cur));
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'danger' });
    } finally {
      setChecking(false);
    }
  };

  const submit = useCallback(
    async (timedOut = false) => {
      const a = latest.current;
      if (!a || a.status !== 'in_progress') return;
      setBusy(true);
      try {
        window.clearTimeout(saveTimer.current);
        const done = await submitAttempt(db, a.id, { answers: a.answers, timedOut });
        setAttempt(done);
        setView('result');
        setConfirmSubmit(false);
        window.scrollTo({ top: 0 });
        if (timedOut) toast({ message: 'انتهى الوقت، فسُلّم الاختبار تلقائيًا بإجاباتك المحفوظة.', tone: 'danger' });
      } catch (e) {
        toast({ message: errorMessage(e), tone: 'danger' });
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  /* ───────── timer ───────── */
  const deadline = attempt?.status === 'in_progress' ? attempt.deadline : null;
  useEffect(() => {
    if (!deadline) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => window.clearInterval(t);
  }, [deadline]);
  const remaining = deadline ? deadline - now : null;
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && latest.current?.status === 'in_progress' && !busy) void submit(true);
  }, [remaining, submit, busy]);

  useEffect(() => {
    if (view === 'question') headingRef.current?.focus();
  }, [index, view]);

  /* ───────── start / resume ───────── */
  const begin = async (resume: Attempt | null) => {
    if (!quiz) return;
    if (!name.trim()) {
      setNameError('اكتب اسمك قبل البدء.');
      return;
    }
    if (!preview) setStudent(name.trim());
    setBusy(true);
    try {
      const a = resume ?? (await startAttempt(db, quiz.id, name, { preview }));
      setAttempt(a);
      latest.current = a;
      const order = a.order;
      const byId = new Map(a.quiz.questions.map((q) => [q.id, q]));
      const firstOpen = order.findIndex((id) => !isAnswered(byId.get(id)!, a.answers[id]));
      setIndex(firstOpen >= 0 ? firstOpen : 0);
      if (a.deadline && a.deadline <= Date.now()) {
        await submit(true);
        return;
      }
      setView('question');
    } catch (e) {
      toast({ message: e instanceof AttemptLimitError ? e.message : errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    setConfirmAgain(false);
    setAttempt(null);
    setView('intro');
    window.scrollTo({ top: 0 });
  };

  /* ───────── render ───────── */
  if (quiz === undefined) return <div className="take-shell" />;
  if (quiz === null)
    return (
      <div className="take-shell">
        <div className="take-wrap">
          <div className="empty">
            <p>هذا الاختبار غير موجود على هذا الجهاز.</p>
            <Link to="/learn" className="btn btn-ghost btn-sm">
              العودة
            </Link>
          </div>
        </div>
      </div>
    );

  const readiness = quizReadiness(quiz);
  const backHref = preview ? `/quizzes/${quiz.id}` : from ? `/learn/lesson/${from}?s=end` : '/learn';
  const limitReached = !preview && quiz.settings.maxAttempts > 0 && (used ?? 0) >= quiz.settings.maxAttempts && !open;
  const answeredCount = attempt ? questions.filter((q) => isAnswered(q, attempt.answers[q.id])).length : 0;
  const q = questions[index];
  const attemptImmediate = attempt?.quiz.settings.feedbackTiming === 'immediate';
  const locked = !!(attempt && q && (attempt.checked ?? []).includes(q.id));
  const lowTime = remaining !== null && remaining <= 60_000;

  return (
    <div className="take-shell" data-testid="page-take">
      <header className="take-bar">
        <Link to={backHref} className="btn btn-ghost btn-sm" aria-label={preview ? 'العودة إلى المحرر' : 'خروج'} data-testid="take-exit">
          <ArrowRight size={16} aria-hidden="true" /> <span>{preview ? 'المحرر' : 'خروج'}</span>
        </Link>
        <span className="take-title">{quiz.title}</span>
        {remaining !== null && view !== 'result' && (
          <span className={`take-timer ${lowTime ? 'is-low' : ''}`} role="timer" aria-label={`الوقت المتبقي ${clock(remaining)}`} data-testid="take-timer">
            <Timer size={16} aria-hidden="true" /> {clock(remaining)}
          </span>
        )}
      </header>
      {preview && (
        <div className="banner banner-offline take-preview" role="status" data-testid="preview-banner">
          وضع التجربة: هذه المحاولة لا تُحتسب في النتائج ولا في عدد المحاولات.
        </div>
      )}
      {lowTime && view !== 'result' && (
        <p className="sr-only" aria-live="assertive">
          بقيت أقل من دقيقة.
        </p>
      )}

      <main className="take-wrap">
        {/* ───── intro ───── */}
        {view === 'intro' && (
          <section className="card take-intro" data-testid="take-intro">
            <span className="lv-kicker">{project?.title}</span>
            <h1 className="take-h1">{quiz.title}</h1>
            {quiz.description && <p className="take-desc">{quiz.description}</p>}
            <ul className="take-facts">
              <li>
                <ListChecks size={16} aria-hidden="true" /> {questionsLabel(quiz.questions.length)}
              </li>
              <li>
                <Award size={16} aria-hidden="true" /> {totalPoints(quiz.questions)} درجة · النجاح من {quiz.settings.passPercent}٪
              </li>
              <li>
                <Timer size={16} aria-hidden="true" /> {quiz.settings.timeLimit ? `${quiz.settings.timeLimit} دقيقة، ويُسلَّم تلقائيًا عند انتهائها` : 'بلا وقت محدد'}
              </li>
              <li>
                <RotateCcw size={16} aria-hidden="true" />{' '}
                {quiz.settings.maxAttempts ? `${quiz.settings.maxAttempts} ${quiz.settings.maxAttempts === 1 ? 'محاولة واحدة' : 'محاولات'}` : 'محاولات غير محدودة'}
                {!preview && quiz.settings.maxAttempts > 0 && name.trim() && ` (استخدمت ${used ?? 0})`}
              </li>
            </ul>
            {!readiness.ready ? (
              <div className="align-alert is-warn" role="alert" data-testid="take-not-ready">
                <CircleAlert size={20} aria-hidden="true" />
                <div>
                  <strong>هذا الاختبار غير جاهز بعد.</strong>
                  <p>على المعلم إكمال الأسئلة أولًا.</p>
                </div>
              </div>
            ) : (
              <>
                {!preview &&
                  (student && name === student && !editingName ? (
                    <p className="take-who" data-testid="take-who">
                      تدخل الاختبار باسم <strong>{student}</strong>.{' '}
                      <button type="button" className="link-btn" onClick={() => setEditingName(true)} data-testid="take-change-name">
                        لست {student}؟
                      </button>
                    </p>
                  ) : (
                    <div className={`field ${nameError ? 'has-error' : ''}`}>
                      <label className="field-label" htmlFor="student-name">
                        اسمك
                      </label>
                      <input
                        id="student-name"
                        className="input input-lg"
                        value={name}
                        maxLength={80}
                        autoComplete="name"
                        onChange={(e) => {
                          setName(e.target.value);
                          setNameError('');
                        }}
                        data-testid="student-name"
                      />
                      {nameError && (
                        <span className="field-error" role="alert">
                          {nameError}
                        </span>
                      )}
                    </div>
                  ))}
                <div className="take-rules" data-testid="take-rules">
                  <p>
                    <Eye size={16} aria-hidden="true" /> التصحيح وإظهار الإجابات: {FEEDBACK_TIMING_LABEL[quiz.settings.feedbackTiming]}
                    {quiz.settings.feedbackTiming === 'end' && !quiz.settings.showScore && ' (لن تظهر الدرجة لك، بل لمعلمك)'}.
                  </p>
                  {!preview && quiz.settings.maxAttempts !== 1 && (
                    <p data-testid="take-policy">
                      <RotateCcw size={16} aria-hidden="true" /> تُحفظ كل محاولة على حدة ولا تُمحى السابقة، وتُعتمد في نتيجتك: <strong>{SCORE_POLICY_LABEL[quiz.settings.scorePolicy]}</strong>.
                    </p>
                  )}
                  {!preview && (mine?.length ?? 0) > 0 && (
                    <div data-testid="take-history">
                      <p>
                        <ClipboardCheck size={16} aria-hidden="true" /> محاولاتك السابقة:
                      </p>
                      <ol className="take-history">
                        {mine!.map((a, i) => (
                          <li key={a.id}>
                            المحاولة {i + 1} · {new Date(a.submittedAt ?? 0).toLocaleString('ar', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                            {a.quiz.settings.showScore && a.result && ` · ${a.result.earned}/${a.result.max} (${a.result.percent}٪)`}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
                {limitReached ? (
                  <div className="align-alert is-error" role="alert" data-testid="take-limit">
                    <CircleAlert size={20} aria-hidden="true" />
                    <div>
                      <strong>استُنفدت محاولاتك ({quiz.settings.maxAttempts}).</strong>
                      <p>راجع معلمك إذا احتجت محاولة أخرى.</p>
                    </div>
                  </div>
                ) : open ? (
                  <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void begin(open)} data-testid="take-resume">
                    <Play size={18} aria-hidden="true" /> متابعة محاولتك السابقة
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void begin(null)} data-testid="take-start">
                    <Play size={18} aria-hidden="true" /> {!preview && (mine?.length ?? 0) > 0 ? `ابدأ المحاولة ${(mine?.length ?? 0) + 1}` : 'ابدأ الاختبار'}
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {/* ───── answering ───── */}
        {view === 'question' && attempt && q && (
          <div className="take-layout">
            <nav className="qnav" aria-label="الأسئلة">
              <p className="qnav-sum" data-testid="take-progress">
                أجبت عن {answeredCount} من {questions.length}
              </p>
              <ol className="qnav-list">
                {questions.map((qq, i) => {
                  const done = isAnswered(qq, attempt.answers[qq.id]);
                  const flagged = attempt.flagged.includes(qq.id);
                  return (
                    <li key={qq.id}>
                      <button
                        type="button"
                        className={`qnav-btn ${done ? 'is-done' : ''} ${i === index ? 'is-current' : ''} ${flagged ? 'is-flagged' : ''}`}
                        aria-current={i === index ? 'step' : undefined}
                        aria-label={`السؤال ${i + 1}: ${done ? 'مُجاب' : 'غير مُجاب'}${flagged ? '، معلَّم للمراجعة' : ''}`}
                        onClick={() => setIndex(i)}
                        data-testid="qnav-btn"
                        data-done={done}
                      >
                        {i + 1}
                        {flagged && <Flag size={10} aria-hidden="true" className="qnav-flag" />}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button type="button" className="btn btn-sm qnav-review" onClick={() => setView('review')} data-testid="go-review">
                <ClipboardCheck size={16} aria-hidden="true" /> مراجعة وتسليم
              </button>
            </nav>

            <section className="card take-q" aria-labelledby="take-q-h" data-testid="take-question" data-type={q.type}>
              <div className="take-q-meta">
                <span>
                  السؤال {index + 1} من {questions.length}
                </span>
                <span>
                  {TYPE_LABEL[q.type]} · {q.points} {q.points === 1 ? 'درجة' : 'درجات'}
                </span>
              </div>
              <h1 id="take-q-h" className="take-q-h" tabIndex={-1} ref={headingRef} data-testid="take-q-title">
                {q.type === 'fill' ? q.prompt || 'أكمل الفراغات:' : questionTitle(q)}
              </h1>
              <fieldset className="q-lock" disabled={locked} data-testid="take-answer-area" data-locked={locked}>
                <legend className="sr-only">إجابتك</legend>
                <QuestionView q={q} answer={attempt.answers[q.id]} optionOrder={attempt.optionOrder[q.id]} onChange={(a) => setAnswer(q.id, a)} />
              </fieldset>
              {attemptImmediate &&
                (locked ? (
                  <InstantFeedback q={q} r={gradeQuestion(q, attempt.answers[q.id])} answer={attempt.answers[q.id]} showCorrect={attempt.quiz.settings.showCorrectAnswers} showFeedback={attempt.quiz.settings.showFeedback} />
                ) : (
                  <button
                    type="button"
                    className="btn take-check"
                    disabled={checking || !isAnswered(q, attempt.answers[q.id])}
                    onClick={() => void check(q.id)}
                    data-testid="take-check"
                  >
                    <CheckCircle2 size={18} aria-hidden="true" /> تحقق من إجابتي
                  </button>
                ))}
              <div className="take-q-foot">
                <button
                  type="button"
                  className={`btn btn-sm ${attempt.flagged.includes(q.id) ? 'btn-flagged' : 'btn-ghost'}`}
                  aria-pressed={attempt.flagged.includes(q.id)}
                  onClick={() => toggleFlag(q.id)}
                  data-testid="take-flag"
                >
                  <Flag size={16} aria-hidden="true" /> {attempt.flagged.includes(q.id) ? 'معلَّم للمراجعة' : 'علّمه للمراجعة'}
                </button>
              </div>
              <div className="take-q-nav">
                <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)} data-testid="take-prev">
                  <ChevronRight size={18} aria-hidden="true" /> السابق
                </button>
                {index < questions.length - 1 ? (
                  <button type="button" className="btn btn-primary" onClick={() => setIndex(index + 1)} data-testid="take-next">
                    التالي <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => setView('review')} data-testid="take-to-review">
                    مراجعة وتسليم <ClipboardCheck size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ───── review before submitting ───── */}
        {view === 'review' && attempt && (
          <section className="card take-review" data-testid="take-review">
            <h1 className="take-h1">مراجعة قبل التسليم</h1>
            <p className={answeredCount < questions.length ? 'warn-text' : 'muted'} data-testid="review-summary">
              أجبت عن {answeredCount} من {questions.length} سؤالًا.
              {answeredCount < questions.length && ` ${questions.length - answeredCount} بلا إجابة.`}
            </p>
            <ol className="review-list-brief">
              {questions.map((qq, i) => {
                const done = isAnswered(qq, attempt.answers[qq.id]);
                return (
                  <li key={qq.id} className={done ? 'is-done' : 'is-open'}>
                    <span className="qcard-n">{i + 1}</span>
                    <span className="brief-q">{questionTitle(qq)}</span>
                    <span className={`pill ${done ? 'pill-success' : 'pill-warning'}`}>{done ? 'مُجاب' : 'بلا إجابة'}</span>
                    {attempt.flagged.includes(qq.id) && (
                      <span className="pill pill-accent">
                        <Flag size={12} aria-hidden="true" /> معلَّم
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setIndex(i);
                        setView('question');
                      }}
                      aria-label={`الانتقال إلى السؤال ${i + 1}`}
                    >
                      تعديل
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="take-q-nav">
              <button type="button" className="btn" onClick={() => setView('question')}>
                <ChevronRight size={18} aria-hidden="true" /> العودة للأسئلة
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => (answeredCount < questions.length ? setConfirmSubmit(true) : void submit())}
                data-testid="take-submit"
              >
                <Send size={18} aria-hidden="true" /> تسليم الاختبار
              </button>
            </div>
          </section>
        )}

        {/* ───── result ───── */}
        {view === 'result' && attempt?.result && (
          <ResultView
            attempt={attempt}
            number={preview ? 0 : Math.max(1, (mine ?? []).findIndex((a) => a.id === attempt.id) + 1)}
            counted={preview ? null : countedAttempt(mine ?? [], quiz.settings.scorePolicy)}
            total={preview ? 0 : (mine ?? []).length}
            onAgain={() => (preview ? again() : setConfirmAgain(true))}
            canRetry={preview || !quiz.settings.maxAttempts || (used ?? 0) < quiz.settings.maxAttempts}
            onExit={() => navigate(backHref)}
          />
        )}
      </main>

      <ConfirmDialog
        open={confirmAgain}
        title="محاولة جديدة"
        testId="confirm-again"
        danger={false}
        confirmLabel="ابدأ محاولة جديدة"
        onClose={() => setConfirmAgain(false)}
        onConfirm={() => again()}
        message={
          <>
            <p>
              ستبدأ المحاولة {(mine?.length ?? 0) + 1}
              {quiz.settings.maxAttempts > 0 && ` من ${quiz.settings.maxAttempts}`}.
            </p>
            <p>محاولاتك السابقة ونتائجها تبقى محفوظة ولا تُستبدل. يُعتمد في نتيجتك: {SCORE_POLICY_LABEL[quiz.settings.scorePolicy]}.</p>
          </>
        }
      />
      <ConfirmDialog
        open={confirmSubmit}
        title="تسليم مع أسئلة بلا إجابة"
        testId="confirm-submit"
        danger={false}
        confirmLabel="تسليم الآن"
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => void submit()}
        message={<p>بقيت {questions.length - answeredCount} أسئلة بلا إجابة، وتُحسب درجتها صفرًا. هل تريد التسليم؟</p>}
      />
    </div>
  );
}

function ResultView({
  attempt,
  number,
  counted,
  total,
  onAgain,
  canRetry,
  onExit,
}: {
  attempt: Attempt;
  number: number;
  counted: Attempt | null;
  total: number;
  onAgain: () => void;
  canRetry: boolean;
  onExit: () => void;
}) {
  const r = attempt.result!;
  const s = attempt.quiz.settings;
  const byId = new Map(attempt.quiz.questions.map((q) => [q.id, q]));
  const showList = s.showCorrectAnswers || s.showFeedback;
  return (
    <section className="take-result" data-testid="take-result">
      <div className={`card result-hero ${s.showScore ? (r.passed ? 'is-pass' : 'is-fail') : ''}`}>
        {number > 0 && (
          <p className="muted" data-testid="result-attempt-no">
            المحاولة {number}
            {total > 1 && ` من ${total} محاولات محفوظة`}
          </p>
        )}
        {attempt.timedOut && (
          <p className="pill pill-warning">
            <Hourglass size={14} aria-hidden="true" /> سُلّم تلقائيًا عند انتهاء الوقت
          </p>
        )}
        {s.showScore ? (
          <>
            <p className="result-label">{r.pendingReview ? 'نتيجتك المبدئية' : 'نتيجتك'}</p>
            <p className="result-score" data-testid="result-score">
              {r.earned} / {r.max}
            </p>
            <p className="result-percent" data-testid="result-percent">
              {r.percent}٪
            </p>
            <p className={`result-verdict ${r.passed ? 'ok' : 'bad'}`} data-testid="result-verdict">
              {r.passed ? 'ناجح' : 'لم تبلغ درجة النجاح'} <span className="muted">(النجاح من {s.passPercent}٪)</span>
            </p>
            {total > 1 && counted?.result && (
              <p className="muted" data-testid="result-counted">
                المعتمدة في نتيجتك ({SCORE_POLICY_LABEL[s.scorePolicy]}): المحاولة {counted.id === attempt.id ? 'هذه' : 'السابقة'} — {counted.result.percent}٪
              </p>
            )}
            {r.pendingReview > 0 && (
              <p className="muted" data-testid="result-pending">
                {r.pendingReview === 1 ? 'إجابة واحدة' : `${r.pendingReview} إجابات`} بانتظار مراجعة المعلم، وقد تتغير الدرجة بعدها.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="result-score">تم التسليم</p>
            <p className="muted" data-testid="result-hidden">حُفظت إجاباتك. سيعرض معلمك النتيجة لاحقًا.</p>
          </>
        )}
        <div className="result-actions">
          {canRetry && (
            <button type="button" className="btn" onClick={onAgain} data-testid="take-again">
              <RotateCcw size={16} aria-hidden="true" /> محاولة جديدة
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onExit}>
            إنهاء
          </button>
        </div>
      </div>
      {showList && (
        <ol className="review-list" data-testid="result-details">
          {attempt.order.map((id, i) => {
            const q = byId.get(id)!;
            const qr = r.questions.find((x) => x.questionId === id)!;
            return <AnswerReview key={id} q={q} r={qr} answer={attempt.answers[id]} number={i + 1} show={{ correctness: s.showCorrectAnswers, correct: s.showCorrectAnswers, feedback: s.showFeedback, notes: false }} />;
          })}
        </ol>
      )}
    </section>
  );
}

/** Immediate-feedback mode: the verdict for one checked question, following the teacher's display settings. */
function InstantFeedback({ q, r, answer, showCorrect, showFeedback }: { q: Question; r: QuestionResult; answer: Answer | undefined; showCorrect: boolean; showFeedback: boolean }) {
  const Icon = r.status === 'correct' ? CheckCircle2 : r.status === 'partial' ? MinusCircle : r.status === 'review' ? Hourglass : XCircle;
  const text = r.status === 'correct' ? q.feedbackCorrect : q.feedbackIncorrect;
  const chosen = q.type === 'mcq' && answer?.type === 'mcq' ? q.options.filter((o) => answer.selected.includes(o.id) && o.feedback.trim()) : [];
  return (
    <div className={`instant-fb st-${r.status}`} role="status" data-testid="instant-feedback" data-status={r.status}>
      <p className="instant-fb-head">
        <Icon size={18} aria-hidden="true" /> <strong>{STATUS_LABEL[r.status]}</strong> · {r.earned}/{r.max}
        <span className="muted instant-lock">
          <Lock size={13} aria-hidden="true" /> أُقفلت الإجابة
        </span>
      </p>
      {r.status === 'review' && <p>سيراجع المعلم هذه الإجابة، وقد تتغير درجتها.</p>}
      {showCorrect && r.status !== 'correct' && (
        <p data-testid="instant-correct">
          الإجابة الصحيحة: <strong>{describeCorrect(q)}</strong>
        </p>
      )}
      {showFeedback && r.status !== 'review' && text && <p data-testid="instant-text">{text}</p>}
      {showFeedback &&
        chosen.map((o) => (
          <p key={o.id} data-testid="instant-option-feedback">
            <strong>{o.text}:</strong> {o.feedback}
          </p>
        ))}
    </div>
  );
}
