import { useEffect, useState } from 'react';
import { HardDrive, Monitor, Moon, ShieldCheck, Sun, Type, UserRound } from 'lucide-react';
import { useSettings } from '../app/SettingsContext';
import { OFFLINE_LABEL, useRuntime } from '../app/runtime';
import { Card, PageHeader, Pill, Segmented } from '../components/ui';
import { DB_NAME, SCHEMA_VERSION } from '../db/db';
import type { FontScale, Settings as S, ThemeMode } from '../db/settings';
import { formatBytes, getStorageInfo, requestPersistence, type StorageInfo } from '../db/storage';

const OWNER_FIELDS: { key: keyof S; label: string; placeholder: string }[] = [
  { key: 'ownerName', label: 'الاسم المختصر (يظهر في الترحيب)', placeholder: 'إبراهيم' },
  { key: 'ownerFullName', label: 'الاسم الكامل', placeholder: 'اكتب اسمك الكامل' },
  { key: 'university', label: 'الجامعة', placeholder: 'اسم الجامعة' },
  { key: 'program', label: 'البرنامج', placeholder: 'ماجستير المناهج وطرق التدريس' },
  { key: 'course', label: 'المساق', placeholder: 'تصميم المحتوى الرقمي' },
  { key: 'instructor', label: 'أستاذ المساق', placeholder: 'اسم أستاذ المساق' },
];

function OwnerField({ k, label, placeholder }: { k: keyof S; label: string; placeholder: string }) {
  const { settings, update } = useSettings();
  const [value, setValue] = useState(String(settings[k] ?? ''));
  const [saved, setSaved] = useState(false);
  useEffect(() => setValue(String(settings[k] ?? '')), [settings, k]);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        maxLength={k === 'ownerName' ? 80 : 160}
        data-testid={`owner-${k}`}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={async () => {
          const v = k === 'ownerName' ? value.trim() || 'إبراهيم' : value.trim();
          if (v !== settings[k]) {
            await update(k, v as never);
            setSaved(true);
          }
        }}
      />
      {saved && <span className="field-hint ok">تم الحفظ</span>}
    </label>
  );
}

export function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { offline } = useRuntime();
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  const refresh = () => void getStorageInfo().then(setStorage);
  useEffect(refresh, []);

  const off = OFFLINE_LABEL[offline];

  return (
    <div className="page" data-testid="page-settings">
      <PageHeader title="الإعدادات" subtitle="تُحفظ كل الإعدادات في قاعدة البيانات المحلية على هذا الجهاز." />

      <div className="settings-grid">
        <Card title="المظهر" icon={Sun}>
          <div className="setting-row">
            <span className="setting-label">السمة</span>
            <Segmented<ThemeMode>
              label="السمة"
              value={settings.theme}
              onChange={(v) => void update('theme', v)}
              options={[
                { value: 'dark', label: 'داكن', icon: Moon },
                { value: 'light', label: 'فاتح', icon: Sun },
                { value: 'system', label: 'حسب النظام', icon: Monitor },
              ]}
            />
          </div>
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
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.motion === 'reduce'}
              onChange={(e) => void update('motion', e.target.checked ? 'reduce' : 'system')}
              data-testid="toggle-motion"
            />
            <span>تقليل الحركة والمؤثرات</span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.showSplash}
              onChange={(e) => void update('showSplash', e.target.checked)}
              data-testid="toggle-splash"
            />
            <span>إظهار شاشة البداية عند كل تشغيل</span>
          </label>
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

        <Card title="بيانات صاحب المشروع" icon={UserRound} className="span-2">
          <p className="muted">تظهر في الترحيب وصفحة «عن صاحب المشروع». تُحفظ عند مغادرة الحقل.</p>
          <div className="field-grid">
            {OWNER_FIELDS.map((f) => (
              <OwnerField key={f.key} k={f.key} label={f.label} placeholder={f.placeholder} />
            ))}
          </div>
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
            onClick={() => {
              if (window.confirm('إعادة كل الإعدادات إلى القيم الافتراضية؟')) void reset();
            }}
          >
            إعادة الإعدادات الافتراضية
          </button>
        </Card>
      </div>
    </div>
  );
}
