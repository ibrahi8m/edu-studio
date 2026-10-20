import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, FlaskConical, FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
import { useToast } from '../app/Toasts';
import { ConfirmDialog } from '../components/Dialog';
import { Pill } from '../components/ui';
import { db } from '../db/db';
import { errorMessage } from '../app/data';
import { DEMO_LESSONS, DEMO_PROJECT, DEMO_PROJECT_ID, DEMO_QUIZZES, DEMO_STUDENTS, isDemoId } from './content';
import { fetchDemoImage, installDemo, removeDemo, resetDemo } from './install';

/** true / false once known; undefined while loading. */
export function useDemoInstalled(): boolean | undefined {
  return useLiveQuery(async () => !!(await db.projects.get(DEMO_PROJECT_ID)), [], undefined);
}

/** «تجريبي» next to anything that belongs to the demo project. */
export function DemoBadge({ id }: { id: string | null | undefined }) {
  if (!isDemoId(id)) return null;
  return (
    <Pill tone="accent" icon={FlaskConical} testId="demo-badge">
      تجريبي
    </Pill>
  );
}

/** Shown inside the demo project and its lessons: what it is and where to remove it. */
export function DemoBanner({ where }: { where: 'project' | 'lesson' }) {
  return (
    <div className="demo-banner" role="note" data-testid="demo-banner">
      <FlaskConical size={18} aria-hidden="true" />
      <p>
        {where === 'project' ? 'هذا مشروع تجريبي جاهز لتجربة التطبيق.' : 'هذا درس من المشروع التجريبي.'} عدّل فيه بحرية؛ حذفه أو إعادته كما كان من{' '}
        <Link to="/settings#demo">الإعدادات</Link>، ولا يمس ذلك مشاريعك.
      </p>
    </div>
  );
}

function useDemoActions() {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return {
    busy,
    install: () =>
      run(async () => {
        const r = await installDemo(db, fetchDemoImage);
        toast({
          message: r.status === 'installed' ? `أُضيف المشروع التجريبي «${DEMO_PROJECT.title}».` : 'المشروع التجريبي موجود بالفعل على هذا الجهاز.',
          action: { label: 'فتح', run: () => navigate(`/projects/${DEMO_PROJECT_ID}`) },
        });
      }),
    reset: () =>
      run(async () => {
        await resetDemo(db, fetchDemoImage);
        toast({ message: 'أُعيد المشروع التجريبي كما كان أول مرة.' });
      }),
    remove: () =>
      run(async () => {
        await removeDemo(db);
        toast({ message: 'حُذف المحتوى التجريبي. مشاريعك لم تتغير، ويمكنك إضافته مرة أخرى في أي وقت.' });
      }),
  };
}

/** Button to add the demo, for empty states (dashboard, projects). */
export function DemoInstallButton({ className = 'btn' }: { className?: string }) {
  const installed = useDemoInstalled();
  const a = useDemoActions();
  if (installed !== false) return null;
  return (
    <button type="button" className={className} disabled={a.busy} onClick={() => void a.install()} data-testid="demo-install">
      <FlaskConical size={18} aria-hidden="true" /> {a.busy ? 'جارٍ التحميل…' : 'جرّب بمشروع تجريبي'}
    </button>
  );
}

const STUDENTS = DEMO_STUDENTS.length;

/** Settings card: what the demo contains, add / reset / remove it. */
export function DemoPanel() {
  const installed = useDemoInstalled();
  const a = useDemoActions();
  const [confirm, setConfirm] = useState<null | 'reset' | 'remove'>(null);
  return (
    <div className="demo-panel" data-testid="demo-panel" data-installed={installed === undefined ? '' : String(installed)}>
      <p>
        «{DEMO_PROJECT.title}» — {DEMO_PROJECT.subject}، {DEMO_PROJECT.grade}: {DEMO_LESSONS.length} دروس كاملة بأهدافها وأنشطتها ووسائطها، و{DEMO_QUIZZES.length} اختبارات بكل أنواع الأسئلة،
        ونتائج {STUDENTS} طلاب تجريبيين، و3 تصاميم. كل محتواه موسوم «تجريبي» ومنفصل عن مشاريعك.
      </p>
      {installed === undefined ? null : installed ? (
        <>
          <Pill tone="success" testId="demo-state">مثبّت على هذا الجهاز</Pill>
          <div className="demo-actions">
            <Link to={`/projects/${DEMO_PROJECT_ID}`} className="btn" data-testid="demo-open">
              <FolderOpen size={18} aria-hidden="true" /> فتح المشروع
            </Link>
            <Link to="/results" className="btn btn-ghost">
              <BookOpen size={18} aria-hidden="true" /> النتائج
            </Link>
            <button type="button" className="btn btn-ghost" disabled={a.busy} onClick={() => setConfirm('reset')} data-testid="demo-reset">
              <RotateCcw size={18} aria-hidden="true" /> إعادته كما كان
            </button>
            <button type="button" className="btn btn-danger-ghost" disabled={a.busy} onClick={() => setConfirm('remove')} data-testid="demo-remove">
              <Trash2 size={18} aria-hidden="true" /> حذف المحتوى التجريبي
            </button>
          </div>
        </>
      ) : (
        <>
          <Pill tone="neutral" testId="demo-state">غير مثبّت</Pill>
          <div className="demo-actions">
            <button type="button" className="btn btn-primary" disabled={a.busy} onClick={() => void a.install()} data-testid="demo-install">
              <FlaskConical size={18} aria-hidden="true" /> {a.busy ? 'جارٍ التحميل…' : 'إضافة المشروع التجريبي'}
            </button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirm === 'remove'}
        title="حذف المحتوى التجريبي؟"
        message={
          <>
            يُحذف المشروع التجريبي بدروسه واختباراته ونتائج طلابه التجريبيين وتصاميمه، <strong>وأي شيء أضفته أنت داخله</strong>. مشاريعك الأخرى ومكتبتك وإعداداتك لا تتغير.
          </>
        }
        confirmLabel="نعم، احذفه"
        testId="confirm-demo-remove"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void a.remove();
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="إعادة المشروع التجريبي كما كان؟"
        message="تضيع التعديلات التي أجريتها داخل المشروع التجريبي، ويعود بمحتواه ونتائجه الأصلية. مشاريعك لا تتغير."
        confirmLabel="نعم، أعِده"
        testId="confirm-demo-reset"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void a.reset();
        }}
      />
    </div>
  );
}
