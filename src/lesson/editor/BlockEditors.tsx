import { useId, useRef, useState } from 'react';
import {
  AudioLines,
  ClipboardList,
  Clapperboard,
  FileText,
  Heading,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  Network,
  Pilcrow,
  Plus,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { db } from '../../db/db';
import { addAsset } from '../../db/lessonDocs';
import { formatBytes } from '../../db/storage';
import { useToast } from '../../app/Toasts';
import { GROUPING_LABEL, SUMMARY_STYLE_LABEL, TRACK_LABEL } from '../catalog';
import { ACCEPT, isQuotaError, MediaError, prepareFile, useAssetUrl } from '../media';
import { newCard, newPoint } from '../model';
import type { ActivityBlock, ActivityTrack, AudioBlock, Block, BlockType, CardsBlock, FileBlock, Grouping, HeadingBlock, ImageBlock, SummaryBlock, SummaryStyle, TextBlock, VideoBlock } from '../types';
import { AutoTextarea, TextField } from './parts';

export const BLOCK_ICON: Record<BlockType, LucideIcon> = {
  heading: Heading,
  text: Pilcrow,
  image: ImageIcon,
  audio: AudioLines,
  video: Clapperboard,
  cards: Layers,
  summary: Network,
  activity: ClipboardList,
  file: FileText,
};

type Patch<B extends Block> = (patch: Partial<B>) => void;

export function BlockBody({ block, lessonId, onPatch }: { block: Block; lessonId: string; onPatch: (patch: Partial<Block>) => void }) {
  switch (block.type) {
    case 'heading':
      return <HeadingEditor b={block} on={onPatch as Patch<HeadingBlock>} />;
    case 'text':
      return <TextEditor b={block} on={onPatch as Patch<TextBlock>} />;
    case 'image':
      return <ImageEditor b={block} on={onPatch as Patch<ImageBlock>} lessonId={lessonId} />;
    case 'audio':
    case 'video':
      return <AvEditor b={block} on={onPatch as Patch<AudioBlock | VideoBlock>} lessonId={lessonId} />;
    case 'cards':
      return <CardsEditor b={block} on={onPatch as Patch<CardsBlock>} />;
    case 'summary':
      return <SummaryEditor b={block} on={onPatch as Patch<SummaryBlock>} />;
    case 'activity':
      return <ActivityEditor b={block} on={onPatch as Patch<ActivityBlock>} />;
    case 'file':
      return <FileEditor b={block} on={onPatch as Patch<FileBlock>} lessonId={lessonId} />;
  }
}

function HeadingEditor({ b, on }: { b: HeadingBlock; on: Patch<HeadingBlock> }) {
  const id = useId();
  return (
    <div className="heading-ed">
      <label className="sr-only" htmlFor={id}>
        نص العنوان
      </label>
      <input
        id={id}
        className={`input heading-input h${b.level}`}
        value={b.text}
        maxLength={300}
        placeholder="عنوان القسم"
        onChange={(e) => on({ text: e.target.value })}
        data-testid="heading-text"
      />
      <div className="segmented segmented-sm" role="radiogroup" aria-label="حجم العنوان">
        {([2, 3] as const).map((lv) => (
          <button key={lv} type="button" role="radio" aria-checked={b.level === lv} className={b.level === lv ? 'is-active' : ''} onClick={() => on({ level: lv })}>
            {lv === 2 ? 'رئيسي' : 'فرعي'}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextEditor({ b, on }: { b: TextBlock; on: Patch<TextBlock> }) {
  const id = useId();
  return (
    <div className="field">
      <label className="sr-only" htmlFor={id}>
        النص
      </label>
      <AutoTextarea id={id} minRows={4} value={b.text} maxLength={20000} placeholder="اكتب الشرح هنا…" onChange={(e) => on({ text: e.target.value })} data-testid="text-body" />
      <span className="field-hint">
        سطر يبدأ بـ «- » يصبح نقطة، وسطر يبدأ بـ «1. » يصبح قائمة مرقمة، و**نص** يصبح غامقًا. اترك سطرًا فارغًا بين الفقرات.
      </span>
    </div>
  );
}

/* ───────── media ───────── */

function useUpload(lessonId: string, kind: 'image' | 'audio' | 'video' | 'file', onDone: (assetId: string) => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const prepared = await prepareFile(file, kind);
      const asset = await addAsset(db, lessonId, prepared);
      onDone(asset.id);
      toast({ message: prepared.note ?? `حُفظ الملف «${file.name}» على الجهاز (${formatBytes(asset.size)}).`, tone: prepared.note ? 'danger' : 'success' });
    } catch (e) {
      const msg = e instanceof MediaError ? e.message : isQuotaError(e) ? 'مساحة التخزين على الجهاز لا تكفي لهذا الملف.' : 'تعذّر حفظ الملف.';
      toast({ message: msg, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return { busy, pick };
}

function FilePicker({ kind, busy, onPick, hasFile, testId }: { kind: 'image' | 'audio' | 'video' | 'file'; busy: boolean; onPick: (f: File | undefined) => void; hasFile: boolean; testId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const label = kind === 'image' ? 'صورة' : kind === 'audio' ? 'ملفًا صوتيًا' : kind === 'file' ? 'ملفًا (PDF أو Word أو PowerPoint…)' : 'فيديو';
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT[kind]}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid={testId}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {hasFile ? (
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />} استبدال الملف
        </button>
      ) : (
        <button type="button" className="dropzone" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? <LoaderCircle size={26} className="spin" aria-hidden="true" /> : <Upload size={26} aria-hidden="true" />}
          <span>{busy ? 'جارٍ الحفظ على الجهاز…' : `اختر ${label} من جهازك`}</span>
          <span className="muted">يُحفظ داخل التطبيق ويعمل دون إنترنت</span>
        </button>
      )}
    </>
  );
}

function FileMeta({ name, size, extra }: { name: string; size: number; extra?: string }) {
  return (
    <span className="file-meta">
      {name} · {formatBytes(size)}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}

function ImageEditor({ b, on, lessonId }: { b: ImageBlock; on: Patch<ImageBlock>; lessonId: string }) {
  const { url, asset, state } = useAssetUrl(b.assetId);
  const { busy, pick } = useUpload(lessonId, 'image', (assetId) => on({ assetId }));
  const altMissing = !!b.assetId && !b.decorative && !b.alt.trim();
  const altId = useId();
  return (
    <div className="media-ed">
      {state === 'ready' && url ? (
        <figure className="media-preview">
          <img src={url} alt={b.alt} data-testid="image-preview" />
        </figure>
      ) : state === 'missing' ? (
        <p className="field-error">الملف غير موجود على هذا الجهاز. اختر الصورة من جديد.</p>
      ) : null}
      <div className="media-row">
        <FilePicker kind="image" busy={busy} onPick={pick} hasFile={state === 'ready'} testId="image-input" />
        {asset && <FileMeta name={asset.name} size={asset.size} extra={asset.width ? `\u2066${asset.width}×${asset.height}\u2069` : undefined} />}
      </div>
      <div className={`field ${altMissing ? 'has-error' : ''}`}>
        <label className="field-label" htmlFor={altId}>
          النص البديل (لمن لا يرى الصورة)
        </label>
        <input
          id={altId}
          className="input"
          value={b.alt}
          maxLength={500}
          disabled={b.decorative}
          placeholder="صف ما تُظهره الصورة ولماذا هي مهمة للدرس"
          onChange={(e) => on({ alt: e.target.value })}
          data-testid="image-alt"
          aria-invalid={altMissing}
        />
        {altMissing && <span className="field-error">أضف نصًا بديلًا، أو حدّد أن الصورة زخرفية.</span>}
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={b.decorative} onChange={(e) => on({ decorative: e.target.checked })} />
        <span>صورة زخرفية لا تحمل معلومة (بلا نص بديل)</span>
      </label>
      <TextField label="تعليق تحت الصورة (اختياري)" value={b.caption} maxLength={500} onChange={(v) => on({ caption: v })} testId="image-caption" />
    </div>
  );
}

function AvEditor({ b, on, lessonId }: { b: AudioBlock | VideoBlock; on: Patch<AudioBlock | VideoBlock>; lessonId: string }) {
  const kind = b.type;
  const { url, asset, state } = useAssetUrl(b.assetId);
  const { busy, pick } = useUpload(lessonId, kind, (assetId) => on({ assetId }));
  return (
    <div className="media-ed">
      {state === 'ready' && url ? (
        kind === 'video' ? (
          <video className="media-video" src={url} controls playsInline preload="metadata" data-testid="video-preview" />
        ) : (
          <audio className="media-audio" src={url} controls preload="metadata" data-testid="audio-preview" />
        )
      ) : state === 'missing' ? (
        <p className="field-error">الملف غير موجود على هذا الجهاز. اختره من جديد.</p>
      ) : null}
      <div className="media-row">
        <FilePicker kind={kind} busy={busy} onPick={pick} hasFile={state === 'ready'} testId={`${kind}-input`} />
        {asset && <FileMeta name={asset.name} size={asset.size} />}
      </div>
      <TextField label="العنوان" value={b.title} maxLength={300} onChange={(v) => on({ title: v })} testId={`${kind}-title`} />
      <TextField
        label={kind === 'video' ? 'وصف أو نص مكتوب للفيديو (يساعد ضعاف السمع)' : 'النص المكتوب للتسجيل (يساعد ضعاف السمع)'}
        multiline
        value={b.transcript}
        maxLength={20000}
        onChange={(v) => on({ transcript: v })}
        testId={`${kind}-transcript`}
      />
    </div>
  );
}

/* ───────── cards / summary / activity ───────── */

function CardsEditor({ b, on }: { b: CardsBlock; on: Patch<CardsBlock> }) {
  const setCard = (id: string, patch: Partial<CardsBlock['cards'][number]>) => on({ cards: b.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <div className="stack">
      <TextField label="عنوان المجموعة" value={b.title} maxLength={300} placeholder="مثل: مصطلحات الدرس" onChange={(v) => on({ title: v })} testId="cards-title" />
      <ol className="card-edit-list">
        {b.cards.map((c, i) => (
          <li key={c.id} className="card-edit" data-testid="card-edit">
            <span className="card-edit-n">{i + 1}</span>
            <div className="card-edit-fields">
              <TextField label="الوجه (سؤال أو مصطلح)" value={c.front} maxLength={1000} onChange={(v) => setCard(c.id, { front: v })} testId="card-front" />
              <TextField label="الظهر (إجابة أو تعريف)" multiline minRows={1} value={c.back} maxLength={2000} onChange={(v) => setCard(c.id, { back: v })} testId="card-back" />
            </div>
            <button type="button" className="icon-btn danger" aria-label={`حذف البطاقة ${i + 1}`} disabled={b.cards.length <= 1} onClick={() => on({ cards: b.cards.filter((x) => x.id !== c.id) })}>
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => on({ cards: [...b.cards, newCard()] })} disabled={b.cards.length >= 40} data-testid="add-card">
        <Plus size={16} aria-hidden="true" /> بطاقة أخرى
      </button>
    </div>
  );
}

function SummaryEditor({ b, on }: { b: SummaryBlock; on: Patch<SummaryBlock> }) {
  const setPoint = (id: string, patch: Partial<SummaryBlock['points'][number]>) => on({ points: b.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  return (
    <div className="stack">
      <TextField label={b.style === 'central' ? 'المفهوم المركزي' : 'عنوان الملخص'} value={b.title} maxLength={300} onChange={(v) => on({ title: v })} testId="summary-title" />
      <div className="segmented segmented-sm" role="radiogroup" aria-label="شكل الملخص">
        {(Object.keys(SUMMARY_STYLE_LABEL) as SummaryStyle[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={b.style === s} className={b.style === s ? 'is-active' : ''} onClick={() => on({ style: s })}>
            {SUMMARY_STYLE_LABEL[s]}
          </button>
        ))}
      </div>
      <ol className="card-edit-list">
        {b.points.map((p, i) => (
          <li key={p.id} className="card-edit" data-testid="point-edit">
            <span className="card-edit-n">{i + 1}</span>
            <div className="card-edit-fields">
              <TextField label="الفكرة" value={p.title} maxLength={200} onChange={(v) => setPoint(p.id, { title: v })} testId="point-title" />
              <TextField label="توضيح قصير (اختياري)" multiline minRows={1} value={p.text} maxLength={1000} onChange={(v) => setPoint(p.id, { text: v })} testId="point-text" />
            </div>
            <button type="button" className="icon-btn danger" aria-label={`حذف الفكرة ${i + 1}`} disabled={b.points.length <= 1} onClick={() => on({ points: b.points.filter((x) => x.id !== p.id) })}>
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => on({ points: [...b.points, newPoint()] })} disabled={b.points.length >= 12} data-testid="add-point">
        <Plus size={16} aria-hidden="true" /> فكرة أخرى
      </button>
    </div>
  );
}

function ActivityEditor({ b, on }: { b: ActivityBlock; on: Patch<ActivityBlock> }) {
  const gid = useId();
  const did = useId();
  return (
    <div className="stack">
      <TextField label="عنوان النشاط" value={b.title} maxLength={300} placeholder="مثل: تصنيف مصادر الطاقة" onChange={(v) => on({ title: v })} testId="activity-title" />
      <div className="form-row">
        <div className="field">
          <label className="field-label" htmlFor={gid}>
            طريقة التنفيذ
          </label>
          <select id={gid} className="input" value={b.grouping} onChange={(e) => on({ grouping: e.target.value as Grouping })} data-testid="activity-grouping">
            {(Object.keys(GROUPING_LABEL) as Grouping[]).map((g) => (
              <option key={g} value={g}>
                {GROUPING_LABEL[g]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={did}>
            الزمن (دقيقة)
          </label>
          <input
            id={did}
            className="input"
            inputMode="numeric"
            value={b.duration ? String(b.duration) : ''}
            placeholder="10"
            onChange={(e) => {
              const raw = e.target.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
              on({ duration: raw ? Math.min(600, Number(raw)) : 0 });
            }}
            data-testid="activity-duration"
          />
        </div>
      </div>
      <TextField label="خطوات التنفيذ (خطوة في كل سطر)" multiline minRows={3} value={b.steps} maxLength={5000} placeholder={'اقرأ البطاقات\nصنّفها في جدول\nناقش زميلك'} onChange={(v) => on({ steps: v })} testId="activity-steps" />
      <div className="form-row">
        <TextField label="المواد والأدوات" value={b.materials} maxLength={1000} onChange={(v) => on({ materials: v })} testId="activity-materials" />
        <TextField label="الناتج المطلوب" value={b.output} maxLength={1000} onChange={(v) => on({ output: v })} testId="activity-output" />
      </div>
      <div className="field">
        <span className="field-label">لمن هذا النشاط؟</span>
        <div className="segmented segmented-sm" role="radiogroup" aria-label="مسار النشاط">
          {(Object.keys(TRACK_LABEL) as ActivityTrack[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={b.track === t} className={b.track === t ? 'is-active' : ''} onClick={() => on({ track: t })} data-testid={`activity-track-${t}`}>
              {TRACK_LABEL[t]}
            </button>
          ))}
        </div>
        <span className="field-hint">
          {b.track === 'remedial'
            ? 'يظهر للمتعلم في نهاية الدرس إذا كانت نتيجته في آخر محاولة اختبار أقل من درجة النجاح.'
            : b.track === 'enrichment'
              ? 'يظهر للمتعلم في نهاية الدرس إذا حصل على 85٪ فأكثر في آخر محاولة اختبار.'
              : 'يظهر لكل المتعلمين في مكانه من الدرس.'}
        </span>
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={b.submit} onChange={(e) => on({ submit: e.target.checked })} data-testid="activity-submit" />
        <span>تكليف يُسلَّم: يكتب المتعلم إجابته ويرفق ملفًا، ثم تقيّمه أنت من «النتائج»</span>
      </label>
    </div>
  );
}

function FileEditor({ b, on, lessonId }: { b: FileBlock; on: Patch<FileBlock>; lessonId: string }) {
  const { asset, state } = useAssetUrl(b.assetId);
  const { busy, pick } = useUpload(lessonId, 'file', (assetId) => on({ assetId, title: b.title || '' }));
  return (
    <div className="media-ed">
      {state === 'missing' && <p className="field-error">الملف غير موجود على هذا الجهاز. اختره من جديد.</p>}
      <div className="media-row">
        <FilePicker kind="file" busy={busy} onPick={pick} hasFile={state === 'ready'} testId="file-input" />
        {asset && <FileMeta name={asset.name} size={asset.size} />}
      </div>
      <TextField label="عنوان الملف" value={b.title} maxLength={300} placeholder="مثل: ورقة العمل" onChange={(v) => on({ title: v })} testId="file-title" />
      <TextField label="وصف أو تعليمات (اختياري)" multiline minRows={2} value={b.description} maxLength={2000} onChange={(v) => on({ description: v })} testId="file-description" />
    </div>
  );
}
