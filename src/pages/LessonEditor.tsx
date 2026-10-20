import { useEffect, useId } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, CircleAlert, Eye, LayoutList, Target, Waypoints } from 'lucide-react';
import { LIMITS } from '../db/catalog';
import { alignment } from '../lesson/model';
import { AlignmentTab } from '../lesson/editor/AlignmentTab';
import { BlocksTab } from '../lesson/editor/BlocksTab';
import { SaveStatusPill } from '../lesson/editor/parts';
import { PlanTab } from '../lesson/editor/PlanTab';
import { useLessonEditor } from '../lesson/useLessonEditor';

type Tab = 'plan' | 'content' | 'alignment';
const TABS: Tab[] = ['plan', 'content', 'alignment'];

export function LessonEditorPage() {
  const { id: projectId, lessonId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const ed = useLessonEditor(lessonId);
  const titleId = useId();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'plan';
  const setTab = (t: Tab) => {
    setParams(t === 'plan' ? {} : { tab: t }, { replace: true });
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (ed.lesson && projectId && ed.lesson.projectId !== projectId) navigate(`/projects/${ed.lesson.projectId}/lessons/${ed.lesson.id}`, { replace: true });
  }, [ed.lesson, projectId, navigate]);

  if (ed.status.kind === 'missing')
    return (
      <div className="page" data-testid="lesson-missing">
        <div className="empty">
          <p>هذا الدرس غير موجود على هذا الجهاز.</p>
          <Link to={projectId ? `/projects/${projectId}` : '/projects'} className="btn btn-ghost btn-sm">
            العودة
          </Link>
        </div>
      </div>
    );
  if (!ed.state || !ed.lesson)
    return (
      <div className="page">
        <p className="muted">جارٍ فتح الدرس…</p>
      </div>
    );

  const { state, edit, project, lesson } = ed;
  const report = alignment(state.doc);
  const titleEmpty = !state.meta.title.trim();

  const openPreview = async () => {
    await ed.saveNow();
    navigate(`/preview/${lesson.id}`);
  };

  return (
    <div className="page page-wide editor" data-testid="page-editor">
      <nav className="breadcrumb crumbs" aria-label="مسار التنقل">
        <Link to="/projects">
          <ArrowRight size={16} aria-hidden="true" /> المشاريع
        </Link>
        <ChevronLeft size={14} aria-hidden="true" className="crumb-sep" />
        {project && <Link to={`/projects/${project.id}`}>{project.title}</Link>}
      </nav>

      <header className="editor-head">
        <div className="editor-title-wrap">
          <label htmlFor={titleId} className="sr-only">
            عنوان الدرس
          </label>
          <input
            id={titleId}
            className={`editor-title ${titleEmpty ? 'is-invalid' : ''}`}
            value={state.meta.title}
            maxLength={LIMITS.title}
            placeholder="عنوان الدرس"
            onChange={(e) => {
              const v = e.target.value;
              edit((s) => ({ ...s, meta: { ...s.meta, title: v } }));
            }}
            data-testid="lesson-title-field"
            aria-invalid={titleEmpty}
          />
          <div className="editor-sub">
            <SaveStatusPill status={ed.status} onRetry={() => void ed.saveNow()} />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void openPreview()} data-testid="open-preview">
          <Eye size={18} aria-hidden="true" /> <span>معاينة الطالب</span>
        </button>
      </header>

      {ed.status.kind === 'conflict' && (
        <div className="banner banner-danger conflict" role="alert" data-testid="conflict-banner">
          <CircleAlert size={18} aria-hidden="true" />
          <span>عُدّل هذا الدرس في نافذة أخرى بعد فتحه هنا، فتوقف الحفظ التلقائي حتى لا تضيع تعديلات إحداهما.</span>
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

      <div className="tabs editor-tabs" role="tablist" aria-label="أقسام المحرر">
        <button type="button" role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'is-active' : ''} onClick={() => setTab('plan')} data-testid="tab-plan">
          <Target size={17} aria-hidden="true" /> <span className="tab-long">الأهداف والتخطيط</span>
          <span className="tab-short">التخطيط</span>
          <span className="tab-count">{state.doc.objectives.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'content'} className={tab === 'content' ? 'is-active' : ''} onClick={() => setTab('content')} data-testid="tab-content">
          <LayoutList size={17} aria-hidden="true" /> المحتوى <span className="tab-count">{state.doc.blocks.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'alignment'} className={tab === 'alignment' ? 'is-active' : ''} onClick={() => setTab('alignment')} data-testid="tab-alignment">
          <Waypoints size={17} aria-hidden="true" /> المواءمة
          {report.uncovered > 0 && (
            <span className="tab-count tab-count-alert" aria-label={`${report.uncovered} غير مغطى`}>
              {report.uncovered}
            </span>
          )}
        </button>
      </div>

      <div role="tabpanel">
        {tab === 'plan' && <PlanTab state={state} edit={edit} />}
        {tab === 'content' && <BlocksTab state={state} edit={edit} lessonId={lesson.id} onGoToPlan={() => setTab('plan')} />}
        {tab === 'alignment' && <AlignmentTab state={state} edit={edit} onGoToPlan={() => setTab('plan')} onGoToContent={() => setTab('content')} />}
      </div>
    </div>
  );
}
