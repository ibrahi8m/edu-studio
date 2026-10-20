import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Circle, Flag, ListChecks } from 'lucide-react';
import { errorMessage } from '../../app/data';
import { useToast } from '../../app/Toasts';
import { db } from '../../db/db';
import { loadLessonDoc } from '../../db/lessonDocs';
import { completeLesson, LessonNotFinishedError, markCardSeen, toggleActivityStep, visitSection } from '../../db/progress';
import { LessonHero, LessonInteractionContext, LessonObjectives, ViewBlock, type LessonInteraction } from '../../lesson/view/LessonView';
import { normalizeQuiz, quizReadiness, studentKey } from '../../quiz/model';
import type { Quiz } from '../../quiz/types';
import { myQuiz } from '../../student/data';
import { useStudent } from '../../student/identity';
import { QuizRow } from '../../student/QuizRow';
import { lessonSections, summarizeProgress } from '../../student/sections';

/** A lesson, part by part, for the student. Progress is saved after every part opened, card turned and step ticked. */
export function LessonPlayer() {
  const { lessonId } = useParams();
  const [name] = useStudent();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const data = useLiveQuery(async () => {
    if (!lessonId) return null;
    const lesson = await db.lessons.get(lessonId);
    if (!lesson) return null;
    const key = studentKey(name);
    const [doc, project, quizzes, mine, progress] = await Promise.all([
      loadLessonDoc(db, lessonId),
      db.projects.get(lesson.projectId),
      db.quizzes.where('lessonId').equals(lessonId).toArray(),
      key ? db.attempts.filter((a) => a.studentKey === key && !a.preview).toArray() : Promise.resolve([]),
      key ? db.progress.get(`${key}|${lessonId}`) : Promise.resolve(undefined),
    ]);
    const ready = quizzes.map(normalizeQuiz).filter((q): q is Quiz => !!q && quizReadiness(q).ready);
    return { lesson, doc, project: project ?? null, quizzes: ready.map((z) => myQuiz(z, mine)), progress: progress ?? null };
  }, [lessonId, name]);

  const sections = useMemo(() => (data ? lessonSections(data.doc) : []), [data]);
  const requested = params.get('s');
  const currentId = sections.some((s) => s.id === requested) ? requested! : data?.progress?.current && sections.some((s) => s.id === data.progress!.current) ? data.progress.current : 'intro';
  const index = Math.max(0, sections.findIndex((s) => s.id === currentId));
  const section = sections[index];

  // Record the part as opened (and as the place to resume) whenever it is shown.
  const lesson = data?.lesson;
  const lessonKey = lesson?.id;
  const projectKey = lesson?.projectId;
  const sectionKey = section?.id;
  useEffect(() => {
    if (!lessonKey || !projectKey || !sectionKey || !name) return;
    visitSection(db, name, { id: lessonKey, projectId: projectKey }, sectionKey, sections.length).catch((e) => toast({ message: errorMessage(e), tone: 'danger' }));
  }, [lessonKey, projectKey, sectionKey, sections.length, name, toast]);

  const go = useCallback(
    (id: string) => {
      setMissing([]);
      setParams({ s: id }, { replace: false });
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => headingRef.current?.focus());
    },
    [setParams],
  );

  const interaction: LessonInteraction | null = useMemo(() => {
    if (!lesson || !name) return null;
    const p = data?.progress;
    return {
      flipped: (blockId) => p?.cards[blockId] ?? [],
      onFlip: (blockId, cardId) => void markCardSeen(db, name, lesson, blockId, cardId).catch((e) => toast({ message: errorMessage(e), tone: 'danger' })),
      stepsDone: (blockId) => p?.activities[blockId] ?? [],
      onStep: (blockId, step) => void toggleActivityStep(db, name, lesson, blockId, step).catch((e) => toast({ message: errorMessage(e), tone: 'danger' })),
    };
  }, [lesson, name, data?.progress, toast]);

  if (!name) return <Navigate to="/learn" replace />;
  if (data === undefined) return <main className="take-wrap" />;
  if (data === null)
    return (
      <main className="take-wrap">
        <div className="empty">
          <p>هذا الدرس غير موجود على هذا الجهاز.</p>
          <Link to="/learn" className="btn btn-ghost btn-sm">
            العودة إلى دروسي
          </Link>
        </div>
      </main>
    );

  const summary = summarizeProgress(data.doc, data.progress);
  const visited = new Set(data.progress?.visited ?? []);
  const prev = sections[index - 1];
  const next = sections[index + 1];

  const finish = async () => {
    try {
      await completeLesson(db, name, data.lesson, sections.map((s) => s.id));
      setMissing([]);
      toast({ message: 'أحسنت! أكملت الدرس.' });
    } catch (e) {
      if (e instanceof LessonNotFinishedError) setMissing(sections.filter((s) => !visited.has(s.id) && s.id !== section.id).map((s) => s.id));
      else toast({ message: errorMessage(e), tone: 'danger' });
    }
  };

  const toc = (
    <ol className="lp-toc-list">
      {sections.map((s, i) => {
        const seen = visited.has(s.id) || s.id === section.id;
        return (
          <li key={s.id}>
            <button
              type="button"
              className={`lp-toc-btn ${i === index ? 'is-current' : ''} ${seen ? 'is-seen' : ''}`}
              aria-current={i === index ? 'step' : undefined}
              aria-label={`${s.title}${seen ? '، تم فتحه' : '، لم يُفتح بعد'}`}
              onClick={() => go(s.id)}
              data-testid="lp-toc-btn"
              data-seen={seen}
            >
              {seen ? <CheckCircle2 size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
              <span>{s.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <main className="take-wrap lp" data-testid="page-lesson-player">
      <nav className="breadcrumb">
        <Link to="/learn" data-testid="back-to-lessons">
          <ArrowRight size={16} aria-hidden="true" /> دروسي
        </Link>
      </nav>
      <div className="lp-progress" data-testid="lp-progress">
        <div className="lp-progress-row">
          <strong className="lp-lesson-title">{data.lesson.title}</strong>
          <span className="lp-progress-text" data-testid="lp-progress-text">
            {summary.completed ? 'أكملت الدرس' : `فتحت ${summary.visited} من ${summary.sections} أقسام`}
          </span>
        </div>
        <span
          className="progress-track"
          role="progressbar"
          aria-label="تقدمك في الدرس"
          aria-valuemin={0}
          aria-valuemax={summary.sections}
          aria-valuenow={summary.visited}
        >
          <span style={{ inlineSize: `${Math.round(summary.fraction * 100)}%` }} />
        </span>
      </div>

      <div className="lp-layout">
        <nav className="lp-toc" aria-label="أقسام الدرس">
          <p className="lp-toc-h">أقسام الدرس</p>
          {toc}
        </nav>
        <details className="lp-toc-mobile">
          <summary>
            القسم {index + 1} من {sections.length}: {section.title}
          </summary>
          {toc}
        </details>

        <section className="card lp-part" aria-labelledby="lp-part-h" data-testid="lp-part" data-section={section.kind}>
          <div className="lv-container">
            <div className="lv lp-lv">
              {section.kind === 'intro' && (
                <>
                  <h2 id="lp-part-h" className="sr-only" tabIndex={-1} ref={headingRef}>
                    {section.title}
                  </h2>
                  <LessonHero lesson={data.lesson} project={data.project} />
                  <LessonObjectives doc={data.doc} />
                  <p className="muted" data-testid="lp-intro-count">
                    في هذا الدرس {sections.length - 2 > 0 ? `${sections.length - 2} ${sections.length - 2 === 1 ? 'قسم' : 'أقسام'} محتوى` : 'لا يوجد محتوى بعد'}
                    {data.quizzes.length > 0 && ` و${data.quizzes.length === 1 ? 'اختبار واحد' : `${data.quizzes.length} اختبارات`} في الختام`}.
                  </p>
                </>
              )}
              {section.kind === 'content' && (
                <>
                  <h2 id="lp-part-h" className="lv-h2 lp-part-title" tabIndex={-1} ref={headingRef} data-testid="lp-part-title">
                    {section.title}
                  </h2>
                  <LessonInteractionContext.Provider value={interaction}>
                    <div className="lv-blocks">
                      {section.blocks.map((b) => (
                        <ViewBlock key={b.id} block={b} />
                      ))}
                    </div>
                  </LessonInteractionContext.Provider>
                </>
              )}
              {section.kind === 'end' && (
                <>
                  <h2 id="lp-part-h" className="lv-h2 lp-part-title" tabIndex={-1} ref={headingRef} data-testid="lp-part-title">
                    {section.title}
                  </h2>
                  <ul className="lp-end-facts" data-testid="lp-end-facts">
                    <li>
                      الأقسام: فتحت {summary.visited} من {summary.sections}
                    </li>
                    {summary.activitySteps > 0 && (
                      <li data-testid="lp-end-activities">
                        خطوات الأنشطة: أنجزت {summary.activityDone} من {summary.activitySteps}
                      </li>
                    )}
                    {summary.cards > 0 && (
                      <li>
                        البطاقات: قلبت {summary.cardsSeen} من {summary.cards}
                      </li>
                    )}
                  </ul>
                  {data.quizzes.length > 0 ? (
                    <section aria-labelledby="lp-quizzes-h">
                      <h3 id="lp-quizzes-h" className="sub-h">
                        <ListChecks size={16} aria-hidden="true" /> اختبارات الدرس
                      </h3>
                      <ul className="student-list">
                        {data.quizzes.map((q) => (
                          <QuizRow key={q.quiz.id} item={q} from={data.lesson.id} />
                        ))}
                      </ul>
                    </section>
                  ) : (
                    <p className="muted">لا يوجد اختبار مرتبط بهذا الدرس.</p>
                  )}
                  {summary.completed ? (
                    <div className="align-alert is-ok" role="status" data-testid="lesson-done">
                      <CheckCircle2 size={20} aria-hidden="true" />
                      <div>
                        <strong>أكملت هذا الدرس.</strong>
                        <p>يمكنك الرجوع إلى أي قسم للمراجعة.</p>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-primary btn-lg" onClick={() => void finish()} data-testid="finish-lesson">
                      <Flag size={18} aria-hidden="true" /> أنهيت الدرس
                    </button>
                  )}
                  {missing.length > 0 && (
                    <div className="align-alert is-warn" role="alert" data-testid="lesson-missing">
                      <Flag size={20} aria-hidden="true" />
                      <div>
                        <strong>{missing.length === 1 ? 'بقي قسم واحد لم تفتحه:' : `بقيت ${missing.length} أقسام لم تفتحها:`}</strong>
                        <p>
                          {missing.map((id) => (
                            <button key={id} type="button" className="link-btn" onClick={() => go(id)}>
                              {sections.find((s) => s.id === id)?.title}
                            </button>
                          ))}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="take-q-nav lp-nav">
            {prev ? (
              <button type="button" className="btn" onClick={() => go(prev.id)} data-testid="lp-prev">
                <ChevronRight size={18} aria-hidden="true" /> <span className="lp-nav-label">السابق</span>
              </button>
            ) : (
              <span />
            )}
            {next && (
              <button type="button" className="btn btn-primary" onClick={() => go(next.id)} data-testid="lp-next">
                <span className="lp-nav-label">التالي: {next.title}</span> <ChevronLeft size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
