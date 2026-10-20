import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, BarChart3, ChevronLeft, CircleAlert, ListChecks, Play, Plus, Settings2, Target, Trash2 } from 'lucide-react';
import { errorMessage } from '../app/data';
import { useToast } from '../app/Toasts';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { db } from '../db/db';
import { deleteQuiz, objectivesFor, restoreQuiz, type ObjectiveRef } from '../db/quizzes';
import { BLOOM, bloomInfo } from '../lesson/bloom';
import { AutoTextarea, SaveStatusPill } from '../lesson/editor/parts';
import { QTYPE_ICON } from '../quiz/editor/icons';
import { QuestionCard } from '../quiz/editor/QuestionCard';
import { Toggle } from '../quiz/editor/TypeEditors';
import { totalPoints } from '../quiz/grading';
import {
  addQuestion,
  bloomDistribution,
  duplicateQuestion,
  FEEDBACK_TIMING_LABEL,
  insertQuestionAt,
  LIMITS,
  moveItem,
  newQuestion,
  QUESTION_TYPES,
  quizReadiness,
  removeQuestion,
  SCORE_POLICY_LABEL,
  updateQuestion,
} from '../quiz/model';
import type { Question, QuestionType, Quiz, QuizSettings } from '../quiz/types';
import { useQuizEditor } from '../quiz/useQuizEditor';
import { questionsLabel } from './Quizzes';

type Tab = 'questions' | 'settings';

export function QuizEditorPage() {
  const { quizId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const ed = useQuizEditor(quizId);
  const titleId = useId();
  const tab: Tab = params.get('tab') === 'settings' ? 'settings' : 'questions';
  const setTab = (t: Tab) => setParams(t === 'questions' ? {} : { tab: t }, { replace: true });

  const [adding, setAdding] = useState<{ open: boolean; after: string | null }>({ open: false, after: null });
  const [linking, setLinking] = useState<string | null>(null);
  const [focusQ, setFocusQ] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const quiz = ed.quiz;
  const objectives = useLiveQuery(async () => (quiz ? objectivesFor(db, quiz.projectId, quiz.lessonId) : []), [quiz?.projectId, quiz?.lessonId], [] as ObjectiveRef[]);
  const lessons = useLiveQuery(async () => (quiz ? (await db.lessons.where('projectId').equals(quiz.projectId).toArray()).sort((a, b) => a.order - b.order) : []), [quiz?.projectId]);
  const attemptCount = useLiveQuery(async () => (quizId ? db.attempts.where('quizId').equals(quizId).filter((a) => !a.preview && a.status === 'submitted').count() : 0), [quizId]);

  useEffect(() => {
    if (!focusQ) return;
    const el = document.getElementById(`q-${focusQ}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    window.setTimeout(() => el.querySelector<HTMLElement>('textarea, input:not([type=checkbox]):not([type=radio]):not([type=number])')?.focus({ preventScroll: true }), 250);
    setFocusQ(null);
  }, [focusQ, quiz?.questions]);

  const readiness = useMemo(() => (quiz ? quizReadiness(quiz) : null), [quiz]);

  if (ed.status.kind === 'missing')
    return (
      <div className="page" data-testid="quiz-missing">
        <div className="empty">
          <p>هذا الاختبار غير موجود على هذا الجهاز.</p>
          <Link to="/quizzes" className="btn btn-ghost btn-sm">
            العودة إلى الاختبارات
          </Link>
        </div>
      </div>
    );
  if (!quiz || !readiness)
    return (
      <div className="page">
        <p className="muted">جارٍ فتح الاختبار…</p>
      </div>
    );

  const edit = ed.edit;
  const setQuestion = (id: string, patch: Partial<Question>) => edit((z) => updateQuestion(z, id, patch));
  const setSettings = (patch: Partial<QuizSettings>) => edit((z) => ({ ...z, settings: { ...z.settings, ...patch } }));
  const linkingQ = quiz.questions.find((q) => q.id === linking) ?? null;
  const errorCount = readiness.quizIssues.length + readiness.problems.filter((p) => p.issues.some((i) => i.level === 'error')).length;

  const add = (type: QuestionType) => {
    const q = newQuestion(type);
    edit((z) => addQuestion(z, q, adding.after));
    setAdding({ open: false, after: null });
    setFocusQ(q.id);
  };

  const tryAsStudent = async () => {
    await ed.saveNow();
    navigate(`/take/${quiz.id}?preview=1`);
  };

  return (
    <div className="page page-wide editor" data-testid="page-quiz-editor">
      <nav className="breadcrumb crumbs" aria-label="مسار التنقل">
        <Link to="/quizzes">
          <ArrowRight size={16} aria-hidden="true" /> الاختبارات
        </Link>
        <ChevronLeft size={14} aria-hidden="true" className="crumb-sep" />
        {ed.project && <Link to={`/projects/${ed.project.id}`}>{ed.project.title}</Link>}
      </nav>

      <header className="editor-head">
        <div className="editor-title-wrap">
          <label htmlFor={titleId} className="sr-only">
            عنوان الاختبار
          </label>
          <input
            id={titleId}
            className={`editor-title ${!quiz.title.trim() ? 'is-invalid' : ''}`}
            value={quiz.title}
            maxLength={LIMITS.title}
            placeholder="عنوان الاختبار"
            onChange={(e) => {
              const v = e.target.value;
              edit((z) => ({ ...z, title: v }));
            }}
            data-testid="quiz-title-field"
          />
          <div className="editor-sub">
            <SaveStatusPill status={ed.status} onRetry={() => void ed.saveNow()} />
            <span className="muted" data-testid="quiz-totals">
              {questionsLabel(quiz.questions.length)} · {totalPoints(quiz.questions)} درجة · النجاح من {quiz.settings.passPercent}٪
            </span>
          </div>
        </div>
        <div className="editor-actions">
          <Link to={`/results/${quiz.id}`} className="btn" data-testid="open-results">
            <BarChart3 size={18} aria-hidden="true" /> <span>النتائج{attemptCount ? ` (${attemptCount})` : ''}</span>
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => void tryAsStudent()} disabled={!readiness.ready} data-testid="try-quiz">
            <Play size={18} aria-hidden="true" /> <span>تجربة كطالب</span>
          </button>
        </div>
      </header>

      {ed.status.kind === 'conflict' && (
        <div className="banner banner-danger conflict" role="alert" data-testid="conflict-banner">
          <CircleAlert size={18} aria-hidden="true" />
          <span>عُدّل هذا الاختبار في نافذة أخرى بعد فتحه هنا، فتوقف الحفظ التلقائي.</span>
          <span className="conflict-actions">
            <button type="button" className="btn btn-sm" onClick={() => void ed.reload()}>
              تحميل النسخة المحفوظة
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void ed.overwrite()}>
              الاحتفاظ بنسختي
            </button>
          </span>
        </div>
      )}

      {!readiness.ready && quiz.questions.length > 0 && (
        <div className="align-alert is-warn" role="status" data-testid="readiness-alert">
          <CircleAlert size={20} aria-hidden="true" />
          <div>
            <strong>الاختبار غير جاهز للطلاب بعد ({errorCount} {errorCount === 1 ? 'ملاحظة' : 'ملاحظات'}).</strong>
            <p>
              {readiness.quizIssues.join(' ')}{' '}
              {readiness.problems
                .filter((p) => p.issues.some((i) => i.level === 'error'))
                .map((p) => (
                  <button
                    key={p.index}
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setTab('questions');
                      setFocusQ(quiz.questions[p.index].id);
                    }}
                  >
                    السؤال {p.index + 1}
                  </button>
                ))}
            </p>
          </div>
        </div>
      )}

      <div className="tabs editor-tabs" role="tablist" aria-label="أقسام الاختبار">
        <button type="button" role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'is-active' : ''} onClick={() => setTab('questions')} data-testid="tab-questions">
          <ListChecks size={17} aria-hidden="true" /> الأسئلة <span className="tab-count">{quiz.questions.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')} data-testid="tab-settings">
          <Settings2 size={17} aria-hidden="true" /> الإعدادات
        </button>
      </div>

      <div role="tabpanel">
        {tab === 'questions' ? (
          quiz.questions.length === 0 ? (
            <section className="card empty-hero" data-testid="questions-empty">
              <h2>أضف أول سؤال</h2>
              <p className="muted">ستة أنواع: اختيار من متعدد، صح أو خطأ، إجابة قصيرة، مطابقة، ترتيب، إكمال الفراغات.</p>
              <button type="button" className="btn btn-primary" onClick={() => setAdding({ open: true, after: null })} data-testid="add-question">
                <Plus size={18} aria-hidden="true" /> إضافة سؤال
              </button>
            </section>
          ) : (
            <>
              <BloomPanel questions={quiz.questions} objectives={objectives ?? []} />
              <ol className="qlist" data-testid="question-list">
                {quiz.questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    q={q}
                    index={i}
                    count={quiz.questions.length}
                    objectives={objectives ?? []}
                    onPatch={(patch) => setQuestion(q.id, patch)}
                    onMove={(dir) => edit((z) => ({ ...z, questions: moveItem(z.questions, q.id, dir) }))}
                    onDuplicate={() => {
                      edit((z) => duplicateQuestion(z, q.id));
                      toast({ message: 'نُسخ السؤال أسفل الأصل.' });
                    }}
                    onRemove={() => {
                      const r = removeQuestion(quiz, q.id);
                      edit((z) => removeQuestion(z, q.id).quiz);
                      toast({
                        message: `حُذف السؤال ${i + 1}.`,
                        action: {
                          label: 'تراجع',
                          run: () => {
                            if (r.removed) edit((z) => insertQuestionAt(z, r.removed!, r.index));
                          },
                        },
                      });
                    }}
                    onLink={() => setLinking(q.id)}
                  />
                ))}
              </ol>
              <button
                type="button"
                className="add-block-bar"
                onClick={() => setAdding({ open: true, after: null })}
                disabled={quiz.questions.length >= LIMITS.questions}
                data-testid="add-question"
              >
                <Plus size={20} aria-hidden="true" /> إضافة سؤال
              </button>
            </>
          )
        ) : (
          <SettingsPanel quiz={quiz} lessons={lessons ?? []} setSettings={setSettings} edit={edit} onDelete={() => setConfirmDelete(true)} />
        )}
      </div>

      <Dialog open={adding.open} title="نوع السؤال" onClose={() => setAdding({ open: false, after: null })} testId="add-question-dialog">
        <div className="block-types">
          {QUESTION_TYPES.map((t) => {
            const Icon = QTYPE_ICON[t.type];
            return (
              <button key={t.type} type="button" className="block-type" onClick={() => add(t.type)} data-testid={`add-q-${t.type}`}>
                <span className="block-type-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <span className="block-type-name">{t.label}</span>
                <span className="block-type-hint">{t.hint}</span>
              </button>
            );
          })}
        </div>
      </Dialog>

      <Dialog open={!!linkingQ} title="الأهداف التي يقيسها السؤال" onClose={() => setLinking(null)} testId="q-link-dialog">
        {linkingQ &&
          ((objectives ?? []).length === 0 ? (
            <div className="empty">
              <p>{quiz.lessonId ? 'لا توجد أهداف مكتوبة في الدرس المرتبط.' : 'لا توجد أهداف مكتوبة في دروس هذا المشروع.'}</p>
              <p className="muted">اكتب الأهداف في محرر الدرس، ثم ارجع لربطها.</p>
            </div>
          ) : (
            <>
              <ul className="link-list">
                {(objectives ?? []).map((o) => {
                  const on = linkingQ.objectiveIds.includes(o.objective.id);
                  return (
                    <li key={o.objective.id}>
                      <label className={`link-item ${on ? 'is-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setQuestion(linkingQ.id, {
                              objectiveIds: on ? linkingQ.objectiveIds.filter((x) => x !== o.objective.id) : [...linkingQ.objectiveIds, o.objective.id],
                            })
                          }
                          data-testid="q-link-checkbox"
                        />
                        <span className="link-n">{o.number}</span>
                        <span>
                          {o.statement}
                          <span className="link-meta">
                            {!quiz.lessonId && `${o.lessonTitle} · `}
                            {o.level ? bloomInfo(o.level)!.name : 'بلا مستوى'}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="dialog-inline-foot">
                <button type="button" className="btn btn-primary" onClick={() => setLinking(null)} data-testid="q-link-done">
                  تم
                </button>
              </div>
            </>
          ))}
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="حذف الاختبار"
        testId="confirm-delete-quiz"
        confirmLabel="حذف الاختبار ونتائجه"
        onClose={() => setConfirmDelete(false)}
        message={
          <>
            <p>
              سيُحذف «<strong>{quiz.title}</strong>» مع {attemptCount ?? 0} محاولة محفوظة.
            </p>
            <p className="muted">يمكنك التراجع خلال ثوانٍ.</p>
          </>
        }
        onConfirm={async () => {
          try {
            await ed.saveNow();
            const snap = await deleteQuiz(db, quiz.id);
            setConfirmDelete(false);
            navigate('/quizzes');
            toast({
              message: `حُذف الاختبار «${snap.quiz.title}».`,
              action: {
                label: 'تراجع',
                run: async () => {
                  await restoreQuiz(db, snap);
                  navigate(`/quizzes/${snap.quiz.id}`);
                },
              },
            });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </div>
  );
}

function SettingsPanel({
  quiz,
  lessons,
  setSettings,
  edit,
  onDelete,
}: {
  quiz: Quiz;
  lessons: { id: string; title: string }[];
  setSettings: (p: Partial<QuizSettings>) => void;
  edit: (fn: (q: Quiz) => Quiz) => void;
  onDelete: () => void;
}) {
  const uid = useId();
  const s = quiz.settings;
  const int = (v: string, min: number, max: number) => {
    const n = Number(v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
  };
  const total = totalPoints(quiz.questions);
  const passPoints = Math.round(((total * s.passPercent) / 100) * 100) / 100;
  return (
    <div className="settings-grid quiz-settings" data-testid="quiz-settings">
      <section className="card">
        <h2 className="card-title">
          <Target size={18} aria-hidden="true" /> الاختبار
        </h2>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-d`}>
            الوصف والتعليمات للطالب
          </label>
          <AutoTextarea
            id={`${uid}-d`}
            minRows={3}
            value={quiz.description}
            maxLength={LIMITS.description}
            placeholder="مثال: أجب عن جميع الأسئلة. لكل سؤال درجة مكتوبة بجانبه."
            onChange={(e) => {
              const v = e.target.value;
              edit((z) => ({ ...z, description: v }));
            }}
            data-testid="quiz-description"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-l`}>
            الدرس المرتبط
          </label>
          <select id={`${uid}-l`} className="input" value={quiz.lessonId ?? ''} onChange={(e) => edit((z) => ({ ...z, lessonId: e.target.value || null }))} data-testid="quiz-lesson">
            <option value="">كل دروس المشروع</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <span className="field-hint">يحدد الأهداف المتاحة للربط. تغييره لا يحذف الروابط السابقة.</span>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">الدرجات والنجاح</h2>
        <dl className="kv">
          <dt>الدرجة الكلية</dt>
          <dd data-testid="quiz-total-points">{total} (مجموع درجات الأسئلة)</dd>
        </dl>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-p`}>
            درجة النجاح (٪)
          </label>
          <input
            id={`${uid}-p`}
            className="input"
            inputMode="numeric"
            value={String(s.passPercent)}
            onChange={(e) => setSettings({ passPercent: int(e.target.value, 0, 100) })}
            data-testid="quiz-pass"
          />
          <span className="field-hint">يعادل {passPoints} من {total} درجة.</span>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">العرض للطالب</h2>
        <Toggle checked={s.shuffleQuestions} onChange={(v) => setSettings({ shuffleQuestions: v })} label="ترتيب الأسئلة عشوائيًا لكل محاولة" testId="set-shuffle-q" />
        <Toggle checked={s.shuffleOptions} onChange={(v) => setSettings({ shuffleOptions: v })} label="خلط خيارات أسئلة الاختيار من متعدد" testId="set-shuffle-o" />
        <span className="field-hint">عناصر المطابقة والترتيب تُخلط دائمًا.</span>
      </section>

      <section className="card">
        <h2 className="card-title">التصحيح والتغذية الراجعة</h2>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-ft`}>
            متى يرى الطالب صحة إجابته؟
          </label>
          <select id={`${uid}-ft`} className="input" value={s.feedbackTiming} onChange={(e) => setSettings({ feedbackTiming: e.target.value === 'immediate' ? 'immediate' : 'end' })} data-testid="set-feedback-timing">
            <option value="end">{FEEDBACK_TIMING_LABEL.end}</option>
            <option value="immediate">{FEEDBACK_TIMING_LABEL.immediate}</option>
          </select>
          <span className="field-hint">
            {s.feedbackTiming === 'immediate'
              ? 'يضغط الطالب «تحقق من إجابتي» بعد كل سؤال، فتُقفل إجابته ويرى النتيجة وفق الخيارات أدناه. الدرجة النهائية تُحسب عند التسليم.'
              : 'لا يرى الطالب أي تصحيح قبل التسليم.'}
          </span>
        </div>
        <Toggle checked={s.showScore} onChange={(v) => setSettings({ showScore: v })} label="إظهار الدرجة والنتيجة (ناجح / غير ناجح)" testId="set-show-score" />
        <Toggle checked={s.showCorrectAnswers} onChange={(v) => setSettings({ showCorrectAnswers: v })} label="إظهار الإجابات الصحيحة" testId="set-show-correct" />
        <Toggle checked={s.showFeedback} onChange={(v) => setSettings({ showFeedback: v })} label="إظهار التغذية الراجعة لكل سؤال" testId="set-show-feedback" />
      </section>

      <section className="card">
        <h2 className="card-title">المحاولات والوقت</h2>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-a`}>
              عدد المحاولات (0 = غير محدود)
            </label>
            <input
              id={`${uid}-a`}
              className="input"
              inputMode="numeric"
              value={String(s.maxAttempts)}
              onChange={(e) => setSettings({ maxAttempts: int(e.target.value, 0, LIMITS.maxAttempts) })}
              data-testid="quiz-attempts"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-t`}>
              الوقت بالدقائق (0 = بلا وقت)
            </label>
            <input
              id={`${uid}-t`}
              className="input"
              inputMode="numeric"
              value={String(s.timeLimit)}
              onChange={(e) => setSettings({ timeLimit: int(e.target.value, 0, LIMITS.timeLimit) })}
              data-testid="quiz-time"
            />
          </div>
        </div>
        <span className="field-hint">تُحسب المحاولات لكل اسم طالب على هذا الجهاز. عند انتهاء الوقت يُسلَّم الاختبار تلقائيًا.</span>
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-sp`}>
            المحاولة المعتمدة عند تعدد المحاولات
          </label>
          <select
            id={`${uid}-sp`}
            className="input"
            value={s.scorePolicy}
            onChange={(e) => setSettings({ scorePolicy: e.target.value === 'last' || e.target.value === 'first' ? e.target.value : 'best' })}
            data-testid="set-score-policy"
          >
            {(['best', 'last', 'first'] as const).map((k) => (
              <option key={k} value={k}>
                {SCORE_POLICY_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="field-hint">كل محاولة تبقى محفوظة في النتائج؛ هذا الخيار يحدد أي محاولة تُعرض نتيجةً للطالب في صفحته وفي جدول الطلاب.</span>
        </div>
      </section>

      <section className="card span-2 danger-zone">
        <h2 className="card-title">حذف الاختبار</h2>
        <p className="muted">يحذف الاختبار وكل محاولاته المحفوظة على هذا الجهاز.</p>
        <button type="button" className="btn btn-danger-ghost" onClick={onDelete} data-testid="delete-quiz">
          <Trash2 size={16} aria-hidden="true" /> حذف الاختبار
        </button>
      </section>

    </div>
  );
}

/** How the questions spread over Bloom's levels (plan: warn when the quiz sits mostly at "remembering"). */
function BloomPanel({ questions, objectives }: { questions: Question[]; objectives: ObjectiveRef[] }) {
  const levels = new Map(objectives.map((o) => [o.objective.id, o.level]));
  const d = bloomDistribution(questions, (id) => levels.get(id));
  return (
    <section className="bloom-panel" aria-label="توزيع الأسئلة على مستويات بلوم" data-testid="bloom-panel">
      <span className="bloom-panel-h">مستويات بلوم:</span>
      {BLOOM.map((b) => (
        <span key={b.level} className={`bloom-tag b${b.level} ${d.counts[b.level] ? '' : 'is-zero'}`} data-testid="bloom-count" data-level={b.level}>
          {b.name} {d.counts[b.level]}
        </span>
      ))}
      {d.counts[0] > 0 && (
        <span className="bloom-tag b0" data-testid="bloom-unclassified">
          بلا مستوى {d.counts[0]}
        </span>
      )}
      {d.rememberHeavy && (
        <p className="warn-text bloom-warn" role="status" data-testid="bloom-warning">
          أكثر من نصف الأسئلة المصنّفة في مستوى التذكر؛ فكّر في أسئلة تقيس الفهم والتطبيق والتحليل.
        </p>
      )}
    </section>
  );
}
