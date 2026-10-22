import { useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, BookMarked, Copy, CopyPlus, Download, FolderOpen, Palette, Pencil, Plus, RefreshCw, RotateCcw, Save, Search, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { errorMessage } from '../app/data';
import { relativeTime } from '../app/format';
import { useToast } from '../app/Toasts';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { PageHeader, Pill } from '../components/ui';
import { db } from '../db/db';
import { download } from '../transfer/service';
import { useSfx } from '../audio/AudioControl';
import { LogoComposer } from '../aistudio/LogoComposer';
import {
  ANGLES,
  BACKGROUNDS,
  BUILTIN_BRANDS,
  COMPOSITIONS,
  DESIGN_TYPES,
  DETAIL,
  EMPTY_INPUT,
  LIGHTING,
  LOGO_PLACEMENTS,
  MODE_HINT,
  MODE_LABEL,
  OFFICIAL_LOGO,
  PLATFORMS,
  RATIOS,
  STYLES,
  TEXT_PLACEMENTS,
  type Opt,
} from '../aistudio/catalog';
import { buildPrompt, ensureLogo, promptAsText, resolveBrand } from '../aistudio/engine';
import { deleteBrand, deletePrompt, duplicatePrompt, listBrands, saveBrand, savePrompt } from '../aistudio/store';
import type { BrandKit, DetailLevel, PromptInput, PromptMode, PromptOutput, SavedPrompt } from '../aistudio/types';

type Tab = 'create' | 'library' | 'brands' | 'compose';

/** Copies text; falls back to a hidden textarea where the Clipboard API is unavailable (older WebViews, http). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const t = document.createElement('textarea');
    t.value = text;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch {
    return false;
  }
}

const fileName = (title: string) => `${title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 60) || 'prompt'}.txt`;

export function AiStudioPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (['library', 'brands', 'compose'] as const).find((t) => t === params.get('tab')) ?? 'create';
  const setTab = (t: Tab) => setParams(t === 'create' ? {} : { tab: t }, { replace: true });
  const prompts = useLiveQuery(() => db.prompts.toArray(), []);
  const brands = useLiveQuery(() => listBrands(db), []);
  const [loaded, setLoaded] = useState<SavedPrompt | null>(null);

  return (
    <div className="page" data-testid="page-ai-studio">
      <PageHeader
        title="IBRAHI8M AI Design Studio"
        subtitle="يحوّل فكرتك (بالعربية أو الإنجليزية) إلى برومبت تصميم احترافي بالإنجليزية مع شرح عربي. يعمل بقواعد محلية دون إنترنت."
      />
      <div className="ai-honest" role="note" data-testid="ai-honest">
        <Wand2 size={18} aria-hidden="true" />
        <p>
          هذا الاستوديو <strong>يكتب نص البرومبت فقط</strong> بمحرك قواعد داخل التطبيق: لا يولّد صورًا، ولا يرسم شعارات، ولا يتصل بأي خدمة ذكاء اصطناعي، ولا يحتاج مفاتيح. انسخ البرومبت إلى أداة توليد الصور التي تختارها.
        </p>
      </div>
      <div className="tabs" role="tablist" aria-label="أقسام الاستوديو">
        <button type="button" role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'is-active' : ''} onClick={() => setTab('create')} data-testid="ai-tab-create">
          إنشاء برومبت
        </button>
        <button type="button" role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? 'is-active' : ''} onClick={() => setTab('library')} data-testid="ai-tab-library">
          المكتبة <span className="tab-count">{prompts?.length ?? 0}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'brands'} className={tab === 'brands' ? 'is-active' : ''} onClick={() => setTab('brands')} data-testid="ai-tab-brands">
          الهويات
        </button>
        <button type="button" role="tab" aria-selected={tab === 'compose'} className={tab === 'compose' ? 'is-active' : ''} onClick={() => setTab('compose')} data-testid="ai-tab-compose">
          تركيب الشعار
        </button>
      </div>
      {tab === 'create' && <Creator brands={brands ?? BUILTIN_BRANDS} loaded={loaded} onClearLoaded={() => setLoaded(null)} />}
      {tab === 'library' && (
        <PromptLibrary
          prompts={prompts}
          onOpen={(p) => {
            setLoaded(p);
            setTab('create');
          }}
        />
      )}
      {tab === 'brands' && <Brands brands={brands} />}
      {tab === 'compose' && <LogoComposer />}
    </div>
  );
}

/* ───────── create ───────── */

function Select({ label, value, options, onChange, testId }: { label: string; value: string; options: Opt[]; onChange: (v: string) => void; testId: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.ar}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextIn({ label, value, onChange, testId, placeholder, multiline, ltr, hint }: { label: string; value: string; onChange: (v: string) => void; testId: string; placeholder?: string; multiline?: boolean; ltr?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className="input textarea" rows={3} maxLength={3000} value={value} placeholder={placeholder} dir={ltr ? 'ltr' : undefined} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
      ) : (
        <input id={id} className="input" value={value} maxLength={1500} placeholder={placeholder} dir={ltr ? 'ltr' : undefined} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function Creator({ brands, loaded, onClearLoaded }: { brands: BrandKit[]; loaded: SavedPrompt | null; onClearLoaded: () => void }) {
  const toast = useToast();
  const [input, setInput] = useState<PromptInput>(EMPTY_INPUT);
  const [mode, setMode] = useState<PromptMode>('pro');
  const [brandId, setBrandId] = useState<string>(BUILTIN_BRANDS[0].id);
  const [variant, setVariant] = useState(0);
  const [out, setOut] = useState<PromptOutput | null>(null);
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [ideaError, setIdeaError] = useState(false);
  const set = <K extends keyof PromptInput>(k: K, v: PromptInput[K]) => setInput((p) => ({ ...p, [k]: v }));

  // A prompt opened from the library fills the form and the result; «حفظ» then updates it.
  useEffect(() => {
    if (!loaded) return;
    setInput(loaded.input);
    setMode(loaded.mode);
    setBrandId(loaded.brandId ?? BUILTIN_BRANDS[0].id);
    setOut(loaded.output);
    // prompts saved before 1.3.0 get the mandatory logo block back when opened
    setPrompt(ensureLogo(loaded.editedPrompt || loaded.output.promptEn, loaded.input.logoPlacement));
    setTitle(loaded.title);
    setSavedId(loaded.id);
    setVariant(0);
  }, [loaded]);

  // The identity (and its logo) applies to every prompt; its full rules only in «هوية العلامة».
  const brand = resolveBrand(brandId, brands);
  const play = useSfx();
  const [fresh, setFresh] = useState(0);
  const generate = (v = variant) => {
    if (!input.idea.trim() && !input.subjectEn.trim()) {
      setIdeaError(true);
      document.getElementById('ai-idea')?.focus();
      return;
    }
    setIdeaError(false);
    const o = buildPrompt(input, mode, brand, v);
    setOut(o);
    setPrompt(o.promptEn);
    setFresh((n) => n + 1);
    play('prompt');
    if (!title) setTitle((input.idea || input.subjectEn).trim().slice(0, 60));
    requestAnimationFrame(() => document.getElementById('ai-output')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  const edited = !!out && prompt !== out.promptEn;
  /** what leaves the studio: the prompt as shown, with the mandatory logo block guaranteed */
  const finalPrompt = () => ensureLogo(prompt, input.logoPlacement);
  const save = async (asNew = false) => {
    if (!out) return;
    try {
      const row = await savePrompt(db, { id: asNew ? undefined : (savedId ?? undefined), title: title || 'برومبت بلا عنوان', mode, brandId: brandId || null, input, output: out, editedPrompt: edited ? finalPrompt() : '' });
      if (edited && finalPrompt() !== prompt) setPrompt(finalPrompt());
      setSavedId(row.id);
      toast({ message: `حُفظ «${row.title}» في مكتبة البرومبتات على هذا الجهاز.`, sound: 'save' });
    } catch (e) {
      toast({ message: `تعذّر الحفظ: ${errorMessage(e)}`, tone: 'danger' });
    }
  };

  const reset = () => {
    setInput(EMPTY_INPUT);
    setOut(null);
    setPrompt('');
    setTitle('');
    setSavedId(null);
    setVariant(0);
    onClearLoaded();
  };

  return (
    <div className="ai-grid">
      <form
        className="card ai-form"
        onSubmit={(e) => {
          e.preventDefault();
          setVariant(0);
          generate(0);
        }}
        data-testid="ai-form"
      >
        {savedId && (
          <p className="muted ai-editing" data-testid="ai-editing">
            تعدّل برومبتًا محفوظًا: «{title}».{' '}
            <button type="button" className="link-btn" onClick={reset}>
              برومبت جديد
            </button>
          </p>
        )}
        <div className={`field ${ideaError ? 'has-error' : ''}`}>
          <label className="field-label" htmlFor="ai-idea">
            1. فكرة التصميم <span className="req" aria-hidden="true">*</span>
          </label>
          <textarea id="ai-idea" className="input textarea" rows={3} maxLength={3000} value={input.idea} placeholder="مثال: طالب يتعلم الأمن الرقمي على حاسوبه في غرفة صف حديثة" onChange={(e) => set('idea', e.target.value)} data-testid="ai-idea" aria-invalid={ideaError} />
          {ideaError && (
            <span className="field-error" role="alert">
              اكتب فكرة التصميم أولًا.
            </span>
          )}
        </div>
        <Select
          label="2. نوع التصميم"
          value={input.type}
          options={DESIGN_TYPES}
          onChange={(v) => {
            const t = DESIGN_TYPES.find((x) => x.value === v);
            setInput((p) => ({ ...p, type: v, ratio: t?.ratio ?? p.ratio }));
          }}
          testId="ai-type"
        />
        <div className="field">
          <span className="field-label">3. المقاس</span>
          <div className="ratio-row" role="radiogroup" aria-label="المقاس">
            {RATIOS.map((r) => (
              <button key={r.value} type="button" role="radio" aria-checked={input.ratio === r.value} className={`ratio-chip ${input.ratio === r.value ? 'is-active' : ''}`} onClick={() => set('ratio', r.value)} data-testid={`ai-ratio-${r.value}`}>
                <span className={`ratio-shape r-${r.value.replace(':', '-')}`} aria-hidden="true" />
                <span>{r.ar}</span>
              </button>
            ))}
          </div>
          <span className="field-hint">المقاس يصف التصميم المطلوب في البرومبت فقط؛ لا تُنشأ أي صورة هنا.</span>
        </div>
        <TextIn label="4. النصوص المطلوبة داخل التصميم (اختياري)" multiline value={input.texts} onChange={(v) => set('texts', v)} testId="ai-texts" hint="نص في كل سطر، يُطلب كما هو حرفيًا." />
        <div className="ai-logo-note" data-testid="ai-logo-note">
          <img src={`${import.meta.env.BASE_URL}brand/${OFFICIAL_LOGO.file}`} alt="" className="ai-logo-thumb" />
          <span>
            <strong>الشعار إلزامي:</strong> كل برومبت ينتهي تلقائيًا بتعليمات شعار <bdi>{OFFICIAL_LOGO.name}</bdi> الأصلي ({LOGO_PLACEMENTS.find((x) => x.value === input.logoPlacement)?.ar ?? 'موضع مناسب واضح'})، ولا يمكن إلغاؤها. ملف الشعار:{' '}
            <a href={`${import.meta.env.BASE_URL}brand/${OFFICIAL_LOGO.file}`} download={OFFICIAL_LOGO.file} data-testid="ai-logo-download">
              SVG
            </a>{' '}
            ·{' '}
            <a href={`${import.meta.env.BASE_URL}brand/${OFFICIAL_LOGO.png}`} download={OFFICIAL_LOGO.png} data-testid="ai-logo-download-png">
              PNG
            </a>
            . بعد التوليد ركّبه بدقة من تبويب «تركيب الشعار».
          </span>
        </div>
        <details className="ai-more" data-testid="ai-advanced">
          <summary data-testid="ai-advanced-toggle">إعدادات متقدمة</summary>
          <div className="ai-more-body">
            <div className="field">
              <span className="field-label">الوضع</span>
              <div className="segmented" role="radiogroup" aria-label="وضع الإنشاء">
                {(Object.keys(MODE_LABEL) as PromptMode[]).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'is-active' : ''} onClick={() => setMode(m)} data-testid={`ai-mode-${m}`}>
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
              <span className="field-hint">{MODE_HINT[mode]}</span>
            </div>
            <div className="form-row">
              <div className="field">
                <label className="field-label" htmlFor="ai-brand">
                  الهوية (الألوان والقواعد)
                </label>
                <select id="ai-brand" className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)} data-testid="ai-brand">
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className="field-hint">{brands.find((b) => b.id === brandId)?.description} الشعار الإلزامي في كل الأحوال: {OFFICIAL_LOGO.name}.</span>
              </div>
              <Select label="مكان الشعار" value={input.logoPlacement} options={LOGO_PLACEMENTS} onChange={(v) => set('logoPlacement', v)} testId="ai-logo-place" />
            </div>
            <TextIn label="وصف الفكرة بالإنجليزية (أدق من الترجمة التقريبية)" value={input.subjectEn} onChange={(v) => set('subjectEn', v)} testId="ai-subject-en" placeholder="a student learning digital safety on a laptop" ltr />
            <div className="form-row">
              <Select label="مكان النص" value={input.textPlacement} options={TEXT_PLACEMENTS} onChange={(v) => set('textPlacement', v)} testId="ai-text-place" />
              <Select label="الأسلوب" value={input.style} options={STYLES} onChange={(v) => set('style', v)} testId="ai-style" />
            </div>
            <div className="form-row">
              <TextIn label="الهدف" value={input.goal} onChange={(v) => set('goal', v)} testId="ai-goal" placeholder="توعية، إعلان، شرح…" />
              <TextIn label="الجمهور" value={input.audience} onChange={(v) => set('audience', v)} testId="ai-audience" placeholder="طلاب، معلمون، عائلات…" />
            </div>
            <div className="form-row">
              <div className="field">
                <label className="field-label" htmlFor="ai-platform">
                  المنصة
                </label>
                <input id="ai-platform" className="input" list="ai-platforms" value={input.platform} maxLength={60} onChange={(e) => set('platform', e.target.value)} data-testid="ai-platform" />
                <datalist id="ai-platforms">
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <TextIn label="الألوان" value={input.colors} onChange={(v) => set('colors', v)} testId="ai-colors" placeholder="أزرق كهربائي، فضي، #0B0D12" />
            </div>
            <div className="form-row">
              <Select label="الإضاءة" value={input.lighting} options={LIGHTING} onChange={(v) => set('lighting', v)} testId="ai-lighting" />
              <Select label="الخلفية" value={input.background} options={BACKGROUNDS} onChange={(v) => set('background', v)} testId="ai-background" />
            </div>
            <div className="form-row">
              <Select label="زاوية التصوير" value={input.angle} options={ANGLES} onChange={(v) => set('angle', v)} testId="ai-angle" />
              <Select label="التكوين" value={input.composition} options={COMPOSITIONS} onChange={(v) => set('composition', v)} testId="ai-composition" />
            </div>
            <Select label="مستوى التفاصيل" value={input.detail} options={Object.values(DETAIL)} onChange={(v) => set('detail', v as DetailLevel)} testId="ai-detail" />
            <TextIn label="عناصر مطلوبة" value={input.required} onChange={(v) => set('required', v)} testId="ai-required" placeholder="افصل بفاصلة" />
            <TextIn label="عناصر يجب تجنبها" value={input.avoid} onChange={(v) => set('avoid', v)} testId="ai-avoid" placeholder="افصل بفاصلة" />
          </div>
        </details>
        <div className="ai-form-actions">
          <button type="submit" className="btn btn-primary" data-testid="ai-generate">
            <Sparkles size={18} aria-hidden="true" /> 5. إنشاء البرومبت
          </button>
          <button type="button" className="btn btn-ghost" onClick={reset}>
            <RotateCcw size={16} aria-hidden="true" /> مسح
          </button>
        </div>
      </form>

      <section key={fresh} className={`card ai-output ${fresh ? 'is-fresh' : ''}`} id="ai-output" aria-label="النتيجة" data-testid="ai-output">
        {!out ? (
          <div className="empty">
            <p>اكتب الفكرة واضغط «إنشاء البرومبت». تظهر النتيجة هنا.</p>
          </div>
        ) : (
          <>
            {out.warnings.length > 0 && (
              <ul className="ai-warnings" data-testid="ai-warnings">
                {out.warnings.map((w, i) => (
                  <li key={i}>
                    <AlertTriangle size={16} aria-hidden="true" /> {w}
                  </li>
                ))}
              </ul>
            )}
            <div className="ai-meta">
              <Pill tone="accent">{out.typeLabel}</Pill>
              <Pill>{out.ratio}</Pill>
              <Pill>{MODE_LABEL[mode]}</Pill>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="ai-prompt">
                البرومبت بالإنجليزية {edited && <span className="muted">(عدّلته)</span>}
              </label>
              <textarea id="ai-prompt" className="input textarea ai-prompt" dir="ltr" rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} data-testid="ai-prompt" />
            </div>
            <div className="ai-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => toast(await copyText(finalPrompt()) ? { message: 'نُسخ البرومبت كاملًا مع تعليمات الشعار.', sound: 'copy' } : { message: 'تعذّر النسخ تلقائيًا: حدّد النص وانسخه يدويًا.', tone: 'danger' })}
                data-testid="ai-copy"
              >
                <Copy size={16} aria-hidden="true" /> نسخ
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const v = variant + 1;
                  setVariant(v);
                  generate(v);
                }}
                data-testid="ai-regenerate"
              >
                <RefreshCw size={16} aria-hidden="true" /> إعادة التوليد
              </button>
              {edited && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrompt(out.promptEn)}>
                  <RotateCcw size={16} aria-hidden="true" /> النص المولّد
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={() => {
                  download(new Blob([promptAsText(title || 'برومبت', out, finalPrompt())], { type: 'text/plain;charset=utf-8' }), fileName(title));
                  play('export');
                }} data-testid="ai-download">
                <Download size={16} aria-hidden="true" /> تنزيل TXT
              </button>
            </div>
            <div className="field">
              <span className="field-label">البرومبت السلبي (Negative prompt)</span>
              <p className="ai-mono" dir="ltr" data-testid="ai-negative">
                {out.negative}
              </p>
            </div>
            <div className="field">
              <span className="field-label">الشعار</span>
              <p className="ai-mono" dir="ltr" data-testid="ai-logo-rules">
                {out.logoRules}
              </p>
            </div>
            {(out.colors || out.texts.length > 0) && (
              <dl className="kv">
                {out.colors && (
                  <>
                    <dt>الألوان</dt>
                    <dd>{out.colors}</dd>
                  </>
                )}
                {out.texts.length > 0 && (
                  <>
                    <dt>النصوص</dt>
                    <dd>{out.texts.join(' | ')}</dd>
                  </>
                )}
              </dl>
            )}
            <details className="ai-explain" open>
              <summary>الشرح بالعربية</summary>
              <div className="pre" data-testid="ai-explanation">
                {out.explanationAr}
              </div>
            </details>
            <div className="ai-save-row">
              <label className="sr-only" htmlFor="ai-title">
                عنوان البرومبت
              </label>
              <input id="ai-title" className="input" value={title} maxLength={160} placeholder="عنوان للحفظ في المكتبة" onChange={(e) => setTitle(e.target.value)} data-testid="ai-title" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} data-testid="ai-save">
                <Save size={16} aria-hidden="true" /> {savedId ? 'حفظ التعديلات' : 'حفظ في المكتبة'}
              </button>
              {savedId && (
                <button type="button" className="btn btn-sm" onClick={() => void save(true)}>
                  <CopyPlus size={16} aria-hidden="true" /> حفظ كنسخة جديدة
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* ───────── library ───────── */

function PromptLibrary({ prompts, onOpen }: { prompts: SavedPrompt[] | undefined; onOpen: (p: SavedPrompt) => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [confirm, setConfirm] = useState<SavedPrompt | null>(null);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (prompts ?? [])
      .filter((p) => !type || p.type === type)
      .filter((p) => !n || [p.title, p.input.idea, p.input.subjectEn, p.output.promptEn, p.editedPrompt].join(' ').toLowerCase().includes(n))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [prompts, q, type]);

  if (prompts === undefined) return <p className="muted">جارٍ التحميل…</p>;
  return (
    <section className="card" data-testid="ai-library">
      <div className="search-row">
        <label className="search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">بحث في البرومبتات</span>
          <input type="search" className="search-input" placeholder="ابحث في العناوين والأفكار والبرومبتات…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="ai-lib-search" />
        </label>
        <label className="filter">
          <span className="sr-only">نوع التصميم</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)} data-testid="ai-lib-type">
            <option value="">كل الأنواع</option>
            {DESIGN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.ar}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!prompts.length ? (
        <div className="empty">
          <BookMarked size={28} aria-hidden="true" />
          <p>لا توجد برومبتات محفوظة بعد. أنشئ برومبتًا واضغط «حفظ في المكتبة».</p>
        </div>
      ) : !shown.length ? (
        <div className="empty">
          <p>لا توجد نتائج مطابقة.</p>
        </div>
      ) : (
        <ul className="ai-lib-list">
          {shown.map((p) => {
            const text = ensureLogo(p.editedPrompt || p.output.promptEn, p.input.logoPlacement);
            return (
              <li key={p.id} className="ai-lib-item" data-testid="ai-lib-item">
                <div className="ai-lib-main">
                  <strong>{p.title}</strong>
                  <span className="muted">
                    {DESIGN_TYPES.find((t) => t.value === p.type)?.ar ?? p.type} · {MODE_LABEL[p.mode]} · عُدّل {relativeTime(p.updatedAt)}
                  </span>
                  <p className="ai-lib-snippet" dir="ltr">
                    {text.slice(0, 180)}
                    {text.length > 180 ? '…' : ''}
                  </p>
                </div>
                <div className="ai-lib-actions">
                  <button type="button" className="btn btn-sm" onClick={() => onOpen(p)} data-testid="ai-lib-open">
                    <FolderOpen size={16} aria-hidden="true" /> فتح وتعديل
                  </button>
                  <button type="button" className="icon-btn" aria-label={`نسخ ${p.title}`} onClick={async () => toast((await copyText(text)) ? { message: 'نُسخ البرومبت.' } : { message: 'تعذّر النسخ تلقائيًا.', tone: 'danger' })}>
                    <Copy size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`تكرار ${p.title}`}
                    onClick={async () => {
                      try {
                        await duplicatePrompt(db, p.id);
                        toast({ message: 'أُنشئت نسخة.' });
                      } catch (e) {
                        toast({ message: errorMessage(e), tone: 'danger' });
                      }
                    }}
                    data-testid="ai-lib-duplicate"
                  >
                    <CopyPlus size={18} />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`تنزيل ${p.title}`} onClick={() => download(new Blob([promptAsText(p.title, p.output, text)], { type: 'text/plain;charset=utf-8' }), fileName(p.title))}>
                    <Download size={18} />
                  </button>
                  <button type="button" className="icon-btn danger" aria-label={`حذف ${p.title}`} onClick={() => setConfirm(p)} data-testid="ai-lib-delete">
                    <Trash2 size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!confirm}
        title="حذف البرومبت"
        message={<p>سيُحذف «<strong>{confirm?.title}</strong>» من مكتبة البرومبتات على هذا الجهاز.</p>}
        confirmLabel="حذف"
        testId="confirm-ai-delete"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            const removed = await deletePrompt(db, confirm.id);
            setConfirm(null);
            toast({ message: `حُذف «${confirm.title}».`, action: removed ? { label: 'تراجع', run: async () => void (await db.prompts.put(removed)) } : undefined });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </section>
  );
}

/* ───────── identities ───────── */

const BRAND_FIELDS: { k: keyof Omit<BrandKit, 'id' | 'createdAt' | 'updatedAt'>; label: string; multiline?: boolean; ltr?: boolean }[] = [
  { k: 'name', label: 'اسم الهوية' },
  { k: 'description', label: 'وصف مختصر', multiline: true },
  { k: 'colors', label: 'الألوان (أسماء أو رموز Hex، افصل بفاصلة)', ltr: true },
  { k: 'fonts', label: 'طابع الخطوط', ltr: true },
  { k: 'tone', label: 'النبرة', ltr: true },
  { k: 'rules', label: 'قواعد التصميم', multiline: true, ltr: true },
  { k: 'logoRules', label: 'قواعد الشعار', multiline: true, ltr: true },
  { k: 'avoid', label: 'ممنوعات', multiline: true, ltr: true },
];

function Brands({ brands }: { brands: BrandKit[] | undefined }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Partial<BrandKit> | null>(null);
  const [confirm, setConfirm] = useState<BrandKit | null>(null);
  const builtin = (id: string) => BUILTIN_BRANDS.some((b) => b.id === id);
  if (!brands) return <p className="muted">جارٍ التحميل…</p>;
  return (
    <section className="card" data-testid="ai-brands">
      <div className="lessons-head">
        <h2 className="card-title">
          <Palette size={18} aria-hidden="true" /> الهويات المحفوظة
        </h2>
        <button type="button" className="btn btn-sm" onClick={() => setEditing({ name: '', description: '', colors: '', fonts: '', tone: '', rules: '', logoRules: '', avoid: '' })} data-testid="ai-brand-new">
          <Plus size={16} aria-hidden="true" /> هوية جديدة
        </button>
      </div>
      <p className="muted">
        هوية <bdi>IBRAHI8M EDU STUDIO</bdi> وهوية <bdi>IBRAHIM AI UNIVERSE</bdi> منفصلتان، ولكلٍّ قواعدها؛ وضع «هوية العلامة» يطبّق هوية واحدة وينبّه إذا ذكرت الفكرة الهوية الأخرى.
      </p>
      <ul className="ai-lib-list">
        {brands.map((b) => (
          <li key={b.id} className="ai-lib-item" data-testid="ai-brand-item">
            <div className="ai-lib-main">
              <strong>
                <bdi>{b.name}</bdi>
              </strong>
              <span className="muted">{b.description}</span>
              <span className="muted" dir="ltr">
                {b.colors || 'no colours defined yet'}
              </span>
            </div>
            <div className="ai-lib-actions">
              <button type="button" className="btn btn-sm" onClick={() => setEditing(b)} data-testid="ai-brand-edit">
                <Pencil size={16} aria-hidden="true" /> تعديل
              </button>
              {(!builtin(b.id) || b.updatedAt > 0) && (
                <button type="button" className="icon-btn danger" aria-label={builtin(b.id) ? `إعادة ${b.name} إلى الأصل` : `حذف ${b.name}`} onClick={() => setConfirm(b)}>
                  {builtin(b.id) ? <RotateCcw size={18} /> : <Trash2 size={18} />}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <BrandDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSave={async (b) => {
          try {
            await saveBrand(db, b as BrandKit);
            setEditing(null);
            toast({ message: `حُفظت هوية «${b.name}».` });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
      <ConfirmDialog
        open={!!confirm}
        title={confirm && builtin(confirm.id) ? 'إعادة الهوية إلى الأصل' : 'حذف الهوية'}
        message={<p>{confirm && builtin(confirm.id) ? `تُلغى تعديلاتك على «${confirm.name}» وتعود قواعدها الأصلية.` : `ستُحذف هوية «${confirm?.name}». البرومبتات المحفوظة بها تبقى.`}</p>}
        confirmLabel={confirm && builtin(confirm.id) ? 'إعادة' : 'حذف'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          await deleteBrand(db, confirm.id);
          setConfirm(null);
          toast({ message: 'تم.' });
        }}
      />
    </section>
  );
}

function BrandDialog({ value, onClose, onSave }: { value: Partial<BrandKit> | null; onClose: () => void; onSave: (b: Partial<BrandKit>) => Promise<void> }) {
  const [v, setV] = useState<Partial<BrandKit>>({});
  const uid = useId();
  useEffect(() => {
    if (value) setV(value);
  }, [value]);
  return (
    <Dialog
      open={!!value}
      title={value?.id ? 'تعديل الهوية' : 'هوية جديدة'}
      onClose={onClose}
      testId="ai-brand-dialog"
      onSubmit={() => void onSave(v)}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            <X size={16} aria-hidden="true" /> إلغاء
          </button>
          <button type="submit" className="btn btn-primary" disabled={!(v.name ?? '').trim()} data-testid="ai-brand-save">
            حفظ
          </button>
        </>
      }
    >
      <div className="form-grid">
        {BRAND_FIELDS.map((f) => (
          <div key={f.k} className="field">
            <label className="field-label" htmlFor={`${uid}-${f.k}`}>
              {f.label}
            </label>
            {f.multiline ? (
              <textarea id={`${uid}-${f.k}`} className="input textarea" rows={2} dir={f.ltr ? 'auto' : undefined} value={String(v[f.k] ?? '')} onChange={(e) => setV((p) => ({ ...p, [f.k]: e.target.value }))} data-testid={`ai-brand-${f.k}`} />
            ) : (
              <input id={`${uid}-${f.k}`} className="input" dir={f.ltr ? 'auto' : undefined} value={String(v[f.k] ?? '')} onChange={(e) => setV((p) => ({ ...p, [f.k]: e.target.value }))} data-testid={`ai-brand-${f.k}`} />
            )}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
