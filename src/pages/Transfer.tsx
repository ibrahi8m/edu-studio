import { isDemoId } from '../demo/content';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileUp, FolderOutput, ShieldCheck, Upload } from 'lucide-react';
import { errorMessage, useAllProjects } from '../app/data';
import { relativeTime } from '../app/format';
import { useToast } from '../app/Toasts';
import { ConfirmDialog } from '../components/Dialog';
import { PageHeader, Pill } from '../components/ui';
import { db } from '../db/db';
import { formatBytes } from '../db/storage';
import { applyImport, planImport, type Choice, type ImportPlan, type ImportResult } from '../transfer/apply';
import { TransferError, type Package } from '../transfer/format';
import { backupDue, download, exportBackupFile, exportProjectFile, openPackageFile, useLastBackup } from '../transfer/service';

const CHOICE_LABEL: Record<Choice, string> = {
  add: 'إضافة إلى هذا الجهاز',
  skip: 'تخطٍّ (إبقاء نسخة الجهاز كما هي)',
  replace: 'استبدال نسخة الجهاز بنسخة الملف',
  copy: 'إضافة نسخة منفصلة',
};

const STATE_LABEL = { none: 'جديد على هذا الجهاز', same: 'موجود على هذا الجهاز', clash: 'بعض بياناته مستخدمة في مشروع آخر هنا' } as const;

const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString('ar', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
};

function useDeviceCounts() {
  return useLiveQuery(async () => {
    let bytes = 0;
    let files = 0;
    await db.assets.each((a) => {
      bytes += a.size;
      files++;
    });
    return {
      projects: await db.projects.count(),
      lessons: await db.lessons.count(),
      quizzes: await db.quizzes.count(),
      attempts: await db.attempts.filter((a) => !a.preview).count(),
      designs: await db.designs.count(),
      library: await db.library.count(),
      files,
      bytes,
    };
  }, []);
}

export function TransferPage() {
  const projects = useAllProjects();
  const counts = useDeviceCounts();
  const last = useLastBackup();
  const toast = useToast();
  const [params] = useSearchParams();
  const uid = useId();
  const [busy, setBusy] = useState<'' | 'backup' | 'project' | 'read' | 'apply'>('');
  const [exportId, setExportId] = useState(params.get('export') ?? '');
  const [withResults, setWithResults] = useState(false);
  const exportRef = useRef<HTMLElement>(null);

  // import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [pkg, setPkg] = useState<Package | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (params.get('export')) exportRef.current?.scrollIntoView({ block: 'start' });
  }, [params]);
  useEffect(() => {
    if (!exportId && projects?.length === 1) setExportId(projects[0].id);
  }, [projects, exportId]);

  // The demo project alone is not the teacher's data: no reminder for it.
  const hasData = !!counts && ((projects ?? []).some((p) => !isDemoId(p.id)) || counts.library > 0);
  const due = backupDue(last, hasData);

  const backup = async () => {
    setBusy('backup');
    try {
      const f = await exportBackupFile();
      download(f.blob, f.name);
      toast({ message: `حُفظت النسخة الاحتياطية «${f.name}» (${formatBytes(f.blob.size)}).`, sound: 'export' });
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy('');
    }
  };

  const exportProject = async () => {
    if (!exportId) return;
    setBusy('project');
    try {
      const f = await exportProjectFile(exportId, withResults);
      download(f.blob, f.name);
      toast({ message: `صُدّر المشروع إلى «${f.name}» (${formatBytes(f.blob.size)}).`, sound: 'export' });
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy('');
    }
  };

  const reset = () => {
    setPkg(null);
    setPlan(null);
    setError('');
    setUnderstood(false);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setResult(null);
    setFileName(file.name);
    setBusy('read');
    try {
      const p = await openPackageFile(file);
      setPkg(p);
      setPlan(await planImport(db, p));
    } catch (e) {
      setError(e instanceof TransferError ? e.message : `تعذّرت قراءة الملف: ${errorMessage(e)}`);
    } finally {
      setBusy('');
    }
  };

  const destructive = plan ? (plan.kind === 'backup' && plan.mode === 'replace-all') || plan.projects.some((p) => p.choice === 'replace') : false;

  const run = async () => {
    if (!pkg || !plan) return;
    setConfirm(false);
    setBusy('apply');
    try {
      const r = await applyImport(db, pkg, plan);
      setResult(r);
      reset();
      toast({ message: 'تم الاستيراد.' });
    } catch (e) {
      setError(`لم يُستورد شيء، وبقيت بيانات الجهاز كما كانت. السبب: ${errorMessage(e)}`);
    } finally {
      setBusy('');
    }
  };

  const setChoice = (id: string, choice: Choice) => setPlan((p) => (p ? { ...p, projects: p.projects.map((x) => (x.id === id ? { ...x, choice } : x)) } : p));
  const nothingToDo = plan && !(plan.kind === 'backup' && plan.mode === 'replace-all') && plan.projects.every((p) => p.choice === 'skip') && plan.library.every((l) => l.exists) && !(plan.restoreSettings && plan.settings);

  return (
    <div className="page" data-testid="page-backup">
      <PageHeader title="الاستيراد والتصدير" subtitle="ملفات ‎.ibm لنقل المشاريع بين الأجهزة وحفظ نسخة احتياطية. يتم كل شيء على هذا الجهاز، دون إنترنت ودون أي خادم." />

      <section className="card transfer-card" aria-labelledby={`${uid}-b`} data-testid="backup-card">
        <h2 className="card-title" id={`${uid}-b`}>
          <ShieldCheck size={18} aria-hidden="true" /> النسخة الاحتياطية الكاملة
        </h2>
        <p className="muted">ملف واحد فيه كل ما على هذا الجهاز: المشاريع والدروس والأهداف والمحتوى والوسائط والاختبارات ونتائج الطلاب وتقدمهم والتصاميم والمكتبة والإعدادات.</p>
        {counts && (
          <dl className="transfer-stats" data-testid="device-counts">
            <div>
              <dt>المشاريع</dt>
              <dd>{counts.projects}</dd>
            </div>
            <div>
              <dt>الدروس</dt>
              <dd>{counts.lessons}</dd>
            </div>
            <div>
              <dt>الاختبارات</dt>
              <dd>{counts.quizzes}</dd>
            </div>
            <div>
              <dt>محاولات الطلاب</dt>
              <dd>{counts.attempts}</dd>
            </div>
            <div>
              <dt>التصاميم</dt>
              <dd>{counts.designs}</dd>
            </div>
            <div>
              <dt>عناصر المكتبة</dt>
              <dd>{counts.library}</dd>
            </div>
            <div>
              <dt>ملفات الوسائط</dt>
              <dd>
                {counts.files} · {formatBytes(counts.bytes)}
              </dd>
            </div>
          </dl>
        )}
        <p data-testid="last-backup">
          آخر نسخة احتياطية من هذا الجهاز: <strong>{last === undefined ? '…' : last === null ? 'لم تُنشأ بعد' : `${relativeTime(last)} (${new Date(last).toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' })})`}</strong>
        </p>
        {due && (
          <div className="align-alert is-warn" role="status" data-testid="backup-due">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <strong>{last ? `مرّ أكثر من 7 أيام على آخر نسخة احتياطية.` : 'لم تُنشأ أي نسخة احتياطية بعد.'}</strong>
              <p>مسح بيانات المتصفح أو فقدان الجهاز يحذف كل شيء. احفظ نسخة وانقلها إلى جهاز آخر أو ذاكرة USB.</p>
            </div>
          </div>
        )}
        <button type="button" className="btn btn-primary" disabled={!!busy || !hasData} onClick={() => void backup()} data-testid="create-backup">
          <DatabaseBackup size={18} aria-hidden="true" /> {busy === 'backup' ? 'جارٍ الإنشاء…' : 'إنشاء نسخة احتياطية'}
        </button>
      </section>

      <section className="card transfer-card" aria-labelledby={`${uid}-e`} ref={exportRef} data-testid="export-card">
        <h2 className="card-title" id={`${uid}-e`}>
          <FolderOutput size={18} aria-hidden="true" /> تصدير مشروع
        </h2>
        <p className="muted">لنقل مشروع إلى جهاز آخر أو مشاركته مع زميل: دروسه وأهدافه ومحتواه ووسائطه واختباراته وتصاميمه في ملف واحد.</p>
        {projects && projects.length === 0 ? (
          <p className="muted">لا توجد مشاريع على هذا الجهاز.</p>
        ) : (
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-p`}>
                المشروع
              </label>
              <select id={`${uid}-p`} className="input" value={exportId} onChange={(e) => setExportId(e.target.value)} data-testid="export-project-select">
                <option value="">اختر مشروعًا</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={withResults} onChange={(e) => setWithResults(e.target.checked)} data-testid="export-include-results" />
              <span>
                تضمين نتائج الطلاب وتقدمهم في الدروس
                <span className="muted"> — اتركه دون تحديد عند مشاركة المشروع مع غيرك.</span>
              </span>
            </label>
            <button type="button" className="btn btn-primary" disabled={!exportId || !!busy} onClick={() => void exportProject()} data-testid="export-project">
              <Download size={18} aria-hidden="true" /> {busy === 'project' ? 'جارٍ التصدير…' : 'تصدير المشروع'}
            </button>
          </div>
        )}
      </section>

      <section className="card transfer-card" aria-labelledby={`${uid}-i`} data-testid="import-card">
        <h2 className="card-title" id={`${uid}-i`}>
          <FileUp size={18} aria-hidden="true" /> استيراد ملف أو استعادة نسخة احتياطية
        </h2>
        <p className="muted">يُفحص الملف كاملًا أولًا، ثم تُعرض عليك محتوياته، ولا يُكتب شيء قبل موافقتك. لا يُحذف أو يُستبدل أي شيء على هذا الجهاز دون تأكيد صريح.</p>
        <div className="file-pick">
          <input ref={fileRef} id={`${uid}-f`} type="file" accept=".ibm,application/zip,application/vnd.ibrahi8m+zip" className="sr-only-file" onChange={(e) => void pick(e.target.files?.[0])} data-testid="import-file" />
          <label htmlFor={`${uid}-f`} className="btn">
            <Upload size={18} aria-hidden="true" /> اختيار ملف ‎.ibm
          </label>
          {fileName && <span className="muted file-name">{fileName}</span>}
        </div>
        {busy === 'read' && (
          <p role="status" className="muted">
            جارٍ فحص الملف…
          </p>
        )}
        {error && (
          <div className="align-alert is-error" role="alert" data-testid="import-error">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <strong>تعذّر الاستيراد</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {pkg && plan && (
          <div className="import-preview" data-testid="import-preview" data-kind={plan.kind}>
            <h3>
              {plan.kind === 'backup' ? 'نسخة احتياطية كاملة' : 'ملف مشروع'}
              <Pill tone="success" icon={CheckCircle2}>
                سليم
              </Pill>
            </h3>
            <dl className="kv import-meta">
              <dt>أُنشئ</dt>
              <dd>{when(pkg.manifest.exportedAt)}</dd>
              <dt>إصدار التطبيق</dt>
              <dd dir="ltr">{pkg.manifest.appVersion || '—'}</dd>
              <dt>المحتوى</dt>
              <dd data-testid="import-counts">
                {pkg.data.projects.length} مشروع · {pkg.data.lessons.length} درس · {pkg.data.quizzes.length} اختبار · {pkg.data.designs.length} تصميم · {pkg.data.assets.length} ملف وسائط ({formatBytes(pkg.data.assets.reduce((s, a) => s + a.size, 0))})
                {pkg.data.attempts.length > 0 && ` · ${pkg.data.attempts.length} محاولة`}
                {pkg.data.library.length > 0 && ` · ${pkg.data.library.length} عنصر مكتبة`}
              </dd>
            </dl>
            {pkg.warnings.length > 0 && (
              <ul className="import-warnings" data-testid="import-warnings">
                {pkg.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            {plan.kind === 'backup' && (
              <fieldset className="import-mode">
                <legend className="field-label">طريقة الاستعادة</legend>
                <label className={`kind-option ${plan.mode === 'merge' ? 'is-on' : ''}`}>
                  <input type="radio" name={`${uid}-mode`} checked={plan.mode === 'merge'} onChange={() => setPlan({ ...plan, mode: 'merge' })} data-testid="mode-merge" />
                  <span>
                    <strong>دمج مع بيانات هذا الجهاز</strong>
                    <span className="muted">يُضاف ما ليس موجودًا، ويبقى ما على الجهاز كما هو إلا ما تختار استبداله.</span>
                  </span>
                </label>
                <label className={`kind-option ${plan.mode === 'replace-all' ? 'is-on is-danger' : ''}`}>
                  <input type="radio" name={`${uid}-mode`} checked={plan.mode === 'replace-all'} onChange={() => setPlan({ ...plan, mode: 'replace-all' })} data-testid="mode-replace-all" />
                  <span>
                    <strong>استبدال كل بيانات هذا الجهاز بالنسخة الاحتياطية</strong>
                    <span className="muted">يُحذف كل ما على الجهاز الآن، وتحل محله النسخة الاحتياطية كما هي، ومعها الإعدادات.</span>
                  </span>
                </label>
              </fieldset>
            )}

            {plan.kind === 'backup' && plan.mode === 'replace-all' ? (
              <div className="align-alert is-error" role="status" data-testid="replace-all-warning">
                <AlertTriangle size={20} aria-hidden="true" />
                <div>
                  <strong>
                    سيُحذف من هذا الجهاز: {counts?.projects ?? 0} مشروع، و{counts?.lessons ?? 0} درس، و{counts?.quizzes ?? 0} اختبار، و{counts?.attempts ?? 0} محاولة، و{counts?.designs ?? 0} تصميم، و{counts?.library ?? 0} عنصر مكتبة.
                  </strong>
                  <p>
                    <button type="button" className="link-btn" onClick={() => void backup()} data-testid="backup-before-replace">
                      احفظ نسخة احتياطية من بيانات الجهاز الحالية أولًا
                    </button>
                  </p>
                  <label className="toggle-row">
                    <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} data-testid="replace-all-understood" />
                    <span>أفهم أن كل بيانات هذا الجهاز ستُحذف وتحل محلها النسخة الاحتياطية.</span>
                  </label>
                </div>
              </div>
            ) : (
              <>
                {plan.projects.length > 0 && (
                  <ul className="import-projects">
                    {plan.projects.map((p) => (
                      <li key={p.id} className="import-project" data-testid="import-project" data-state={p.state}>
                        <div className="import-project-head">
                          <strong>{p.title}</strong>
                          <Pill tone={p.state === 'none' ? 'success' : 'warning'}>{STATE_LABEL[p.state]}</Pill>
                        </div>
                        <p className="muted">
                          في الملف: {p.counts.lessons} درس · {p.counts.quizzes} اختبار · {p.counts.designs} تصميم · {p.counts.assets} ملف وسائط ({formatBytes(p.counts.bytes)})
                          {p.counts.attempts > 0 && ` · ${p.counts.attempts} محاولة`}
                          {p.current && ` — على الجهاز الآن: ${p.current.lessons} درس · ${p.current.quizzes} اختبار · ${p.current.designs} تصميم · ${p.current.attempts} محاولة`}
                        </p>
                        {p.titleClash && <p className="warn-text">يوجد على الجهاز مشروع آخر بالعنوان نفسه.</p>}
                        <label className="sr-only" htmlFor={`${uid}-c-${p.id}`}>
                          ماذا تفعل بمشروع {p.title}
                        </label>
                        <select id={`${uid}-c-${p.id}`} className="input" value={p.choice} onChange={(e) => setChoice(p.id, e.target.value as Choice)} data-testid="import-choice">
                          {p.allowed.map((c) => (
                            <option key={c} value={c}>
                              {CHOICE_LABEL[c]}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                )}
                {plan.library.length > 0 && (
                  <p className="muted" data-testid="import-library">
                    عناصر المكتبة: {plan.library.filter((l) => !l.exists).length} جديد يُضاف، و{plan.library.filter((l) => l.exists).length} موجود يبقى كما هو.
                  </p>
                )}
                {plan.settings > 0 && (
                  <label className="toggle-row">
                    <input type="checkbox" checked={plan.restoreSettings} onChange={(e) => setPlan({ ...plan, restoreSettings: e.target.checked })} data-testid="restore-settings" />
                    <span>استعادة الإعدادات من الملف أيضًا (المظهر، حجم الخط، بيانات صاحب المشروع)</span>
                  </label>
                )}
              </>
            )}

            <div className="row-actions import-actions">
              <button
                type="button"
                className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`}
                disabled={!!busy || !!nothingToDo || (plan.kind === 'backup' && plan.mode === 'replace-all' && !understood)}
                onClick={() => (destructive ? setConfirm(true) : void run())}
                data-testid="import-apply"
              >
                {busy === 'apply' ? 'جارٍ الاستيراد…' : plan.kind === 'backup' && plan.mode === 'replace-all' ? 'استبدال كل البيانات' : 'استيراد'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset} disabled={!!busy}>
                إلغاء
              </button>
            </div>
            {nothingToDo && <p className="muted">لا يوجد ما يُستورد بالاختيارات الحالية.</p>}
          </div>
        )}

        {result && (
          <div className="align-alert is-ok" role="status" data-testid="import-result">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div>
              <strong>تم الاستيراد.</strong>
              <p data-testid="import-result-text">
                {[
                  result.added && `أُضيف ${result.added} مشروع`,
                  result.replaced && `استُبدل ${result.replaced}`,
                  result.copied && `أُضيفت ${result.copied} نسخة منفصلة`,
                  result.skipped && `تُخطّي ${result.skipped}`,
                  `${result.lessons} درس`,
                  `${result.quizzes} اختبار`,
                  `${result.designs} تصميم`,
                  `${result.assets} ملف وسائط`,
                  result.attempts && `${result.attempts} محاولة`,
                  result.library && `${result.library} عنصر مكتبة`,
                  result.settings && 'الإعدادات',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {result.projectIds.length > 0 && (
                <p>
                  {result.projectIds.map((id) => (
                    <Link key={id} to={`/projects/${id}`} className="link-btn">
                      فتح المشروع
                    </Link>
                  ))}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirm}
        title={plan?.mode === 'replace-all' ? 'استبدال كل بيانات الجهاز' : 'استبدال مشاريع على الجهاز'}
        testId="confirm-import"
        confirmLabel={plan?.mode === 'replace-all' ? 'نعم، استبدل كل البيانات' : 'نعم، استبدل'}
        onClose={() => setConfirm(false)}
        onConfirm={() => void run()}
        message={
          plan?.kind === 'backup' && plan.mode === 'replace-all' ? (
            <p>سيُحذف كل ما على هذا الجهاز وتحل محله النسخة الاحتياطية. لا يمكن التراجع عن ذلك إلا بنسخة احتياطية حفظتها قبله.</p>
          ) : (
            <>
              <p>ستُحذف نسخة الجهاز من هذه المشاريع وتحل محلها نسخة الملف، ومعها أي تعديلات أو نتائج حدثت بعد تصديره:</p>
              <ul>
                {plan?.projects
                  .filter((p) => p.choice === 'replace')
                  .map((p) => (
                    <li key={p.id}>
                      «{p.title}» — على الجهاز الآن: {p.current?.lessons ?? 0} درس، {p.current?.attempts ?? 0} محاولة
                    </li>
                  ))}
              </ul>
            </>
          )
        }
      />
    </div>
  );
}
