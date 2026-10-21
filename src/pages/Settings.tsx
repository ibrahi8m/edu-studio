import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FlaskConical, HardDrive, Monitor, Moon, Palette, ShieldCheck, Sun, Type, UserRound, Volume2 } from 'lucide-react';
import { SoundControls } from '../audio/AudioControl';
import { ConfirmDialog } from '../components/Dialog';
import { DemoPanel } from '../demo/DemoUI';
import { useMediaQuery } from '../lesson/editor/AlignmentTab';
import { useSettings } from '../app/SettingsContext';
import { OFFLINE_LABEL, useRuntime } from '../app/runtime';
import { Card, PageHeader, Pill, Segmented } from '../components/ui';
import { DB_NAME, SCHEMA_VERSION } from '../db/db';
import { displayName, type BackgroundKind, type FontScale, type MotionLevel, type ThemeMode } from '../db/settings';
import { formatBytes, getStorageInfo, requestPersistence, type StorageInfo } from '../db/storage';

export function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { offline } = useRuntime();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // follows the system setting live, while the page is open
  const systemReduce = useMediaQuery('(prefers-reduced-motion: reduce)');

  const refresh = () => void getStorageInfo().then(setStorage);
  useEffect(refresh, []);
  const { hash } = useLocation();
  useEffect(() => {
    // «الإعدادات» links from inside the demo project land on the demo card
    // after the shell has reset the scroll position for the new page
    if (hash !== '#demo') return;
    const t = window.setTimeout(() => document.getElementById('demo')?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, [hash]);

  const off = OFFLINE_LABEL[offline];

  return (
    <div className="page" data-testid="page-settings">
      <PageHeader title="الإعدادات" subtitle="تُحفظ كل الإعدادات في قاعدة البيانات المحلية على هذا الجهاز." />

      <div className="settings-grid">
        <Card title="المظهر والصوت" icon={Sun} className="span-2" testId="settings-appearance">
          <div className="appearance-grid">
            <section aria-labelledby="ap-look">
              <h3 className="sub-h" id="ap-look">
                <Palette size={16} aria-hidden="true" /> المظهر
              </h3>
              <div className="setting-row">
                <span className="setting-label">الوضع</span>
                <Segmented<ThemeMode>
                  label="الوضع"
                  value={settings.theme}
                  onChange={(v) => void update('theme', v)}
                  options={[
                    { value: 'dark', label: 'ليلي', icon: Moon },
                    { value: 'light', label: 'نهاري', icon: Sun },
                    { value: 'system', label: 'تلقائي', icon: Monitor },
                  ]}
                />
              </div>
              {settings.theme === 'system' && <p className="field-hint">يتبع إعداد جهازك، ويتغير معه مباشرة.</p>}
              <div className="setting-row">
                <span className="setting-label">
                  <Type size={16} aria-hidden="true" /> حجم الخط
                </span>
                <Segmented<FontScale>
                  label="حجم الخط"
                  value={settings.fontScale}
                  onChange={(v) => void update('fontScale', v)}
                  options={[
                    { value: 1, label: 'عادي' },
                    { value: 1.15, label: 'كبير' },
                    { value: 1.3, label: 'أكبر' },
                  ]}
                />
              </div>
              <div className="setting-row">
                <span className="setting-label">نوع الخلفية</span>
                <Segmented<BackgroundKind>
                  label="نوع الخلفية"
                  value={settings.background}
                  onChange={(v) => void update('background', v)}
                  options={[
                    { value: 'particles', label: 'جسيمات' },
                    { value: 'gradient', label: 'تدرجات ضوئية' },
                    { value: 'grid', label: 'شبكة تقنية' },
                    { value: 'waves', label: 'موجات ضوئية' },
                  ]}
                />
              </div>
              <div className="setting-row">
                <span className="setting-label">مستوى الحركة</span>
                <Segmented<MotionLevel>
                  label="مستوى الحركة"
                  value={settings.motionLevel}
                  onChange={(v) => {
                    void update('motionLevel', v);
                    void update('motion', v === 'off' ? 'reduce' : 'system');
                  }}
                  options={[
                    { value: 'full', label: 'حركة كاملة' },
                    { value: 'calm', label: 'حركة هادئة' },
                    { value: 'static', label: 'خلفية ثابتة' },
                    { value: 'off', label: 'إيقاف كل الحركة' },
                  ]}
                />
              </div>
              <p className="field-hint" data-testid="motion-hint">
                {settings.motionLevel === 'off'
                  ? 'لا خلفية متحركة ولا حركات انتقال في الواجهة.'
                  : settings.motionLevel === 'static'
                    ? 'الخلفية تُرسم مرة واحدة ولا تتحرك.'
                    : settings.motionLevel === 'calm'
                      ? 'حركة بطيئة بمعدل أقل، توفّر البطارية.'
                      : 'حركة أنعم وأسرع قليلًا.'}{' '}
                تقل شدتها تلقائيًا في صفحات القراءة والكتابة، وتتوقف أثناء حل الاختبار.
              </p>
              {systemReduce && settings.motionLevel !== 'off' && (
                <p className="field-hint" data-testid="motion-system-note">نظام جهازك يطلب تقليل الحركة، فالخلفية ثابتة وحركات الواجهة مخفّضة تلقائيًا.</p>
              )}
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={settings.showSplash}
                  onChange={(e) => void update('showSplash', e.target.checked)}
                  data-testid="toggle-splash"
                />
                <span>إظهار شاشة البداية عند كل تشغيل</span>
              </label>
            </section>
            <section aria-labelledby="ap-sound">
              <h3 className="sub-h" id="ap-sound">
                <Volume2 size={16} aria-hidden="true" /> الصوت
              </h3>
              <SoundControls />
            </section>
          </div>
        </Card>

        <Card title="اللغة" icon={Type}>
          <div className="setting-row">
            <span className="setting-label">لغة الواجهة</span>
            <Segmented<string>
              label="لغة الواجهة"
              value="ar"
              onChange={() => undefined}
              options={[{ value: 'ar', label: 'العربية' }]}
            />
          </div>
          <p className="muted">الواجهة عربية بالكامل من اليمين إلى اليسار. الإنجليزية مخطط لها لاحقًا، ولم تُضف بعد.</p>
        </Card>

        <Card title="ملفك الشخصي" icon={UserRound} className="span-2" testId="settings-profile">
          <p>
            {displayName(settings) ? (
              <>
                الاسم في الترحيب: <strong>{displayName(settings)}</strong>.{' '}
              </>
            ) : (
              'لم تكتب اسمك بعد. '
            )}
            الاسم والصفة والسيرة الذاتية في <Link to="/me" data-testid="settings-to-me">صفحتي</Link>. معلومات المشروع الأكاديمية ثابتة في صفحة <Link to="/about">عن المشروع</Link>.
          </p>
        </Card>

        <Card title="المحتوى التجريبي" icon={FlaskConical} className="span-2" testId="settings-demo">
          <span id="demo" className="anchor" />
          <DemoPanel />
        </Card>

        <Card title="التشغيل دون إنترنت" icon={ShieldCheck}>
          <Pill tone={off.tone} testId="offline-state">{off.text}</Pill>
          <dl className="kv">
            <dt>قاعدة البيانات</dt>
            <dd dir="ltr">{DB_NAME} · v{SCHEMA_VERSION}</dd>
            <dt>إصدار التطبيق</dt>
            <dd dir="ltr">{__APP_VERSION__}</dd>
            <dt>المزامنة بين الأجهزة</dt>
            <dd>غير موجودة؛ النقل بملف تصدير واستيراد</dd>
          </dl>
        </Card>

        <Card title="التخزين المحلي" icon={HardDrive}>
          <dl className="kv">
            <dt>نوع التخزين</dt>
            <dd data-testid="storage-persisted">
              {storage == null ? '…' : storage.persisted ? 'دائم (محمي من الحذف التلقائي)' : 'عادي (قد يحذفه المتصفح عند نقص المساحة)'}
            </dd>
            <dt>المستخدم</dt>
            <dd>{formatBytes(storage?.usage ?? null)}</dd>
            <dt>المتاح</dt>
            <dd>{formatBytes(storage?.quota ?? null)}</dd>
          </dl>
          {storage && !storage.persisted && (
            <button type="button" className="btn btn-ghost" onClick={() => void requestPersistence().then(refresh)}>
              طلب تخزين دائم
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger-ghost"
            onClick={() => setConfirmReset(true)}
            data-testid="settings-reset"
          >
            إعادة الإعدادات الافتراضية
          </button>
        </Card>
        <ConfirmDialog
          open={confirmReset}
          title="إعادة الإعدادات الافتراضية؟"
          message="تعود السمة وحجم الخط والخلفية والحركة والصوت وشاشة البداية إلى قيمها الأولى. اسمك وسيرتك الذاتية في «صفحتي»، والمحتوى والنتائج، لا تتغير."
          confirmLabel="نعم، أعِدها"
          testId="confirm-settings-reset"
          onClose={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            void reset();
          }}
        />
      </div>
    </div>
  );
}
