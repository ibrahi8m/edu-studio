import { DemoBadge } from '../../demo/DemoUI';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronLeft, ClipboardList, FileText, Gauge, IdCard, Layers, ListChecks, MonitorPlay, Pencil, PlayCircle, Target, UserRound } from 'lucide-react';
import { errorMessage, useAllProjects } from '../../app/data';
import { useToast } from '../../app/Toasts';
import { Dialog } from '../../components/Dialog';
import { Pill } from '../../components/ui';
import { db, type Project } from '../../db/db';
import { GRADES } from '../../db/catalog';
import { audienceLine, detailLines, isPublished, KIND_SPECS, kindOf } from '../../db/contentKinds';
import { getLearner, LEARNER_TYPES, saveLearner } from '../../learner/db';
import { assignmentState } from '../../learner/rules';
import { STATE_TONE } from '../../learner/AssignmentPanel';
import { ASSIGNMENT_STATE_LABEL, CONTENT_FOR, LEARNER_TYPE_LABEL, type AssignmentState, type LearnerProfile, type LearnerType, type Submission } from '../../learner/types';
import type { ActivityBlock } from '../../lesson/types';
import { useKnownStudents, useStudent } from '../../student/identity';
import { useLearnData, type LearnData, type MyLesson, type MyQuiz } from '../../student/data';
import { QuizRow } from '../../student/QuizRow';
import { lessonSections } from '../../student/sections';

/** «بيئة المتعلم» home: who is learning, their profile and progress, then the content assigned to them. */
export function LearnHome() {
  const [name, setName] = useStudent();
  if (!name) return <WhoAreYou onChoose={setName} />;
  return <LearnerHome name={name} onSwitch={() => setName(null)} />;
}

function WhoAreYou({ onChoose }: { onChoose: (n: string) => void }) {
  const [value, setValue] = useState('');
  const [type, setType] = useState<LearnerType | null>(null);
  const [error, setError] = useState('');
  const known = useKnownStudents();
  const toast = useToast();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = value.trim();
    if (!n) {
      setError('اكتب اسمك للمتابعة.');
      return;
    }
    try {
      // A new learner gets a profile; an existing one keeps theirs unless they picked a type now.
      const existing = await getLearner(db, n);
      if (!existing || type) await saveLearner(db, { name: n, type: type ?? existing?.type ?? 'school' });
    } catch (err) {
      toast({ message: `تعذّر حفظ الملف: ${errorMessage(err)}`, tone: 'danger' });
    }
    onChoose(n);
  };
  return (
    <main className="take-wrap" data-testid="page-learn-who">
      <section className="card take-intro">
        <span className="coming-icon" aria-hidden="true">
          <MonitorPlay size={28} />
        </span>
        <h1 className="take-h1">مرحبًا بك في بيئة المتعلم</h1>
        <p className="muted">اكتب اسمك ليُحفظ تقدمك ومحاولاتك وتكاليفك على هذا الجهاز باسمك.</p>
        <form onSubmit={(e) => void submit(e)} className="who-form" noValidate>
          <div className={`field ${error ? 'has-error' : ''}`}>
            <label className="field-label" htmlFor="learn-name">
              اسمك
            </label>
            <input
              id="learn-name"
              className="input input-lg"
              value={value}
              maxLength={80}
              autoComplete="name"
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
              data-testid="learn-name"
            />
            {error && (
              <span className="field-error" role="alert">
                {error}
              </span>
            )}
          </div>
          <fieldset className="field">
            <legend className="field-label">أنا</legend>
            <div className="segmented learner-types" role="radiogroup" aria-label="نوع المتعلم">
              {LEARNER_TYPES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={(type ?? 'school') === t} className={(type ?? 'school') === t ? 'is-active' : ''} onClick={() => setType(t)} data-testid={`learn-type-${t}`}>
                  {LEARNER_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <span className="field-hint">يحدد المحتوى الذي يظهر لك: مدرسي، أو جامعي، أو برامج تدريب المعلمين.</span>
          </fieldset>
          <button type="submit" className="btn btn-primary btn-lg" data-testid="learn-continue">
            متابعة
          </button>
        </form>
        {known && known.length > 0 && (
          <div className="who-known">
            <p className="muted">أو اختر اسمك إن كنت استخدمت هذا الجهاز من قبل:</p>
            <ul className="who-list">
              {known.slice(0, 12).map((k) => (
                <li key={k.key}>
                  <button type="button" className="btn btn-sm" onClick={() => onChoose(k.name)} data-testid="known-student">
                    <UserRound size={15} aria-hidden="true" /> {k.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

const pctLabel = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}٪` : '—');

function LearnerHome({ name, onSwitch }: { name: string; onSwitch: () => void }) {
  const data = useLearnData(name);
  const [editing, setEditing] = useState(false);
  const type: LearnerType = data?.profile?.type ?? 'school';
  return (
    <main className="take-wrap" data-testid="page-learn">
      <div className="learn-hello">
        <h1 className="take-h1">أهلًا {name}</h1>
        <button type="button" className="link-btn" onClick={onSwitch} data-testid="switch-student">
          لست {name}؟ غيّر الاسم
        </button>
      </div>
      {data && <ProfileCard name={name} profile={data.profile} available={data.available} onEdit={() => setEditing(true)} />}
      {data && <ProgressDashboard data={data} />}
      {data && data.groups.length === 0 && (
        <section className="card empty-hero" data-testid="learn-empty">
          <span className="coming-icon" aria-hidden="true">
            <BookOpen size={28} />
          </span>
          <h2>لا يوجد محتوى منشور لك بعد</h2>
          <p className="muted">
            يظهر هنا {KIND_SPECS[CONTENT_FOR[type]].label} المنشور على هذا الجهاز
            {data.profile?.assigned.length ? ' مما اخترته في ملفك' : ''}. غيّر نوع المتعلم من «تعديل ملفي» إن كنت تبحث عن نوع آخر.
          </p>
        </section>
      )}
      {data?.groups.map((g) => (
        <ContentGroup key={g.project.id} group={g} submissions={data.submissions} />
      ))}
      <ProfileDialog open={editing} name={name} profile={data?.profile ?? null} onClose={() => setEditing(false)} />
    </main>
  );
}

function ProfileCard({ name, profile, available, onEdit }: { name: string; profile: LearnerProfile | null; available: Project[]; onEdit: () => void }) {
  const type = profile?.type ?? 'school';
  const rows: [string, string][] = [
    ['النوع', LEARNER_TYPE_LABEL[type]],
    [type === 'school' ? 'رقم الطالب' : type === 'university' ? 'الرقم الجامعي' : 'رمز المتدرب', profile?.learnerId ?? ''],
    ...(type === 'school' ? ([['الصف', profile?.grade ?? '']] as [string, string][]) : []),
    ...(type !== 'school' ? ([[type === 'university' ? 'التخصص' : 'التخصص أو المادة', profile?.specialization ?? '']] as [string, string][]) : []),
    ...(type !== 'school' ? ([[type === 'university' ? 'المستوى الأكاديمي' : 'الخبرة أو المرحلة', profile?.level ?? '']] as [string, string][]) : []),
  ];
  const enrolled = profile?.assigned.length ? available.filter((p) => profile.assigned.includes(p.id)) : [];
  return (
    <section className="card learner-profile" data-testid="learner-profile">
      <div className="lessons-head">
        <h2 className="card-title">
          <IdCard size={18} aria-hidden="true" /> ملفي
        </h2>
        <button type="button" className="btn btn-sm" onClick={onEdit} data-testid="learner-profile-edit">
          <Pencil size={16} aria-hidden="true" /> تعديل ملفي
        </button>
      </div>
      <dl className="kv learner-kv">
        <div className="kv-row">
          <dt>الاسم</dt>
          <dd>{name}</dd>
        </div>
        {rows.map(([k, v]) => (
          <div key={k} className="kv-row">
            <dt>{k}</dt>
            <dd data-testid={k === 'النوع' ? 'learner-type' : undefined}>{v || <span className="muted">غير محدد</span>}</dd>
          </div>
        ))}
        <div className="kv-row">
          <dt>{type === 'trainee' ? 'البرامج المسندة' : 'المقررات المسندة'}</dt>
          <dd>{enrolled.length ? enrolled.map((p) => p.title).join('، ') : 'كل المحتوى المنشور لهذا النوع'}</dd>
        </div>
      </dl>
    </section>
  );
}

function ProfileDialog({ open, name, profile, onClose }: { open: boolean; name: string; profile: LearnerProfile | null; onClose: () => void }) {
  const toast = useToast();
  const projects = useAllProjects();
  const uid = useId();
  const [v, setV] = useState<Pick<LearnerProfile, 'type' | 'learnerId' | 'grade' | 'specialization' | 'level' | 'assigned'>>({ type: 'school', learnerId: '', grade: '', specialization: '', level: '', assigned: [] });
  useEffect(() => {
    if (open) setV({ type: profile?.type ?? 'school', learnerId: profile?.learnerId ?? '', grade: profile?.grade ?? '', specialization: profile?.specialization ?? '', level: profile?.level ?? '', assigned: profile?.assigned ?? [] });
  }, [open, profile]);
  const options = (projects ?? []).filter((p) => p.status !== 'archived' && isPublished(p) && kindOf(p) === CONTENT_FOR[v.type]);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <Dialog
      open={open}
      title="ملفي في بيئة المتعلم"
      onClose={onClose}
      testId="learner-profile-dialog"
      onSubmit={async () => {
        try {
          // Courses of another kind are dropped when the type changes.
          const ok = new Set(options.map((p) => p.id));
          await saveLearner(db, { name, ...v, assigned: v.assigned.filter((id) => ok.has(id)) });
          onClose();
          toast({ message: 'حُفظ ملفك على هذا الجهاز.' });
        } catch (e) {
          toast({ message: errorMessage(e), tone: 'danger' });
        }
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" data-testid="learner-profile-save">
            حفظ
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <span className="field-label">نوع المتعلم</span>
          <div className="segmented learner-types" role="radiogroup" aria-label="نوع المتعلم">
            {LEARNER_TYPES.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={v.type === t} className={v.type === t ? 'is-active' : ''} onClick={() => set('type', t)} data-testid={`profile-type-${t}`}>
                {LEARNER_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-id`}>
              {v.type === 'school' ? 'رقم الطالب' : v.type === 'university' ? 'الرقم الجامعي' : 'رمز المتدرب'} (اختياري)
            </label>
            <input id={`${uid}-id`} className="input" dir="auto" value={v.learnerId} maxLength={60} onChange={(e) => set('learnerId', e.target.value)} data-testid="profile-learner-id" />
          </div>
          {v.type === 'school' ? (
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-g`}>
                الصف
              </label>
              <select id={`${uid}-g`} className="input" value={v.grade} onChange={(e) => set('grade', e.target.value)} data-testid="profile-grade">
                <option value="">غير محدد</option>
                {GRADES.filter((g) => g !== 'التعليم الجامعي' && g !== 'تدريب المعلمين').map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-sp`}>
                {v.type === 'university' ? 'التخصص' : 'التخصص أو المادة التي تدرّسها'}
              </label>
              <input id={`${uid}-sp`} className="input" value={v.specialization} maxLength={160} onChange={(e) => set('specialization', e.target.value)} data-testid="profile-specialization" />
            </div>
          )}
        </div>
        {v.type !== 'school' && (
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-lv`}>
              {v.type === 'university' ? 'المستوى الأكاديمي' : 'سنوات الخبرة أو المرحلة التي تدرّسها'}
            </label>
            <input id={`${uid}-lv`} className="input" value={v.level} maxLength={120} onChange={(e) => set('level', e.target.value)} data-testid="profile-level" />
          </div>
        )}
        <fieldset className="field">
          <legend className="field-label">{v.type === 'trainee' ? 'البرامج المسندة إليّ' : 'المقررات المسندة إليّ'}</legend>
          {options.length ? (
            <ul className="check-list">
              {options.map((p) => (
                <li key={p.id}>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={v.assigned.includes(p.id)}
                      onChange={(e) => set('assigned', e.target.checked ? [...v.assigned, p.id] : v.assigned.filter((x) => x !== p.id))}
                      data-testid="profile-assign"
                    />
                    <span>{p.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">لا يوجد محتوى منشور من هذا النوع على الجهاز.</p>
          )}
          <span className="field-hint">إن لم تختر شيئًا يظهر لك كل المحتوى المنشور من هذا النوع.</span>
        </fieldset>
      </div>
    </Dialog>
  );
}

/* ───────── progress (from saved data only) ───────── */

interface AssignmentRow {
  lessonId: string;
  lessonTitle: string;
  block: ActivityBlock;
  state: AssignmentState;
  sub: Submission | null;
}

function assignmentsOf(lessons: MyLesson[], subs: Submission[]): AssignmentRow[] {
  const byId = new Map(subs.map((s) => [`${s.lessonId}|${s.blockId}`, s]));
  return lessons.flatMap((l) =>
    l.doc.blocks
      .filter((b): b is ActivityBlock => b.type === 'activity' && b.submit)
      .map((b) => {
        const sub = byId.get(`${l.lesson.id}|${b.id}`) ?? null;
        return { lessonId: l.lesson.id, lessonTitle: l.lesson.title, block: b, sub, state: assignmentState(sub, (l.progress?.activities[b.id] ?? []).length) };
      }),
  );
}

function ProgressDashboard({ data }: { data: LearnData }) {
  const lessons = data.groups.flatMap((g) => g.lessons);
  const quizzes: MyQuiz[] = data.groups.flatMap((g) => [...g.lessons.flatMap((l) => l.quizzes), ...g.quizzes]);
  const completed = lessons.filter((l) => l.summary.completed).length;
  const steps = lessons.reduce((s, l) => s + l.summary.activitySteps, 0);
  const stepsDone = lessons.reduce((s, l) => s + l.summary.activityDone, 0);
  const taken = quizzes.filter((q) => q.done.length > 0);
  const attempts = quizzes.reduce((s, q) => s + q.done.length, 0);
  const last = lessons.filter((l) => l.progress && l.progress.visited.length).sort((a, b) => b.progress!.updatedAt - a.progress!.updatedAt)[0];
  const lastPart = last?.progress?.current ? lessonSections(last.doc).find((s) => s.id === last.progress!.current)?.title : undefined;
  const assignments = assignmentsOf(lessons, data.submissions);
  const counts = assignments.reduce<Record<AssignmentState, number>>((m, a) => ({ ...m, [a.state]: m[a.state] + 1 }), { not_started: 0, in_progress: 0, draft: 0, submitted: 0, graded: 0 });

  if (!lessons.length && !quizzes.length) return null;
  return (
    <section className="card learner-dash" aria-labelledby="dash-h" data-testid="learner-dashboard">
      <h2 className="card-title" id="dash-h">
        <Gauge size={18} aria-hidden="true" /> تقدمي
      </h2>
      <p className="muted">من بياناتك المحفوظة على هذا الجهاز فقط.</p>
      <div className="stat-row learner-stats">
        <div className="stat">
          <span className="stat-n" data-testid="dash-completion">
            {pctLabel(completed, lessons.length)}
          </span>
          <span className="stat-l">نسبة الإنجاز</span>
        </div>
        <div className="stat">
          <span className="stat-n" data-testid="dash-completed">
            {completed}
          </span>
          <span className="stat-l">دروس مكتملة</span>
        </div>
        <div className="stat">
          <span className="stat-n" data-testid="dash-remaining">
            {lessons.length - completed}
          </span>
          <span className="stat-l">دروس متبقية</span>
        </div>
        <div className="stat">
          <span className="stat-n" data-testid="dash-quizzes">
            {taken.length}/{quizzes.length}
          </span>
          <span className="stat-l">اختبارات أُجريت</span>
        </div>
      </div>
      <span className="progress-track" role="progressbar" aria-label="نسبة الدروس المكتملة" aria-valuemin={0} aria-valuemax={lessons.length} aria-valuenow={completed}>
        <span style={{ inlineSize: lessons.length ? `${Math.round((completed / lessons.length) * 100)}%` : '0%' }} />
      </span>
      {last ? (
        <div className="resume-row" data-testid="dash-resume">
          <span>
            آخر درس: <strong>{last.lesson.title}</strong>
            {lastPart && !last.summary.completed && <span className="muted"> — توقفت عند «{lastPart}»</span>}
          </span>
          <Link to={`/learn/lesson/${last.lesson.id}`} className="btn btn-primary btn-sm" data-testid="dash-resume-link">
            <PlayCircle size={16} aria-hidden="true" /> {last.summary.completed ? 'مراجعة' : 'تابع من حيث توقفت'}
          </Link>
        </div>
      ) : (
        <p className="muted">لم تبدأ أي درس بعد.</p>
      )}
      <ul className="dash-facts">
        <li data-testid="dash-activities">
          خطوات الأنشطة: {steps ? `${stepsDone} من ${steps}` : 'لا توجد أنشطة بخطوات'}
        </li>
        <li data-testid="dash-attempts">محاولات الاختبارات المسلّمة: {attempts}</li>
        {assignments.length > 0 && (
          <li data-testid="dash-assignments">
            التكاليف ({assignments.length}):{' '}
            {(Object.keys(counts) as AssignmentState[])
              .filter((k) => counts[k])
              .map((k) => `${ASSIGNMENT_STATE_LABEL[k]} ${counts[k]}`)
              .join('، ')}
          </li>
        )}
      </ul>
      {taken.length > 0 && (
        <>
          <h3 className="sub-h">
            <ListChecks size={16} aria-hidden="true" /> نتائجي
          </h3>
          <ul className="dash-results" data-testid="dash-results">
            {taken.map((q) => {
              const r = q.counted?.result;
              return (
                <li key={q.quiz.id}>
                  <span>{q.quiz.title}</span>
                  {r && q.quiz.settings.showScore ? (
                    <Pill tone={r.passed ? 'success' : 'warning'}>
                      {r.percent}٪ {r.pendingReview ? '(مبدئية)' : r.passed ? '· ناجح' : '· لم ينجح'}
                    </Pill>
                  ) : (
                    <Pill>سُلّم</Pill>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {assignments.some((a) => a.state === 'graded') && (
        <>
          <h3 className="sub-h">
            <ClipboardList size={16} aria-hidden="true" /> تقييم التكاليف
          </h3>
          <ul className="dash-results">
            {assignments
              .filter((a) => a.state === 'graded')
              .map((a) => (
                <li key={`${a.lessonId}|${a.block.id}`}>
                  <span>
                    {a.block.title || 'تكليف'} <span className="muted">— {a.lessonTitle}</span>
                  </span>
                  <Pill tone="success">{a.sub?.score !== null && a.sub?.score !== undefined ? `${a.sub.score}/100` : 'قُيّم'}</Pill>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ───────── assigned content ───────── */

function ContentGroup({ group: g, submissions }: { group: LearnData['groups'][number]; submissions: Submission[] }) {
  const spec = KIND_SPECS[kindOf(g.project)];
  const objectives = detailLines(g.project, 'objectives');
  const extra = spec.fields.filter((f) => f.multiline && f.key !== 'objectives' && g.project.details?.[f.key]);
  const units = useMemo(() => {
    const m = new Map<string, MyLesson[]>();
    for (const l of g.lessons) {
      const u = l.lesson.unit ?? '';
      if (!m.has(u)) m.set(u, []);
      m.get(u)!.push(l);
    }
    return [...m.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1));
  }, [g.lessons]);
  return (
    <section className="card student-group" data-testid="learn-project" aria-labelledby={`p-${g.project.id}`}>
      <h2 className="card-title" id={`p-${g.project.id}`}>
        {g.project.title}
        <DemoBadge id={g.project.id} />
      </h2>
      <p className="muted learn-subject">
        {spec.short}
        {audienceLine(g.project) && ` · ${audienceLine(g.project)}`}
      </p>
      {(g.project.description || objectives.length > 0 || extra.length > 0) && (
        <details className="learn-about" data-testid="learn-about">
          <summary>
            <Target size={16} aria-hidden="true" /> الأهداف وتعليمات الدراسة
          </summary>
          {g.project.description && <p className="pre">{g.project.description}</p>}
          {objectives.length > 0 && (
            <>
              <strong>{spec.fields.find((f) => f.key === 'objectives')?.label}</strong>
              <ul>
                {objectives.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </>
          )}
          {extra.map((f) => (
            <div key={f.key}>
              <strong>{f.label}</strong>
              <ul>
                {detailLines(g.project, f.key).map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="muted">ادرس الأقسام بالترتيب، وأنجز الأنشطة، ثم حلّ اختبار الدرس في نهايته. يُحفظ تقدمك تلقائيًا.</p>
        </details>
      )}
      {units.map(([unit, list]) => (
        <div key={unit || '-'} className="learn-unit">
          {unit && (
            <h3 className="sub-h unit-title" data-testid="learn-unit">
              <Layers size={16} aria-hidden="true" /> {unit}
            </h3>
          )}
          <ul className="learn-lessons">
            {list.map((l) => (
              <LessonCard key={l.lesson.id} item={l} submissions={submissions} />
            ))}
          </ul>
        </div>
      ))}
      {g.quizzes.length > 0 && (
        <>
          <h3 className="sub-h">
            <ListChecks size={16} aria-hidden="true" /> اختبارات عامة
          </h3>
          <ul className="student-list">
            {g.quizzes.map((q) => (
              <QuizRow key={q.quiz.id} item={q} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function LessonCard({ item, submissions }: { item: MyLesson; submissions: Submission[] }) {
  const { lesson, summary: s, progress } = item;
  const started = !!progress && s.visited > 0;
  const label = s.completed ? 'مراجعة الدرس' : started ? 'تابع الدرس' : 'ابدأ الدرس';
  const files = item.doc.blocks.filter((b) => b.type === 'file' && b.assetId).length;
  const assignments = assignmentsOf([item], submissions);
  return (
    <li className="learn-lesson" data-testid="learn-lesson" data-lesson={lesson.title}>
      <div className="learn-lesson-head">
        <span className="student-item-main">
          <strong>{lesson.title}</strong>
          {lesson.summary && <span className="muted">{lesson.summary}</span>}
        </span>
        <Link to={`/learn/lesson/${lesson.id}`} className={`btn btn-sm ${s.completed ? '' : 'btn-primary'}`} aria-label={`${label}: ${lesson.title}`} data-testid="open-lesson">
          {label} <ChevronLeft size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="learn-progress" data-testid="lesson-progress">
        <span className="progress-track" aria-hidden="true">
          <span style={{ inlineSize: `${Math.round(s.fraction * 100)}%` }} />
        </span>
        <span className="learn-progress-text" data-testid="lesson-progress-text">
          {s.completed ? (
            <>
              <CheckCircle2 size={14} aria-hidden="true" /> أكملت الدرس
            </>
          ) : started ? (
            `فتحت ${s.visited} من ${s.sections} أقسام`
          ) : (
            'لم تبدأ بعد'
          )}
          {s.activitySteps > 0 && ` · الأنشطة ${s.activityDone}/${s.activitySteps}`}
        </span>
      </div>
      {(files > 0 || assignments.length > 0) && (
        <div className="learn-lesson-extra">
          {files > 0 && (
            <span className="lv-chip">
              <FileText size={14} aria-hidden="true" /> {files === 1 ? 'ملف مرفق' : `${files} ملفات مرفقة`}
            </span>
          )}
          {assignments.map((a) => (
            <span key={a.block.id} className="assign-chip" data-testid="lesson-assignment">
              <ClipboardList size={14} aria-hidden="true" /> {a.block.title || 'تكليف'}: <Pill tone={STATE_TONE[a.state]}>{ASSIGNMENT_STATE_LABEL[a.state]}</Pill>
            </span>
          ))}
        </div>
      )}
      {item.quizzes.length > 0 && (
        <ul className="student-list">
          {item.quizzes.map((q) => (
            <QuizRow key={q.quiz.id} item={q} from={lesson.id} />
          ))}
        </ul>
      )}
    </li>
  );
}
