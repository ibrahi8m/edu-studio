import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, FolderKanban, HardDrive, MonitorPlay, Plus, ShieldCheck, Sparkles, Wifi, WifiOff } from 'lucide-react';
import { useAllLessons, useAllProjects } from '../app/data';
import { LessonRow, ProjectCard } from '../components/ProjectBits';
import type { Project } from '../db/db';
import { CURRENT_PHASE, NAV, PHASES } from '../app/nav';
import { OFFLINE_LABEL, useOnline, useRuntime } from '../app/runtime';
import { useSettings } from '../app/SettingsContext';
import { displayName } from '../db/settings';
import { Portrait, Wordmark } from '../components/Brand';
import { Card, PhaseBadge, Pill } from '../components/ui';
import { formatBytes, getStorageInfo, type StorageInfo } from '../db/storage';
import { backupDue, useLastBackup } from '../transfer/service';
import { DemoInstallButton } from '../demo/DemoUI';
import { isDemoId } from '../demo/content';

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
  const projects = useAllProjects();
  const lessons = useAllLessons();
  const lastBackup = useLastBackup();
  const navigate = useNavigate();
  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p] as [string, Project])), [projects]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lessons ?? []) m.set(l.projectId, (m.get(l.projectId) ?? 0) + 1);
    return m;
  }, [lessons]);
  const recentProjects = useMemo(
    () => [...(projects ?? [])].filter((p) => p.status !== 'archived').sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3),
    [projects],
  );
  const recentLessons = useMemo(() => [...(lessons ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5), [lessons]);
  const readyLessons = (lessons ?? []).filter((l) => l.status === 'ready').length;

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
          <h1 className="hero-title" data-testid="hero-title">
            {greeting()}
            {displayName(settings) ? `، ${displayName(settings)}` : ''}
          </h1>
          {!displayName(settings) && (
            <p className="hero-sub">
              <Link to="/me" data-testid="hero-add-name">
                اكتب اسمك في «صفحتي»
              </Link>{' '}
              ليظهر هنا.
            </p>
          )}
          <p className="hero-sub">
            مرحبًا بك في{' '}
            <span dir="ltr" className="ltr-run">
              <Wordmark size="sm" /> EDU STUDIO
            </span>
          </p>
          <p className="hero-slogan" dir="ltr">Create. Teach. Inspire.</p>
        </div>
        <div className="hero-portrait">
          <Portrait variant="card" alt="صورة صاحب المشروع ومصممه" />
        </div>
      </section>

      {backupDue(lastBackup, (projects ?? []).some((p) => !isDemoId(p.id))) && (
        <div className="align-alert is-warn" role="status" data-testid="dashboard-backup-due">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>{lastBackup ? 'مرّ أكثر من 7 أيام على آخر نسخة احتياطية.' : 'لا توجد نسخة احتياطية لبياناتك بعد.'}</strong>
            <p>
              كل بياناتك محفوظة على هذا الجهاز فقط.{' '}
              <Link to="/backup" data-testid="dashboard-backup-link">
                احفظ نسخة احتياطية الآن
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="stat-row" data-testid="stats">
        <Link to="/projects" className="stat">
          <span className="stat-n" data-testid="stat-projects">{(projects?.length ?? 0).toLocaleString('ar')}</span>
          <span className="stat-l">محتوى تعليمي</span>
        </Link>
        <Link to="/projects?tab=lessons" className="stat">
          <span className="stat-n" data-testid="stat-lessons">{(lessons?.length ?? 0).toLocaleString('ar')}</span>
          <span className="stat-l">درس</span>
        </Link>
        <Link to="/projects?tab=lessons&lstatus=ready" className="stat">
          <span className="stat-n">{readyLessons.toLocaleString('ar')}</span>
          <span className="stat-l">درس جاهز</span>
        </Link>
      </div>

      <div className="quick-actions" data-testid="quick-actions">
        <Link to="/projects?new=1" className="btn btn-primary" data-testid="dashboard-new-content">
          <Plus size={18} aria-hidden="true" /> إضافة محتوى تعليمي جديد
        </Link>
        <Link to="/learn" className="btn">
          <MonitorPlay size={18} aria-hidden="true" /> بيئة المتعلم
        </Link>
        <Link to="/ai-studio" className="btn">
          <Sparkles size={18} aria-hidden="true" /> AI Design Studio
        </Link>
      </div>

      <Card title="المحتوى التعليمي الأخير" icon={FolderKanban} testId="recent-projects">
        {projects && projects.length === 0 ? (
          <div className="empty">
            <p>لا يوجد محتوى تعليمي بعد.</p>
            <div className="empty-actions">
              <Link to="/projects?new=1" className="btn btn-primary btn-sm">
                <Plus size={16} aria-hidden="true" /> إضافة محتوى تعليمي جديد
              </Link>
              <DemoInstallButton className="btn btn-sm" />
            </div>
          </div>
        ) : (
          <>
            <div className="project-grid project-grid-compact">
              {recentProjects.map((p) => (
                <ProjectCard key={p.id} project={p} lessonCount={counts.get(p.id) ?? 0} />
              ))}
            </div>
            <Link to="/projects" className="card-link">كل المحتوى التعليمي</Link>
          </>
        )}
      </Card>

      {recentLessons.length > 0 && (
        <Card title="آخر الدروس المعدّلة" icon={BookOpen} testId="recent-lessons">
          <ul className="lesson-list">
            {recentLessons.map((l) => (
              <LessonRow
                key={l.id}
                lesson={l}
                project={projectMap.get(l.projectId)}
                onOpen={() => navigate(`/projects/${l.projectId}/lessons/${l.id}`)}
              />
            ))}
          </ul>
        </Card>
      )}

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
