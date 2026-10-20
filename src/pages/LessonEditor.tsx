import { DemoBadge } from '../demo/DemoUI';
import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookmarkPlus, ChevronLeft, CircleAlert, Eye, LayoutList, Palette, Target, Waypoints } from 'lucide-react';
import { errorMessage } from '../app/data';
import { useToast } from '../app/Toasts';
import { db } from '../db/db';
import { saveBlocksToLibrary, saveLessonToLibrary } from '../db/library';
import { BLOCK_META } from '../lesson/catalog';
import type { Block } from '../lesson/types';
import { SaveToLibraryDialog } from '../library/SaveToLibraryDialog';
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
  const toast = useToast();
  const [toLibrary, setToLibrary] = useState<{ kind: 'lesson' } | { kind: 'block'; block: Block } | null>(null);
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
            <DemoBadge id={lesson.projectId} />
          </div>
        </div>
        <div className="editor-actions">
          <button type="button" className="btn" onClick={() => setToLibrary({ kind: 'lesson' })} data-testid="lesson-to-library">
            <BookmarkPlus size={18} aria-hidden="true" /> <span>حفظ كقالب</span>
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await ed.saveNow();
              navigate(`/studio?new=1&project=${lesson.projectId}&lesson=${lesson.id}`);
            }}
            data-testid="lesson-new-design"
          >
            <Palette size={18} aria-hidden="true" /> <span>تصميم للدرس</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void openPreview()} data-testid="open-preview">
            <Eye size={18} aria-hidden="true" /> <span>معاينة الطالب</span>
          </button>
        </div>
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
        {tab === 'content' && <BlocksTab state={state} edit={edit} lessonId={lesson.id} onGoToPlan={() => setTab('plan')} onSaveToLibrary={(block) => setToLibrary({ kind: 'block', block })} />}
        {tab === 'alignment' && <AlignmentTab state={state} edit={edit} onGoToPlan={() => setTab('plan')} onGoToContent={() => setTab('content')} />}
      </div>

      <SaveToLibraryDialog
        open={!!toLibrary}
        heading={toLibrary?.kind === 'block' ? 'حفظ العنصر في المكتبة' : 'حفظ الدرس قالبًا في المكتبة'}
        note={
          toLibrary?.kind === 'block'
            ? 'تُحفظ نسخة من هذه الكتلة (ووسائطها) لتضيفها إلى أي درس لاحقًا.'
            : 'يُحفظ تصميم الدرس كاملًا: الأهداف والاستراتيجية والتقويم والمحتوى ووسائطه، لتبدأ منه دروسًا جديدة.'
        }
        initial={
          toLibrary?.kind === 'block'
            ? { title: blockTitle(toLibrary.block), tags: [BLOCK_META[toLibrary.block.type].label] }
            : { title: state.meta.title, description: state.meta.summary, tags: project?.subject ? [project.subject] : [] }
        }
        onClose={() => setToLibrary(null)}
        onSave={async (v) => {
          try {
            await ed.saveNow();
            if (toLibrary?.kind === 'block') await saveBlocksToLibrary(db, lesson.id, [toLibrary.block.id], v);
            else await saveLessonToLibrary(db, lesson.id, v);
            setToLibrary(null);
            toast({ message: `حُفظ «${v.title.trim()}» في المكتبة.`, action: { label: 'فتح المكتبة', run: () => navigate('/library') } });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </div>
  );
}

function blockTitle(b: Block): string {
  const t = 'title' in b && typeof b.title === 'string' && b.title.trim() ? b.title.trim() : b.type === 'heading' || b.type === 'text' ? b.text.trim().slice(0, 60) : '';
  return t || BLOCK_META[b.type].label;
}
