import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowRight, ArrowUp, BookmarkPlus, BookPlus, ChevronLeft, CircleAlert, Copy, Download, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { errorMessage } from '../app/data';
import { useToast } from '../app/Toasts';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Segmented } from '../components/ui';
import { db } from '../db/db';
import { addPictureToLesson, deleteDesign, duplicateDesign, restoreDesign } from '../db/designs';
import { saveDesignToLibrary } from '../db/library';
import { SaveToLibraryDialog } from '../library/SaveToLibraryDialog';
import { AutoTextarea, SaveStatusPill } from '../lesson/editor/parts';
import { designFontsReady, downloadBlob, fileName, svgToPng } from '../studio/exportPng';
import { MapEditor } from '../studio/MapEditor';
import { designIssues, KIND_LABEL, LIMITS, newCard, newPoint, STYLE_LABEL, THEME_KEYS, THEMES } from '../studio/model';
import { CardsSvg, DesignSvg, MapPicture, SummarySvg } from '../studio/render';
import type { CardItem, CardsDesign, ConceptMapData, Design, SummaryDesign, SummaryItem, SummaryStyle } from '../studio/types';
import { useDesignEditor } from '../studio/useDesignEditor';
import { KIND_ICON } from './Studio';

const move = <T extends { id: string }>(arr: T[], id: string, dir: -1 | 1): T[] => {
  const i = arr.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return arr;
  const out = arr.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

export function DesignEditorPage() {
  const { designId } = useParams();
  const ed = useDesignEditor(designId);
  const navigate = useNavigate();
  const toast = useToast();
  const titleId = useId();
  const [fontsTick, setFontsTick] = useState(0);
  const [mapView, setMapView] = useState<'edit' | 'picture'>('edit');
  const [busy, setBusy] = useState<'' | 'png' | 'lesson'>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lessonDialog, setLessonDialog] = useState(false);
  const [toLibrary, setToLibrary] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const design = ed.design;
  const lesson = useLiveQuery(async () => (design?.lessonId ? ((await db.lessons.get(design.lessonId)) ?? null) : null), [design?.lessonId]);
  const lessons = useLiveQuery(async () => (design ? (await db.lessons.where('projectId').equals(design.projectId).toArray()).sort((a, b) => a.order - b.order) : []), [design?.projectId]);

  // Text is wrapped by measuring the real fonts: redraw once they are loaded.
  useEffect(() => {
    let live = true;
    void designFontsReady().then(() => live && setFontsTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, []);

  if (ed.status.kind === 'missing')
    return (
      <div className="page" data-testid="design-missing">
        <div className="empty">
          <p>هذا التصميم غير موجود على هذا الجهاز.</p>
          <Link to="/studio" className="btn btn-ghost btn-sm">
            العودة إلى الاستوديو
          </Link>
        </div>
      </div>
    );
  if (!design)
    return (
      <div className="page">
        <p className="muted">جارٍ فتح التصميم…</p>
      </div>
    );

  const edit = ed.edit;
  const issues = designIssues(design);
  const Icon = KIND_ICON[design.kind];

  const picture = async () => {
    const svg = exportRef.current?.querySelector('svg');
    if (!svg) throw new Error('لا توجد صورة للتصدير.');
    await designFontsReady();
    return svgToPng(svg);
  };

  const exportPng = async () => {
    setBusy('png');
    try {
      await ed.saveNow();
      const png = await picture();
      const name = fileName(design.title);
      downloadBlob(png.blob, name);
      toast({ message: `صُدّرت الصورة «${name}» (${png.width}×${png.height}).` });
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page page-wide editor studio-editor" data-testid="page-design-editor" data-kind={design.kind} data-fonts={fontsTick}>
      <nav className="breadcrumb crumbs" aria-label="مسار التنقل">
        <Link to="/studio">
          <ArrowRight size={16} aria-hidden="true" /> الاستوديو
        </Link>
        <ChevronLeft size={14} aria-hidden="true" className="crumb-sep" />
        {ed.project && <Link to={`/projects/${ed.project.id}`}>{ed.project.title}</Link>}
        {lesson && (
          <>
            <ChevronLeft size={14} aria-hidden="true" className="crumb-sep" />
            <Link to={`/projects/${lesson.projectId}/lessons/${lesson.id}`}>{lesson.title}</Link>
          </>
        )}
      </nav>

      <header className="editor-head">
        <div className="editor-title-wrap">
          <span className="design-kind-tag">
            <Icon size={15} aria-hidden="true" /> {KIND_LABEL[design.kind]}
          </span>
          <label htmlFor={titleId} className="sr-only">
            عنوان التصميم
          </label>
          <input
            id={titleId}
            className={`editor-title ${!design.title.trim() ? 'is-invalid' : ''}`}
            value={design.title}
            maxLength={LIMITS.title}
            placeholder="عنوان التصميم"
            onChange={(e) => {
              const v = e.target.value;
              edit((d) => ({ ...d, title: v }));
            }}
            data-testid="design-title-field"
          />
          <div className="editor-sub">
            <SaveStatusPill status={ed.status} onRetry={() => void ed.saveNow()} />
          </div>
        </div>
        <div className="editor-actions">
          <button type="button" className="btn" onClick={() => setLessonDialog(true)} disabled={!!busy} data-testid="add-to-lesson">
            <BookPlus size={18} aria-hidden="true" /> <span>إضافة إلى درس</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void exportPng()} disabled={!!busy} data-testid="export-png">
            <Download size={18} aria-hidden="true" /> <span>{busy === 'png' ? 'جارٍ التصدير…' : 'تصدير PNG'}</span>
          </button>
        </div>
      </header>

      {ed.status.kind === 'conflict' && (
        <div className="banner banner-danger conflict" role="alert" data-testid="conflict-banner">
          <CircleAlert size={18} aria-hidden="true" />
          <span>عُدّل هذا التصميم في نافذة أخرى بعد فتحه هنا، فتوقف الحفظ التلقائي.</span>
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

      {issues.length > 0 && (
        <div className="align-alert is-warn" role="status" data-testid="design-issues">
          <CircleAlert size={20} aria-hidden="true" />
          <div>
            <strong>ملاحظات قبل العرض</strong>
            <p>{issues.join(' ')}</p>
          </div>
        </div>
      )}

      <section className="studio-options card" aria-label="المظهر">
        <ThemePicker value={design.theme} onChange={(theme) => edit((d) => ({ ...d, theme }))} />
        {design.kind === 'conceptmap' && (
          <Segmented
            label="العرض"
            value={mapView}
            onChange={setMapView}
            options={[
              { value: 'edit', label: 'تحرير', icon: Pencil },
              { value: 'picture', label: 'الصورة النهائية', icon: Eye },
            ]}
          />
        )}
      </section>

      {design.kind === 'conceptmap' ? (
        mapView === 'edit' ? (
          <MapEditor data={design.data} theme={THEMES[design.theme]} onChange={(fn: (m: ConceptMapData) => ConceptMapData) => edit((d) => (d.kind === 'conceptmap' ? { ...d, data: fn(d.data) } : d))} />
        ) : (
          <div className="design-preview" data-testid="design-preview">
            <MapPicture data={design.data} title={design.title} theme={THEMES[design.theme]} />
          </div>
        )
      ) : (
        <div className="studio-split">
          <div className="studio-form">{design.kind === 'cards' ? <CardsForm d={design} edit={edit} /> : <SummaryForm d={design} edit={edit} />}</div>
          <div className="studio-preview-col">
            <h2 className="sub-h">المعاينة (هكذا تُصدَّر الصورة)</h2>
            <div className="design-preview" data-testid="design-preview">
              {design.kind === 'cards' ? <CardsSvg d={design} /> : <SummarySvg d={design} />}
            </div>
          </div>
        </div>
      )}

      {/* The exact picture that is exported (for concept maps: cropped to the content, with the title). */}
      <div className="export-stage" aria-hidden="true" ref={exportRef}>
        <DesignSvg design={design} />
      </div>

      <section className="card danger-zone studio-more">
        <h2 className="card-title">إدارة التصميم</h2>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              try {
                await ed.saveNow();
                const copy = await duplicateDesign(db, design.id);
                toast({ message: `أُنشئت نسخة «${copy.title}».` });
                navigate(`/studio/${copy.id}`);
              } catch (e) {
                toast({ message: errorMessage(e), tone: 'danger' });
              }
            }}
            data-testid="duplicate-design"
          >
            <Copy size={16} aria-hidden="true" /> نسخة من التصميم
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setToLibrary(true)} data-testid="design-to-library">
            <BookmarkPlus size={16} aria-hidden="true" /> حفظ كقالب في المكتبة
          </button>
          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setConfirmDelete(true)} data-testid="delete-design">
            <Trash2 size={16} aria-hidden="true" /> حذف التصميم
          </button>
        </div>
      </section>

      <SaveToLibraryDialog
        open={toLibrary}
        heading="حفظ التصميم قالبًا في المكتبة"
        note="تُحفظ نسخة من التصميم بحالته الآن، لتبدأ منها تصاميم جديدة في أي مشروع."
        initial={{ title: design.title, tags: [KIND_LABEL[design.kind]] }}
        onClose={() => setToLibrary(false)}
        onSave={async (v) => {
          try {
            await ed.saveNow();
            await saveDesignToLibrary(db, design.id, v);
            setToLibrary(false);
            toast({ message: `حُفظ «${v.title.trim()}» في المكتبة.` });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />

      <AddToLessonDialog
        open={lessonDialog}
        design={design}
        lessons={lessons ?? []}
        onClose={() => setLessonDialog(false)}
        onAdd={async (lessonId, alt) => {
          setBusy('lesson');
          try {
            await ed.saveNow();
            if (lessonId !== design.lessonId) edit((d) => ({ ...d, lessonId }));
            const png = await picture();
            await addPictureToLesson(db, lessonId, { data: await png.blob.arrayBuffer(), width: png.width, height: png.height, name: fileName(design.title), alt, caption: design.title });
            setLessonDialog(false);
            const l = (lessons ?? []).find((x) => x.id === lessonId);
            toast({
              message: `أُضيفت صورة التصميم إلى نهاية درس «${l?.title ?? ''}».`,
              action: l ? { label: 'فتح الدرس', run: () => navigate(`/projects/${l.projectId}/lessons/${l.id}?tab=content`) } : undefined,
            });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          } finally {
            setBusy('');
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="حذف التصميم"
        testId="confirm-delete-design"
        confirmLabel="حذف التصميم"
        onClose={() => setConfirmDelete(false)}
        message={
          <>
            <p>
              سيُحذف «<strong>{design.title}</strong>». الصور التي أُضيفت منه إلى الدروس تبقى فيها.
            </p>
            <p className="muted">يمكنك التراجع خلال ثوانٍ.</p>
          </>
        }
        onConfirm={async () => {
          try {
            await ed.saveNow();
            const removed = await deleteDesign(db, design.id);
            setConfirmDelete(false);
            navigate('/studio');
            toast({
              message: `حُذف التصميم «${removed.title}».`,
              action: {
                label: 'تراجع',
                run: async () => {
                  await restoreDesign(db, removed);
                  navigate(`/studio/${removed.id}`);
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

function ThemePicker({ value, onChange }: { value: Design['theme']; onChange: (t: Design['theme']) => void }) {
  const id = useId();
  return (
    <div className="theme-pick">
      <span className="field-label" id={id}>
        القالب اللوني
      </span>
      <div className="swatches" role="radiogroup" aria-labelledby={id}>
        {THEME_KEYS.map((k) => {
          const t = THEMES[k];
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={value === k}
              aria-label={t.label}
              title={t.label}
              className={`swatch swatch-theme ${value === k ? 'is-on' : ''}`}
              style={{ background: `linear-gradient(135deg, ${t.bg} 0 55%, ${t.accent} 55% 100%)` }}
              onClick={() => onChange(k)}
              data-testid={`theme-${k}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ───────── list rows shared by cards and summary ───────── */

function ItemRow({ n, count, label, onMove, onRemove, children, testId }: { n: number; count: number; label: string; onMove: (d: -1 | 1) => void; onRemove: () => void; children: ReactNode; testId: string }) {
  return (
    <li className="studio-item" data-testid={testId}>
      <div className="studio-item-head">
        <span className="qcard-n">{n}</span>
        <span className="row-actions">
          <button type="button" className="icon-btn" aria-label={`نقل ${label} ${n} للأعلى`} disabled={n === 1} onClick={() => onMove(-1)}>
            <ArrowUp size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label={`نقل ${label} ${n} للأسفل`} disabled={n === count} onClick={() => onMove(1)}>
            <ArrowDown size={16} />
          </button>
          <button type="button" className="icon-btn danger" aria-label={`حذف ${label} ${n}`} onClick={onRemove}>
            <Trash2 size={16} />
          </button>
        </span>
      </div>
      {children}
    </li>
  );
}

function CardsForm({ d, edit }: { d: CardsDesign; edit: (fn: (x: Design) => Design) => void }) {
  const uid = useId();
  const toast = useToast();
  const set = (fn: (c: CardsDesign['data']) => CardsDesign['data']) => edit((x) => (x.kind === 'cards' ? { ...x, data: fn(x.data) } : x));
  const patch = (id: string, p: Partial<CardItem>) => set((c) => ({ ...c, cards: c.cards.map((k) => (k.id === id ? { ...k, ...p } : k)) }));
  return (
    <div className="studio-fields">
      <div className="studio-row">
        <Segmented
          label="ما يظهر في الصورة"
          value={d.data.show}
          onChange={(show) => set((c) => ({ ...c, show }))}
          options={[
            { value: 'both', label: 'الوجه والظهر' },
            { value: 'front', label: 'الوجه فقط' },
          ]}
        />
        <Segmented label="بطاقات في كل صف" value={d.data.columns} onChange={(columns) => set((c) => ({ ...c, columns }))} options={[1, 2, 3].map((n) => ({ value: n as 1 | 2 | 3, label: String(n) }))} />
      </div>
      <ol className="studio-items">
        {d.data.cards.map((c, i) => (
          <ItemRow
            key={c.id}
            n={i + 1}
            count={d.data.cards.length}
            label="البطاقة"
            testId="studio-card"
            onMove={(dir) => set((x) => ({ ...x, cards: move(x.cards, c.id, dir) }))}
            onRemove={() => {
              set((x) => ({ ...x, cards: x.cards.filter((k) => k.id !== c.id) }));
              toast({ message: `حُذفت البطاقة ${i + 1}.`, action: { label: 'تراجع', run: () => set((x) => ({ ...x, cards: [...x.cards.slice(0, i), c, ...x.cards.slice(i)] })) } });
            }}
          >
            <div className="form-row">
              <div className="field">
                <label className="field-label" htmlFor={`${uid}-f${c.id}`}>
                  الوجه
                </label>
                <AutoTextarea id={`${uid}-f${c.id}`} minRows={1} value={c.front} maxLength={LIMITS.text} placeholder="مصطلح أو سؤال" onChange={(e) => patch(c.id, { front: e.target.value })} data-testid="card-front-input" />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`${uid}-b${c.id}`}>
                  الظهر
                </label>
                <AutoTextarea id={`${uid}-b${c.id}`} minRows={1} value={c.back} maxLength={LIMITS.longText} placeholder="تعريف أو جواب" onChange={(e) => patch(c.id, { back: e.target.value })} data-testid="card-back-input" />
              </div>
            </div>
          </ItemRow>
        ))}
      </ol>
      <button type="button" className="add-block-bar" disabled={d.data.cards.length >= LIMITS.cards} onClick={() => set((x) => ({ ...x, cards: [...x.cards, newCard()] }))} data-testid="add-card">
        <Plus size={20} aria-hidden="true" /> إضافة بطاقة
      </button>
    </div>
  );
}

function SummaryForm({ d, edit }: { d: SummaryDesign; edit: (fn: (x: Design) => Design) => void }) {
  const uid = useId();
  const toast = useToast();
  const set = (fn: (c: SummaryDesign['data']) => SummaryDesign['data']) => edit((x) => (x.kind === 'summary' ? { ...x, data: fn(x.data) } : x));
  const patch = (id: string, p: Partial<SummaryItem>) => set((c) => ({ ...c, points: c.points.map((k) => (k.id === id ? { ...k, ...p } : k)) }));
  return (
    <div className="studio-fields">
      <div className="field">
        <label className="field-label" htmlFor={`${uid}-h`}>
          الفكرة الرئيسية
        </label>
        <AutoTextarea id={`${uid}-h`} minRows={1} value={d.data.heading} maxLength={LIMITS.text} placeholder="مثال: مصادر الطاقة المتجددة" onChange={(e) => set((c) => ({ ...c, heading: e.target.value }))} data-testid="summary-heading" />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${uid}-s`}>
          سطر توضيحي (اختياري)
        </label>
        <AutoTextarea id={`${uid}-s`} minRows={1} value={d.data.subtitle} maxLength={LIMITS.longText} onChange={(e) => set((c) => ({ ...c, subtitle: e.target.value }))} data-testid="summary-subtitle" />
      </div>
      <Segmented<SummaryStyle> label="الشكل" value={d.data.style} onChange={(style) => set((c) => ({ ...c, style }))} options={(Object.keys(STYLE_LABEL) as SummaryStyle[]).map((k) => ({ value: k, label: STYLE_LABEL[k] }))} />
      <ol className="studio-items">
        {d.data.points.map((p, i) => (
          <ItemRow
            key={p.id}
            n={i + 1}
            count={d.data.points.length}
            label="النقطة"
            testId="studio-point"
            onMove={(dir) => set((x) => ({ ...x, points: move(x.points, p.id, dir) }))}
            onRemove={() => {
              set((x) => ({ ...x, points: x.points.filter((k) => k.id !== p.id) }));
              toast({ message: `حُذفت النقطة ${i + 1}.`, action: { label: 'تراجع', run: () => set((x) => ({ ...x, points: [...x.points.slice(0, i), p, ...x.points.slice(i)] })) } });
            }}
          >
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-pt${p.id}`}>
                العنوان
              </label>
              <AutoTextarea id={`${uid}-pt${p.id}`} minRows={1} value={p.title} maxLength={LIMITS.text} onChange={(e) => patch(p.id, { title: e.target.value })} data-testid="point-title-input" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-px${p.id}`}>
                الشرح (اختياري)
              </label>
              <AutoTextarea id={`${uid}-px${p.id}`} minRows={1} value={p.text} maxLength={LIMITS.longText} onChange={(e) => patch(p.id, { text: e.target.value })} data-testid="point-text-input" />
            </div>
          </ItemRow>
        ))}
      </ol>
      <button type="button" className="add-block-bar" disabled={d.data.points.length >= LIMITS.points} onClick={() => set((x) => ({ ...x, points: [...x.points, newPoint()] }))} data-testid="add-point">
        <Plus size={20} aria-hidden="true" /> إضافة نقطة
      </button>
    </div>
  );
}

function AddToLessonDialog({
  open,
  design,
  lessons,
  onClose,
  onAdd,
}: {
  open: boolean;
  design: Design;
  lessons: { id: string; title: string }[];
  onClose: () => void;
  onAdd: (lessonId: string, alt: string) => Promise<void>;
}) {
  const uid = useId();
  const [lessonId, setLessonId] = useState('');
  const [alt, setAlt] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setLessonId(design.lessonId ?? '');
    setAlt(`${KIND_LABEL[design.kind]}: ${design.title}`);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog
      open={open}
      title="إضافة التصميم إلى درس"
      onClose={onClose}
      testId="add-to-lesson-dialog"
      onSubmit={async () => {
        if (!lessonId) {
          setError('اختر الدرس.');
          return;
        }
        await onAdd(lessonId, alt);
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" data-testid="add-to-lesson-save">
            إضافة الصورة
          </button>
        </>
      }
    >
      <div className="form-grid">
        <p className="muted">تُضاف صورة PNG من التصميم بحالته الآن إلى نهاية الدرس، وتُحفظ داخل التطبيق. تعديل التصميم لاحقًا لا يغيّرها؛ أضفه مرة أخرى عند الحاجة.</p>
        {lessons.length === 0 ? (
          <p className="warn-text">لا توجد دروس في هذا المشروع بعد.</p>
        ) : (
          <div className={`field ${error ? 'has-error' : ''}`}>
            <label className="field-label" htmlFor={`${uid}-l`}>
              الدرس
            </label>
            <select id={`${uid}-l`} className="input" value={lessonId} onChange={(e) => setLessonId(e.target.value)} data-testid="add-to-lesson-select">
              <option value="">اختر درسًا</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            {error && (
              <span className="field-error" role="alert">
                {error}
              </span>
            )}
          </div>
        )}
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-a`}>
            النص البديل للصورة
          </label>
          <input id={`${uid}-a`} className="input" value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} data-testid="add-to-lesson-alt" />
          <span className="field-hint">يقرؤه قارئ الشاشة بدل الصورة: صِف ما تعرضه باختصار.</span>
        </div>
      </div>
    </Dialog>
  );
}
