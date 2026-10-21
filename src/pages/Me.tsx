import { useEffect, useId, useState } from 'react';
import { Briefcase, FileUser, GraduationCap, Languages, Pencil, Plus, Printer, RotateCcw, Save, Trash2, UserRound, Wrench, X } from 'lucide-react';
import { useSettings } from '../app/SettingsContext';
import { useToast } from '../app/Toasts';
import { errorMessage } from '../app/data';
import { UserAvatar } from '../components/AppShell';
import { ConfirmDialog } from '../components/Dialog';
import { Card, PageHeader } from '../components/ui';
import { DEFAULT_CV, displayName, NOT_SET, type CvData, type Settings } from '../db/settings';

/**
 * 1.1.0 — «صفحتي»: the user's profile (name in the greeting) and the CV.
 * Everything is stored in the local settings table; nothing is published or sent anywhere.
 */
export function MePage() {
  const { settings } = useSettings();
  const name = displayName(settings);
  return (
    <div className="page" data-testid="page-me">
      <div className="no-print">
        <PageHeader title="صفحتي" subtitle="ملفك الشخصي وسيرتك الذاتية. تُحفظ على هذا الجهاز فقط، ولا تُنشر في أي مكان." />
        <Card title="الملف الشخصي" icon={UserRound} testId="profile-card">
          <div className="profile-head">
            <UserAvatar name={name} size="lg" />
            <div>
              <strong className="profile-name" data-testid="me-name">
                {name || 'لم تكتب اسمك بعد'}
              </strong>
              <span className="muted">{[settings.userRole, settings.userOrganization].filter(Boolean).join(' · ') || 'يظهر اسمك في الترحيب وبطاقة المستخدم.'}</span>
            </div>
          </div>
          <div className="field-grid">
            <ProfileField k="userName" label="الاسم (يظهر في الترحيب)" placeholder="اكتب اسمك" max={80} />
            <ProfileField k="userRole" label="الصفة" placeholder="مثل: معلم، أو طالب ماجستير" max={80} />
            <ProfileField k="userOrganization" label="المؤسسة" placeholder="مثل: اسم المدرسة أو الجامعة" max={160} />
          </div>
        </Card>
      </div>
      <CvSection />
    </div>
  );
}

function ProfileField({ k, label, placeholder, max }: { k: 'userName' | 'userRole' | 'userOrganization'; label: string; placeholder: string; max: number }) {
  const { settings, update } = useSettings();
  const toast = useToast();
  const id = useId();
  const [value, setValue] = useState(settings[k]);
  const [saved, setSaved] = useState(false);
  // For data from before 1.1.0, the name field starts from the full name written in the old settings.
  const current = k === 'userName' ? displayName(settings) : settings[k];
  useEffect(() => setValue(current), [current]);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        maxLength={max}
        data-testid={`profile-${k}`}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={async () => {
          const v = value.trim();
          if (v === settings[k]) return;
          try {
            await update(k, v as Settings[typeof k]);
            setSaved(true);
          } catch (e) {
            toast({ message: `تعذّر الحفظ: ${errorMessage(e)}`, tone: 'danger' });
          }
        }}
      />
      {saved && <span className="field-hint ok">تم الحفظ</span>}
    </div>
  );
}

/* ───────── CV ───────── */

const LISTS: { key: 'education' | 'experience' | 'courses' | 'techSkills' | 'proSkills'; label: string }[] = [
  { key: 'education', label: 'المؤهلات العلمية' },
  { key: 'experience', label: 'الخبرات العملية' },
  { key: 'courses', label: 'الدورات التدريبية' },
  { key: 'techSkills', label: 'المهارات التقنية' },
  { key: 'proSkills', label: 'المهارات المهنية والإدارية' },
];

const isUnset = (v: string) => !v.trim() || v.trim() === NOT_SET;

function CvSection() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvData>(settings.cv);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(settings.cv);
  }, [settings.cv, editing]);

  const save = async () => {
    const clean: CvData = {
      ...draft,
      ...Object.fromEntries((['name', 'title', 'residence', 'birthYear', 'phone', 'email', 'references'] as const).map((k) => [k, draft[k].trim().slice(0, 300)])),
      summary: draft.summary.trim().slice(0, 3000),
      ...Object.fromEntries(LISTS.map(({ key }) => [key, draft[key].map((x) => x.trim().slice(0, 300)).filter(Boolean).slice(0, 40)])),
      languages: draft.languages.map((l) => ({ name: l.name.trim().slice(0, 60), level: l.level.trim().slice(0, 60) })).filter((l) => l.name).slice(0, 12),
    } as CvData;
    setSaving(true);
    try {
      await update('cv', clean);
      setEditing(false);
      toast({ message: 'حُفظت السيرة الذاتية على هذا الجهاز.', sound: 'save' });
    } catch (e) {
      toast({ message: `تعذّر حفظ السيرة الذاتية: ${errorMessage(e)}`, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const cv = editing ? draft : settings.cv;
  return (
    <section className="card cv-card" aria-labelledby="cv-h" data-testid="cv">
      <div className="lessons-head no-print">
        <h2 className="card-title" id="cv-h">
          <FileUser size={18} aria-hidden="true" /> السيرة الذاتية
        </h2>
        <div className="cv-actions">
          {editing ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} data-testid="cv-cancel">
                <X size={16} aria-hidden="true" /> إلغاء
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save()} data-testid="cv-save">
                <Save size={16} aria-hidden="true" /> حفظ
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} data-testid="cv-edit">
                <Pencil size={16} aria-hidden="true" /> تعديل
              </button>
              <button type="button" className="btn btn-sm" onClick={() => window.print()} data-testid="cv-print">
                <Printer size={16} aria-hidden="true" /> طباعة أو حفظ PDF
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)} data-testid="cv-reset">
                <RotateCcw size={16} aria-hidden="true" /> البيانات الأصلية
              </button>
            </>
          )}
        </div>
      </div>
      {!editing && <p className="muted no-print">للحفظ PDF: «طباعة أو حفظ PDF» ثم اختر «حفظ بتنسيق PDF» في نافذة الطباعة. تُطبع السيرة وحدها دون قوائم التطبيق.</p>}

      {editing ? <CvEditor cv={draft} onChange={setDraft} /> : <CvSheet cv={cv} />}

      <ConfirmDialog
        open={confirmReset}
        title="إعادة السيرة الذاتية إلى البيانات الأصلية؟"
        message="تُستبدل تعديلاتك على السيرة الذاتية بالبيانات الأصلية التي بدأ بها التطبيق. لا يتأثر أي شيء آخر."
        confirmLabel="نعم، أعِدها"
        testId="confirm-cv-reset"
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          try {
            await update('cv', DEFAULT_CV);
            toast({ message: 'أُعيدت السيرة الذاتية إلى البيانات الأصلية.' });
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </section>
  );
}

/** The CV as read and printed. Empty fields are not shown; «غير محدد حاليًا» is shown as written. */
function CvSheet({ cv }: { cv: CvData }) {
  const contact: [string, string][] = [
    ['مكان الإقامة', cv.residence],
    ['سنة الميلاد', cv.birthYear],
    ['الهاتف', cv.phone],
    ['البريد الإلكتروني', cv.email],
  ];
  return (
    <article className="cv-sheet" data-testid="cv-sheet">
      <header className="cv-head">
        <h1 className="cv-name" data-testid="cv-name">
          {cv.name}
        </h1>
        {cv.title && <p className="cv-title">{cv.title}</p>}
        <dl className="cv-contact">
          {contact
            .filter(([, v]) => v.trim())
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={isUnset(v) ? 'muted' : ''} dir={k === 'البريد الإلكتروني' || k === 'الهاتف' ? (isUnset(v) ? undefined : 'ltr') : undefined}>
                  {v}
                </dd>
              </div>
            ))}
        </dl>
      </header>
      {cv.summary && (
        <section className="cv-sec">
          <h2>
            <UserRound size={16} aria-hidden="true" /> الملخص المهني
          </h2>
          <p>{cv.summary}</p>
        </section>
      )}
      {LISTS.map(({ key, label }) =>
        cv[key].length ? (
          <section key={key} className="cv-sec" data-testid={`cv-${key}`}>
            <h2>
              {key === 'education' ? <GraduationCap size={16} aria-hidden="true" /> : key === 'experience' ? <Briefcase size={16} aria-hidden="true" /> : <Wrench size={16} aria-hidden="true" />} {label}
            </h2>
            <ul className={key === 'techSkills' ? 'cv-chips' : 'cv-list'}>
              {cv[key].map((x, i) => (
                <li key={i}>
                  <bdi>{x}</bdi>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {cv.languages.length > 0 && (
        <section className="cv-sec" data-testid="cv-languages">
          <h2>
            <Languages size={16} aria-hidden="true" /> اللغات
          </h2>
          <ul className="cv-list">
            {cv.languages.map((l, i) => (
              <li key={i}>
                <strong>{l.name}</strong>
                {l.level ? `: ${l.level}` : <span className="muted no-print"> (المستوى غير محدد؛ أضفه من «تعديل»)</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {cv.references && (
        <section className="cv-sec">
          <h2>المراجع</h2>
          <p>{cv.references}</p>
        </section>
      )}
    </article>
  );
}

function CvEditor({ cv, onChange }: { cv: CvData; onChange: (cv: CvData) => void }) {
  const uid = useId();
  const set = <K extends keyof CvData>(k: K, v: CvData[K]) => onChange({ ...cv, [k]: v });
  const text = (k: 'name' | 'title' | 'residence' | 'birthYear' | 'phone' | 'email' | 'references', label: string, hint?: string) => (
    <div className="field">
      <label className="field-label" htmlFor={`${uid}-${k}`}>
        {label}
      </label>
      <input id={`${uid}-${k}`} className="input" value={cv[k]} maxLength={300} onChange={(e) => set(k, e.target.value)} data-testid={`cv-in-${k}`} />
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
  return (
    <div className="cv-editor stack" data-testid="cv-editor">
      <div className="field-grid">
        {text('name', 'الاسم')}
        {text('title', 'المسمى المهني')}
        {text('residence', 'مكان الإقامة')}
        {text('birthYear', 'سنة الميلاد')}
        {text('phone', 'الهاتف', `اكتب «${NOT_SET}» إن لم يُحدَّد.`)}
        {text('email', 'البريد الإلكتروني', `اكتب «${NOT_SET}» إن لم يُحدَّد.`)}
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${uid}-summary`}>
          الملخص المهني
        </label>
        <textarea id={`${uid}-summary`} className="input textarea" rows={5} maxLength={3000} value={cv.summary} onChange={(e) => set('summary', e.target.value)} data-testid="cv-in-summary" />
      </div>
      {LISTS.map(({ key, label }) => (
        <div key={key} className="field">
          <label className="field-label" htmlFor={`${uid}-${key}`}>
            {label}
          </label>
          <textarea
            id={`${uid}-${key}`}
            className="input textarea"
            rows={Math.max(3, cv[key].length + 1)}
            value={cv[key].join('\n')}
            onChange={(e) => set(key, e.target.value.split('\n'))}
            data-testid={`cv-in-${key}`}
          />
          <span className="field-hint">عنصر في كل سطر.</span>
        </div>
      ))}
      <fieldset className="field">
        <legend className="field-label">اللغات</legend>
        <ul className="cv-lang-edit">
          {cv.languages.map((l, i) => (
            <li key={i} className="form-row">
              <input className="input" aria-label={`اللغة ${i + 1}`} value={l.name} maxLength={60} onChange={(e) => set('languages', cv.languages.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} data-testid="cv-lang-name" />
              <input
                className="input"
                aria-label={`مستوى اللغة ${i + 1}`}
                placeholder="المستوى (مثل: جيد، جيد جدًا…)"
                value={l.level}
                maxLength={60}
                onChange={(e) => set('languages', cv.languages.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))}
                data-testid="cv-lang-level"
              />
              <button type="button" className="icon-btn danger" aria-label={`حذف اللغة ${l.name || i + 1}`} onClick={() => set('languages', cv.languages.filter((_, j) => j !== i))}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm" disabled={cv.languages.length >= 12} onClick={() => set('languages', [...cv.languages, { name: '', level: '' }])}>
          <Plus size={16} aria-hidden="true" /> لغة أخرى
        </button>
      </fieldset>
      {text('references', 'المراجع')}
    </div>
  );
}
