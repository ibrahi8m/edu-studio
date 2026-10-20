import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ListChecks, MonitorPlay, Play, Timer } from 'lucide-react';
import { useAllLessons, useAllProjects } from '../app/data';
import { PageHeader } from '../components/ui';
import { useAllQuizzes } from '../quiz/data';
import { totalPoints } from '../quiz/grading';
import { quizReadiness } from '../quiz/model';
import { questionsLabel } from './Quizzes';

/** Student hub: the lessons and the ready quizzes on this device. */
export function StudentHome() {
  const projects = useAllProjects();
  const lessons = useAllLessons();
  const quizzes = useAllQuizzes();

  const groups = useMemo(() => {
    const ps = (projects ?? []).filter((p) => p.status !== 'archived').sort((a, b) => b.updatedAt - a.updatedAt);
    return ps
      .map((p) => ({
        project: p,
        lessons: (lessons ?? []).filter((l) => l.projectId === p.id).sort((a, b) => a.order - b.order),
        quizzes: (quizzes ?? []).filter((z) => z.projectId === p.id && quizReadiness(z).ready).sort((a, b) => a.title.localeCompare(b.title, 'ar')),
      }))
      .filter((g) => g.lessons.length || g.quizzes.length);
  }, [projects, lessons, quizzes]);

  const drafts = (quizzes ?? []).filter((z) => !quizReadiness(z).ready).length;

  return (
    <div className="page" data-testid="page-student">
      <PageHeader title="وضع الطالب" subtitle="الدروس والاختبارات كما يراها الطالب. تُحفظ المحاولات على هذا الجهاز." />
      {projects !== undefined && groups.length === 0 ? (
        <section className="card empty-hero">
          <span className="coming-icon" aria-hidden="true">
            <MonitorPlay size={30} />
          </span>
          <h2>لا يوجد ما يُعرض للطالب بعد</h2>
          <p className="muted">أنشئ درسًا أو اختبارًا جاهزًا من المشاريع ومنشئ الاختبارات.</p>
        </section>
      ) : (
        groups.map((g) => (
          <section key={g.project.id} className="card student-group" data-testid="student-group">
            <h2 className="card-title">{g.project.title}</h2>
            {g.quizzes.length > 0 && (
              <>
                <h3 className="sub-h">
                  <ListChecks size={16} aria-hidden="true" /> الاختبارات
                </h3>
                <ul className="student-list">
                  {g.quizzes.map((z) => (
                    <li key={z.id} className="student-item" data-testid="student-quiz">
                      <span className="student-item-main">
                        <strong>{z.title}</strong>
                        <span className="muted">
                          {questionsLabel(z.questions.length)} · {totalPoints(z.questions)} درجة
                          {z.settings.timeLimit > 0 && (
                            <>
                              {' · '}
                              <Timer size={13} aria-hidden="true" /> {z.settings.timeLimit} دقيقة
                            </>
                          )}
                        </span>
                      </span>
                      <Link to={`/take/${z.id}`} className="btn btn-primary btn-sm" aria-label={`ابدأ: ${z.title}`}>
                        <Play size={16} aria-hidden="true" /> ابدأ
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {g.lessons.length > 0 && (
              <>
                <h3 className="sub-h">
                  <BookOpen size={16} aria-hidden="true" /> الدروس
                </h3>
                <ul className="student-list">
                  {g.lessons.map((l) => (
                    <li key={l.id} className="student-item">
                      <span className="student-item-main">
                        <strong>{l.title}</strong>
                        {l.summary && <span className="muted">{l.summary}</span>}
                      </span>
                      <Link to={`/preview/${l.id}`} className="btn btn-sm" aria-label={`عرض الدرس: ${l.title}`}>
                        عرض الدرس
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ))
      )}
      {drafts > 0 && <p className="muted">{drafts === 1 ? 'اختبار واحد غير مكتمل لا يظهر للطالب.' : `${drafts} اختبارات غير مكتملة لا تظهر للطالب.`}</p>}
    </div>
  );
}
