import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronLeft, ListChecks, MonitorPlay, UserRound } from 'lucide-react';
import { useKnownStudents, useStudent } from '../../student/identity';
import { useLearnData, type MyLesson } from '../../student/data';
import { QuizRow } from '../../student/QuizRow';

/** Student mode home: who is learning, then their lessons (with progress) and quizzes (with their own results). */
export function LearnHome() {
  const [name, setName] = useStudent();
  if (!name) return <WhoAreYou onChoose={setName} />;
  return <MyLessons name={name} onSwitch={() => setName(null)} />;
}

function WhoAreYou({ onChoose }: { onChoose: (n: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const known = useKnownStudents();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      setError('اكتب اسمك للمتابعة.');
      return;
    }
    onChoose(value.trim());
  };
  return (
    <main className="take-wrap" data-testid="page-learn-who">
      <section className="card take-intro">
        <span className="coming-icon" aria-hidden="true">
          <MonitorPlay size={28} />
        </span>
        <h1 className="take-h1">مرحبًا بك</h1>
        <p className="muted">اكتب اسمك ليُحفظ تقدمك في الدروس ومحاولاتك في الاختبارات على هذا الجهاز باسمك.</p>
        <form onSubmit={submit} className="who-form" noValidate>
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

function MyLessons({ name, onSwitch }: { name: string; onSwitch: () => void }) {
  const data = useLearnData(name);
  return (
    <main className="take-wrap" data-testid="page-learn">
      <div className="learn-hello">
        <h1 className="take-h1">أهلًا {name}</h1>
        <button type="button" className="link-btn" onClick={onSwitch} data-testid="switch-student">
          لست {name}؟ غيّر الاسم
        </button>
      </div>
      {data && data.groups.length === 0 && (
        <section className="card empty-hero" data-testid="learn-empty">
          <span className="coming-icon" aria-hidden="true">
            <BookOpen size={28} />
          </span>
          <h2>لا توجد دروس أو اختبارات بعد</h2>
          <p className="muted">ستظهر هنا عندما يضيفها المعلم على هذا الجهاز.</p>
        </section>
      )}
      {data?.groups.map((g) => (
        <section key={g.project.id} className="card student-group" data-testid="learn-project" aria-labelledby={`p-${g.project.id}`}>
          <h2 className="card-title" id={`p-${g.project.id}`}>
            {g.project.title}
            {g.project.subject && <span className="muted learn-subject"> · {g.project.subject}</span>}
          </h2>
          {g.lessons.length > 0 && (
            <ul className="learn-lessons">
              {g.lessons.map((l) => (
                <LessonCard key={l.lesson.id} item={l} />
              ))}
            </ul>
          )}
          {g.quizzes.length > 0 && (
            <>
              <h3 className="sub-h">
                <ListChecks size={16} aria-hidden="true" /> اختبارات المشروع
              </h3>
              <ul className="student-list">
                {g.quizzes.map((q) => (
                  <QuizRow key={q.quiz.id} item={q} />
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </main>
  );
}

function LessonCard({ item }: { item: MyLesson }) {
  const { lesson, summary: s, progress } = item;
  const started = !!progress && s.visited > 0;
  const label = s.completed ? 'مراجعة الدرس' : started ? 'تابع الدرس' : 'ابدأ الدرس';
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
