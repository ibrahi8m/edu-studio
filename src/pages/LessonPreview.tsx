import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, GraduationCap, Monitor, Smartphone } from 'lucide-react';
import { db } from '../db/db';
import { loadLessonDoc } from '../db/lessonDocs';
import { LessonView } from '../lesson/view/LessonView';
import { useMediaQuery } from '../lesson/editor/AlignmentTab';

/** Full-screen student view of a lesson, outside the app shell. */
export function LessonPreview() {
  const { lessonId } = useParams();
  const data = useLiveQuery(async () => {
    if (!lessonId) return null;
    const lesson = await db.lessons.get(lessonId);
    if (!lesson) return null;
    const [doc, project] = await Promise.all([loadLessonDoc(db, lessonId), db.projects.get(lesson.projectId)]);
    return { lesson, doc, project: project ?? null };
  }, [lessonId]);
  const wide = useMediaQuery('(min-width: 768px)');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  // ?notes=1 opens the preview with the teacher's decision card shown (link from the about page)
  const [params] = useSearchParams();
  const [notes, setNotes] = useState(params.get('notes') === '1');

  if (data === undefined) return <div className="preview-shell" />;
  if (data === null)
    return (
      <div className="preview-shell">
        <div className="page">
          <div className="empty">
            <p>هذا الدرس غير موجود على هذا الجهاز.</p>
            <Link to="/projects" className="btn btn-ghost btn-sm">
              العودة إلى المشاريع
            </Link>
          </div>
        </div>
      </div>
    );

  const frame = wide && device === 'phone';
  return (
    <div className="preview-shell" data-testid="page-preview">
      <header className="preview-bar">
        <Link to={`/projects/${data.lesson.projectId}/lessons/${data.lesson.id}?tab=content`} className="btn btn-ghost btn-sm" aria-label="العودة إلى المحرر" data-testid="back-to-editor">
          <ArrowRight size={16} aria-hidden="true" /> <span>المحرر</span>
        </Link>
        <span className="preview-label">معاينة الطالب</span>
        <span className="preview-tools">
          {wide && (
            <span className="segmented segmented-sm" role="radiogroup" aria-label="حجم الشاشة">
              <button type="button" role="radio" aria-checked={device === 'desktop'} className={device === 'desktop' ? 'is-active' : ''} onClick={() => setDevice('desktop')} data-testid="device-desktop">
                <Monitor size={15} aria-hidden="true" /> كمبيوتر
              </button>
              <button type="button" role="radio" aria-checked={device === 'phone'} className={device === 'phone' ? 'is-active' : ''} onClick={() => setDevice('phone')} data-testid="device-phone">
                <Smartphone size={15} aria-hidden="true" /> جوال
              </button>
            </span>
          )}
          <button type="button" className={`btn btn-sm ${notes ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={notes} aria-label="ملاحظات المعلم" onClick={() => setNotes((n) => !n)} data-testid="toggle-teacher-notes">
            <GraduationCap size={16} aria-hidden="true" /> <span>ملاحظات المعلم</span>
          </button>
        </span>
      </header>
      <main className={`preview-stage ${frame ? 'is-phone' : ''}`}>
        <div className={frame ? 'phone-frame' : 'preview-page'} data-testid="preview-frame">
          <div className="lv-container">
            <LessonView lesson={data.lesson} project={data.project} doc={data.doc} teacherNotes={notes} />
          </div>
        </div>
      </main>
    </div>
  );
}
