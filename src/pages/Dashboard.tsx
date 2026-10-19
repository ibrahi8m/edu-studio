import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, HardDrive, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { CURRENT_PHASE, NAV, PHASES } from '../app/nav';
import { OFFLINE_LABEL, useOnline, useRuntime } from '../app/runtime';
import { useSettings } from '../app/SettingsContext';
import { Portrait, Wordmark } from '../components/Brand';
import { Card, PhaseBadge, Pill } from '../components/ui';
import { formatBytes, getStorageInfo, type StorageInfo } from '../db/storage';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'مساء الخير';
  return 'مساء النور';
}

export function Dashboard() {
  const { settings } = useSettings();
  const online = useOnline();
  const { offline } = useRuntime();
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    void getStorageInfo().then(setStorage);
  }, []);

  const off = OFFLINE_LABEL[offline];
  const today = new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="page" data-testid="page-dashboard">
      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-text">
          <p className="hero-date">{today}</p>
          <h1 className="hero-title">
            {greeting()}، {settings.ownerName}
          </h1>
          <p className="hero-sub">
            مرحبًا بك في{' '}
            <span dir="ltr" className="ltr-run">
              <Wordmark size="sm" /> EDU STUDIO
            </span>
          </p>
          <p className="hero-slogan" dir="ltr">Create. Teach. Inspire.</p>
        </div>
        <div className="hero-portrait">
          <Portrait variant="card" alt={`صورة ${settings.ownerName}`} />
        </div>
      </section>

      <div className="status-grid">
        <Card title="التشغيل دون إنترنت" icon={ShieldCheck} testId="status-offline">
          <Pill tone={off.tone}>{off.text}</Pill>
          <p className="muted">كل ملفات التطبيق والخطوط والصور محفوظة على هذا الجهاز.</p>
        </Card>
        <Card title="الاتصال الآن" icon={online ? Wifi : WifiOff} testId="status-online">
          <Pill tone={online ? 'neutral' : 'accent'}>{online ? 'متصل بالإنترنت' : 'دون اتصال'}</Pill>
          <p className="muted">التطبيق لا يحتاج الإنترنت في أي وظيفة أساسية.</p>
        </Card>
        <Card title="التخزين المحلي" icon={HardDrive} testId="status-storage">
          <Pill tone={storage?.persisted ? 'success' : 'warning'}>
            {storage == null ? '…' : storage.persisted ? 'تخزين دائم' : 'تخزين عادي'}
          </Pill>
          <p className="muted">
            المستخدم: {formatBytes(storage?.usage ?? null)} من {formatBytes(storage?.quota ?? null)}
          </p>
        </Card>
      </div>

      <Card title="المشاريع الأخيرة" icon={FolderKanban}>
        <div className="empty">
          <p>لا توجد مشاريع بعد.</p>
          <p className="muted">إنشاء المشاريع والدروس يُبنى في المرحلة 1، وستظهر آخر المشاريع هنا.</p>
        </div>
      </Card>

      <section>
        <h2 className="section-title">الوحدات</h2>
        <div className="module-grid">
          {NAV.filter((n) => n.path !== '/').map((n) => {
            const Icon = n.icon;
            return (
              <Link key={n.path} to={n.path} className="module-card">
                <span className="module-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <span className="module-name">{n.label}</span>
                <PhaseBadge phase={n.phase} current={CURRENT_PHASE} />
              </Link>
            );
          })}
        </div>
      </section>

      <Card title="مسار البناء">
        <ol className="roadmap" aria-label="مراحل التنفيذ">
          {PHASES.map((p) => (
            <li key={p.n} className={p.n < CURRENT_PHASE ? 'done' : p.n === CURRENT_PHASE ? 'current' : ''}>
              <span className="roadmap-n">{p.n}</span>
              <span className="roadmap-t">{p.title}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
