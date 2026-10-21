import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Eye, FileAudio, FileText, FileVideo, Image as ImageIcon, LayoutTemplate, Library as LibraryIcon, Pencil, Plus, Search, Shapes, Trash2, Upload, X } from 'lucide-react';
import { errorMessage, useAllLessons, useAllProjects } from '../app/data';
import { relativeTime } from '../app/format';
import { useToast } from '../app/Toasts';
import { Dialog } from '../components/Dialog';
import { PageHeader, Pill } from '../components/ui';
import { db } from '../db/db';
import {
  addMediaToLibrary,
  copyLessonMediaToLibrary,
  createDesignFromTemplate,
  createLessonFromTemplate,
  deleteLibraryItem,
  insertAssetIntoLesson,
  insertItemIntoLesson,
  restoreLibraryItem,
  updateLibraryItem,
} from '../db/library';
import { matchesQuery } from '../db/search';
import { formatBytes, getStorageInfo, type StorageInfo } from '../db/storage';
import { BLOCK_META } from '../lesson/catalog';
import { BLOCK_ICON } from '../lesson/editor/BlockEditors';
import { ACCEPT, prepareFile, useAssetUrl } from '../lesson/media';
import { LessonView, ViewBlock } from '../lesson/view/LessonView';
import { builtinItems, KIND_LABEL, normalizeLibraryItem } from '../library/model';
import { SaveToLibraryDialog } from '../library/SaveToLibraryDialog';
import { LIBRARY_OWNER, type LibraryItem, type LibraryKind } from '../library/types';
import type { AssetKind } from '../lesson/types';
import { DesignThumb } from '../studio/DesignThumb';
import type { Design } from '../studio/types';

/** One row in the library view: a library item, or a media file that belongs to a lesson. */
type Entry =
  | { key: string; source: 'builtin' | 'mine'; item: LibraryItem }
  | { key: string; source: 'lesson'; asset: { id: string; kind: AssetKind; name: string; size: number; mime: string; lessonId: string; createdAt: number } };

const KIND_ICON: Record<LibraryKind, typeof BookOpen> = { lesson: LayoutTemplate, block: Shapes, design: LayoutTemplate, media: ImageIcon };
const MEDIA_ICON: Record<AssetKind, typeof BookOpen> = { image: ImageIcon, audio: FileAudio, video: FileVideo, file: FileText };
const MEDIA_LABEL: Record<AssetKind, string> = { image: 'صورة', audio: 'صوت', video: 'فيديو', file: 'ملف' };

export function LibraryPage() {
  const projects = useAllProjects();
  const lessons = useAllLessons();
  const toast = useToast();
  const navigate = useNavigate();
  const uid = useId();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const kind = (params.get('kind') ?? '') as LibraryKind | '';
  const source = params.get('source') ?? '';
  const tag = params.get('tag') ?? '';
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [preview, setPreview] = useState<Entry | null>(null);
  const [using, setUsing] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [saveAsset, setSaveAsset] = useState<Entry | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void getStorageInfo().then(setStorage);
  }, []);

  const data = useLiveQuery(async () => {
    const items = (await db.library.toArray()).map(normalizeLibraryItem).filter((x): x is LibraryItem => !!x);
    const media: Extract<Entry, { source: 'lesson' }>['asset'][] = [];
    const sizes = { library: 0, lessons: 0 };
    await db.assets.each((a) => {
      if (a.lessonId === LIBRARY_OWNER) sizes.library += a.size;
      else {
        sizes.lessons += a.size;
        media.push({ id: a.id, kind: a.kind, name: a.name, size: a.size, mime: a.mime, lessonId: a.lessonId, createdAt: a.createdAt });
      }
    });
    return { items, media, sizes };
  }, []);

  const lessonById = useMemo(() => new Map((lessons ?? []).map((l) => [l.id, l])), [lessons]);
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects]);

  const entries: Entry[] = useMemo(() => {
    if (!data) return [];
    const mine: Entry[] = data.items.map((item) => ({ key: item.id, source: 'mine', item }));
    const builtin: Entry[] = builtinItems().map((item) => ({ key: item.id, source: 'builtin', item }));
    // Lesson media still used somewhere (a lesson that exists)
    const fromLessons: Entry[] = data.media.filter((a) => lessonById.has(a.lessonId)).map((asset) => ({ key: `asset:${asset.id}`, source: 'lesson', asset }));
    return [...mine, ...fromLessons, ...builtin];
  }, [data, lessonById]);

  const kindOf = (e: Entry): LibraryKind => (e.source === 'lesson' ? 'media' : e.item.kind);
  const titleOf = (e: Entry) => (e.source === 'lesson' ? e.asset.name : e.item.title);
  const tagsOf = (e: Entry) => (e.source === 'lesson' ? [] : e.item.tags);
  const lessonTitle = (id: string) => lessonById.get(id)?.title ?? '';

  const allTags = useMemo(() => [...new Set(entries.flatMap(tagsOf))].sort((a, b) => a.localeCompare(b, 'ar')), [entries]);
  const shown = entries
    .filter((e) => !kind || kindOf(e) === kind)
    .filter((e) => !source || e.source === source)
    .filter((e) => !tag || tagsOf(e).includes(tag))
    .filter((e) => matchesQuery(q, titleOf(e), e.source === 'lesson' ? lessonTitle(e.asset.lessonId) : e.item.description, tagsOf(e).join(' ')));

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError('');
    setUploading(true);
    let added = 0;
    try {
      for (const f of Array.from(files)) {
        const k: AssetKind = f.type.startsWith('audio') ? 'audio' : f.type.startsWith('video') ? 'video' : 'image';
        try {
          const prepared = await prepareFile(f, k);
          await addMediaToLibrary(db, prepared, { title: f.name.replace(/\.[^.]+$/, ''), tags: [MEDIA_LABEL[k]] });
          added++;
        } catch (e) {
          setUploadError(`«${f.name}»: ${errorMessage(e)}`);
        }
      }
      if (added) toast({ message: added === 1 ? 'أُضيف ملف إلى المكتبة.' : `أُضيفت ${added} ملفات إلى المكتبة.` });
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: LibraryItem) => {
    try {
      const snap = await deleteLibraryItem(db, item.id);
      toast({ message: `حُذف «${item.title}» من المكتبة.`, action: { label: 'تراجع', run: () => restoreLibraryItem(db, snap) } });
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'danger' });
    }
  };

  return (
    <div className="page" data-testid="page-library">
      <PageHeader
        title="المكتبة المحلية"
        subtitle="قوالب دروس وعناصر تعليمية وقوالب تصاميم ووسائط، محفوظة على هذا الجهاز ويُعاد استخدامها في أي درس دون إنترنت."
        actions={
          <>
            <input id={`${uid}-up`} type="file" multiple accept={`${ACCEPT.image},${ACCEPT.audio},${ACCEPT.video}`} className="sr-only-file" onChange={(e) => void upload(e.target.files).then(() => (e.target.value = ''))} data-testid="library-upload" />
            <label htmlFor={`${uid}-up`} className={`btn btn-primary fab-mobile ${uploading ? 'is-busy' : ''}`}>
              <Upload size={18} aria-hidden="true" /> <span>{uploading ? 'جارٍ الرفع…' : 'رفع وسائط'}</span>
            </label>
          </>
        }
      />
      {uploadError && (
        <div className="align-alert is-error" role="alert" data-testid="library-upload-error">
          <X size={20} aria-hidden="true" />
          <div>
            <strong>تعذّر رفع ملف</strong>
            <p>{uploadError}</p>
          </div>
        </div>
      )}

      <section className="library-usage" aria-label="المساحة" data-testid="library-usage">
        <span>
          وسائط المكتبة: <strong>{formatBytes(data?.sizes.library ?? null)}</strong>
        </span>
        <span>
          وسائط الدروس: <strong>{formatBytes(data?.sizes.lessons ?? null)}</strong>
        </span>
        <span>
          المستخدم من تخزين الجهاز: <strong>{formatBytes(storage?.usage ?? null)}</strong>
          {storage?.quota ? ` من ${formatBytes(storage.quota)}` : ''}
        </span>
      </section>

      <div className="search-row">
        <label className="search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">بحث في المكتبة</span>
          <input type="search" className="search-input" placeholder="ابحث بالعنوان أو الوصف أو الوسم…" value={q} onChange={(e) => setParam('q', e.target.value)} data-testid="library-search" />
          {q && (
            <button type="button" className="icon-btn search-clear" aria-label="مسح البحث" onClick={() => setParam('q', '')}>
              <X size={16} />
            </button>
          )}
        </label>
        <label className="filter filter-inline">
          <span className="sr-only">النوع</span>
          <select className="input" value={kind} onChange={(e) => setParam('kind', e.target.value)} data-testid="library-kind">
            <option value="">كل الأنواع</option>
            {(Object.keys(KIND_LABEL) as LibraryKind[]).map((k) => (
              <option key={k} value={k}>
                {k === 'lesson' ? 'قوالب الدروس' : k === 'block' ? 'العناصر التعليمية' : k === 'design' ? 'قوالب التصاميم' : 'الوسائط'}
              </option>
            ))}
          </select>
        </label>
        <label className="filter filter-inline">
          <span className="sr-only">المصدر</span>
          <select className="input" value={source} onChange={(e) => setParam('source', e.target.value)} data-testid="library-source">
            <option value="">كل المصادر</option>
            <option value="mine">ما حفظته أنا</option>
            <option value="lesson">وسائط الدروس</option>
            <option value="builtin">المضمّنة في التطبيق</option>
          </select>
        </label>
      </div>
      {allTags.length > 0 && (
        <div className="tag-filter" role="group" aria-label="التصنيف بالوسوم">
          {allTags.map((t) => (
            <button key={t} type="button" className={`chip ${tag === t ? 'is-on' : ''}`} aria-pressed={tag === t} onClick={() => setParam('tag', tag === t ? '' : t)} data-testid="library-tag">
              {t}
            </button>
          ))}
        </div>
      )}

      {data && shown.length === 0 ? (
        <div className="empty" data-testid="library-none">
          <p>{entries.length ? 'لا توجد عناصر مطابقة.' : 'المكتبة فارغة.'}</p>
        </div>
      ) : (
        <ul className="library-grid" data-testid="library-list">
          {shown.map((e) => {
            const k = kindOf(e);
            const Icon = e.source === 'lesson' ? MEDIA_ICON[e.asset.kind] : KIND_ICON[k];
            return (
              <li key={e.key} className="library-card" data-testid="library-item" data-kind={k} data-source={e.source} data-title={titleOf(e)}>
                <div className="library-thumb" aria-hidden="true">
                  <Thumb e={e} />
                </div>
                <div className="library-body">
                  <span className="design-tile-kind">
                    <Icon size={14} aria-hidden="true" /> {e.source === 'lesson' ? `${MEDIA_LABEL[e.asset.kind]} من درس` : e.item.kind === 'media' ? 'وسائط' : KIND_LABEL[e.item.kind]}
                    {e.source === 'builtin' && <Pill tone="accent">مضمّن</Pill>}
                  </span>
                  <strong className="library-title">{titleOf(e)}</strong>
                  <span className="muted library-meta">
                    {e.source === 'lesson'
                      ? `${lessonTitle(e.asset.lessonId)} · ${projectById.get(lessonById.get(e.asset.lessonId)?.projectId ?? '')?.title ?? ''} · ${formatBytes(e.asset.size)}`
                      : e.item.description || (e.source === 'mine' ? `حُفظ ${relativeTime(e.item.createdAt)}` : '')}
                  </span>
                  {tagsOf(e).length > 0 && (
                    <span className="library-tags">
                      {tagsOf(e).map((t) => (
                        <span key={t} className="tag">
                          #{t}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="library-actions">
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPreview(e)} aria-label={`معاينة ${titleOf(e)}`} data-testid="library-preview">
                      <Eye size={16} aria-hidden="true" /> معاينة
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setUsing(e)} aria-label={`استخدام ${titleOf(e)}`} data-testid="library-use">
                      <Plus size={16} aria-hidden="true" /> استخدام
                    </button>
                    {e.source === 'lesson' && (
                      <button type="button" className="icon-btn" aria-label={`حفظ ${titleOf(e)} في المكتبة`} title="حفظ في المكتبة" onClick={() => setSaveAsset(e)} data-testid="library-keep">
                        <LibraryIcon size={17} />
                      </button>
                    )}
                    {e.source === 'mine' && (
                      <>
                        <button type="button" className="icon-btn" aria-label={`تعديل ${titleOf(e)}`} onClick={() => setEditing(e.item)} data-testid="library-edit">
                          <Pencil size={17} />
                        </button>
                        <button type="button" className="icon-btn danger" aria-label={`حذف ${titleOf(e)}`} onClick={() => void remove(e.item)} data-testid="library-delete">
                          <Trash2 size={17} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!preview} title={preview ? `معاينة: ${titleOf(preview)}` : ''} onClose={() => setPreview(null)} testId="library-preview-dialog" size="lg">
        {preview && <PreviewBody e={preview} />}
      </Dialog>

      <UseDialog
        entry={using}
        onClose={() => setUsing(null)}
        onDone={(msg, go) => {
          setUsing(null);
          toast({ message: msg, action: go ? { label: 'فتح', run: () => navigate(go) } : undefined });
        }}
      />

      <SaveToLibraryDialog
        open={!!editing}
        heading="تعديل عنصر المكتبة"
        initial={editing ?? { title: '' }}
        onClose={() => setEditing(null)}
        onSave={async (v) => {
          try {
            await updateLibraryItem(db, editing!.id, v);
            setEditing(null);
            toast({ message: 'حُفظت التعديلات.' });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
      <SaveToLibraryDialog
        open={!!saveAsset}
        heading="حفظ الملف في المكتبة"
        note="تُحفظ نسخة من الملف في المكتبة، فتبقى حتى لو حُذف الدرس."
        initial={{ title: saveAsset?.source === 'lesson' ? saveAsset.asset.name.replace(/\.[^.]+$/, '') : '', tags: saveAsset?.source === 'lesson' ? [MEDIA_LABEL[saveAsset.asset.kind]] : [] }}
        onClose={() => setSaveAsset(null)}
        onSave={async (v) => {
          if (saveAsset?.source !== 'lesson') return;
          try {
            await copyLessonMediaToLibrary(db, saveAsset.asset.id, v);
            setSaveAsset(null);
            toast({ message: 'حُفظ الملف في المكتبة.' });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </div>
  );
}

function MediaThumb({ assetId, kind }: { assetId: string; kind: AssetKind }) {
  const { url } = useAssetUrl(kind === 'image' ? assetId : null);
  const Icon = MEDIA_ICON[kind];
  return kind === 'image' && url ? <img src={url} alt="" /> : <Icon size={36} />;
}

function Thumb({ e }: { e: Entry }) {
  if (e.source === 'lesson') return <MediaThumb assetId={e.asset.id} kind={e.asset.kind} />;
  const item = e.item;
  if (item.kind === 'design') return <DesignThumb design={{ id: item.id, projectId: '', lessonId: null, title: item.title, rev: 0, createdAt: 0, updatedAt: 0, kind: item.data.kind, theme: item.data.theme, data: item.data.data } as Design} />;
  if (item.kind === 'media') return <MediaThumbFromItem assetId={item.data.assetId} />;
  const blocks = item.kind === 'lesson' ? item.data.doc.blocks : item.data.blocks;
  return (
    <span className="library-blocks">
      {blocks.slice(0, 6).map((b) => {
        const BI = BLOCK_ICON[b.type];
        return (
          <span key={b.id} className="library-block-chip">
            <BI size={14} /> {BLOCK_META[b.type].label}
          </span>
        );
      })}
    </span>
  );
}

function MediaThumbFromItem({ assetId }: { assetId: string }) {
  const { asset } = useAssetUrl(assetId);
  return asset ? <MediaThumb assetId={assetId} kind={asset.kind} /> : <ImageIcon size={36} />;
}

function MediaPlayer({ assetId, label }: { assetId: string; label: string }) {
  const { url, asset, state } = useAssetUrl(assetId);
  if (state === 'missing') return <p className="muted">الملف غير موجود على هذا الجهاز.</p>;
  if (!url || !asset) return <p className="muted">…</p>;
  return (
    <div className="library-media" data-testid="library-media">
      {asset.kind === 'image' ? <img src={url} alt={label} /> : asset.kind === 'audio' ? <audio src={url} controls aria-label={label} /> : <video src={url} controls playsInline aria-label={label} />}
      <p className="muted">
        {asset.name} · {formatBytes(asset.size)}
        {asset.width ? ` · ${asset.width}×${asset.height}` : ''}
      </p>
    </div>
  );
}

function PreviewBody({ e }: { e: Entry }) {
  if (e.source === 'lesson') return <MediaPlayer assetId={e.asset.id} label={e.asset.name} />;
  const item = e.item;
  let body: ReactNode;
  if (item.kind === 'lesson')
    body = (
      <div className="lv-container library-lesson-preview">
        <LessonView lesson={{ title: item.title, summary: item.data.summary, duration: item.data.duration }} project={null} doc={item.data.doc} teacherNotes />
      </div>
    );
  else if (item.kind === 'block')
    body = (
      <div className="lv-container">
        <div className="lv">
          <div className="lv-blocks">
            {item.data.blocks.map((b) => (
              <ViewBlock key={b.id} block={b} />
            ))}
          </div>
        </div>
      </div>
    );
  else if (item.kind === 'design')
    body = (
      <div className="design-preview">
        <DesignThumb design={{ id: item.id, projectId: '', lessonId: null, title: item.title, rev: 0, createdAt: 0, updatedAt: 0, kind: item.data.kind, theme: item.data.theme, data: item.data.data } as Design} />
      </div>
    );
  else body = <MediaPlayer assetId={item.data.assetId} label={item.title} />;
  return (
    <div data-testid="library-preview-body">
      {item.description && <p className="muted">{item.description}</p>}
      {body}
    </div>
  );
}

/** Where to use an item: a new lesson (template), the end of a lesson (block, media), or a new design. */
function UseDialog({ entry, onClose, onDone }: { entry: Entry | null; onClose: () => void; onDone: (message: string, go?: string) => void }) {
  const uid = useId();
  const projects = useAllProjects();
  const lessons = useAllLessons();
  const [projectId, setProjectId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const kind: LibraryKind | null = entry ? (entry.source === 'lesson' ? 'media' : entry.item.kind) : null;
  useEffect(() => {
    if (!entry) return;
    const active = (projects ?? []).filter((p) => p.status !== 'archived');
    setProjectId(active.length === 1 ? active[0].id : '');
    setLessonId('');
    setTitle(entry.source === 'lesson' ? '' : entry.item.title);
    setError('');
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);
  const projectLessons = (lessons ?? []).filter((l) => l.projectId === projectId).sort((a, b) => a.order - b.order);
  const needsLesson = kind === 'block' || kind === 'media';
  const needsTitle = kind === 'lesson' || kind === 'design';
  return (
    <Dialog
      open={!!entry}
      title={kind === 'lesson' ? 'درس جديد من القالب' : kind === 'design' ? 'تصميم جديد من القالب' : 'إضافة إلى درس'}
      onClose={onClose}
      testId="library-use-dialog"
      onSubmit={async () => {
        if (!entry || !kind) return;
        if (!projectId) return setError('اختر المشروع.');
        if (needsLesson && !lessonId) return setError('اختر الدرس.');
        if (needsTitle && !title.trim()) return setError('اكتب العنوان.');
        setBusy(true);
        try {
          if (entry.source === 'lesson') {
            await insertAssetIntoLesson(db, entry.asset.id, lessonId, entry.asset.name.replace(/\.[^.]+$/, ''));
            onDone(`أُضيف الملف إلى نهاية درس «${projectLessons.find((l) => l.id === lessonId)?.title}».`, `/projects/${projectId}/lessons/${lessonId}?tab=content`);
          } else if (entry.item.kind === 'lesson') {
            const l = await createLessonFromTemplate(db, entry.item, projectId, title);
            onDone(`أُنشئ الدرس «${l.title}» من القالب.`, `/projects/${projectId}/lessons/${l.id}`);
          } else if (entry.item.kind === 'design') {
            const d = await createDesignFromTemplate(db, entry.item, projectId, lessonId || null, title);
            onDone(`أُنشئ التصميم «${d.title}».`, `/studio/${d.id}`);
          } else {
            const n = await insertItemIntoLesson(db, entry.item, lessonId);
            onDone(`أُضيف ${n === 1 ? 'عنصر' : `${n} عناصر`} إلى نهاية درس «${projectLessons.find((l) => l.id === lessonId)?.title}».`, `/projects/${projectId}/lessons/${lessonId}?tab=content`);
          }
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="library-use-save">
            {kind === 'lesson' ? 'إنشاء الدرس' : kind === 'design' ? 'إنشاء التصميم' : 'إضافة'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-p`}>
            المشروع
          </label>
          <select
            id={`${uid}-p`}
            className="input"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setLessonId('');
            }}
            data-testid="library-use-project"
          >
            <option value="">اختر مشروعًا</option>
            {(projects ?? [])
              .filter((p) => p.status !== 'archived')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
        </div>
        {(needsLesson || kind === 'design') && (
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-l`}>
              {needsLesson ? 'الدرس' : 'الدرس (اختياري)'}
            </label>
            <select id={`${uid}-l`} className="input" value={lessonId} disabled={!projectId} onChange={(e) => setLessonId(e.target.value)} data-testid="library-use-lesson">
              <option value="">{needsLesson ? 'اختر درسًا' : 'بلا درس'}</option>
              {projectLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
            {needsLesson && <span className="field-hint">يُضاف في نهاية الدرس، وتُنسخ الوسائط إليه.</span>}
          </div>
        )}
        {needsTitle && (
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-t`}>
              {kind === 'lesson' ? 'عنوان الدرس الجديد' : 'عنوان التصميم'}
            </label>
            <input id={`${uid}-t`} className="input" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} data-testid="library-use-title" />
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {(projects ?? []).length === 0 && <p className="warn-text">أنشئ مشروعًا أولًا.</p>}
      </div>
    </Dialog>
  );
}

