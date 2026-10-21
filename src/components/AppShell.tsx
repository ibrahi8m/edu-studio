import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutGrid, RefreshCw, UserRound, WifiOff, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { BrandLockup } from './Brand';
import { displayName } from '../db/settings';
import { GROUP_LABEL, NAV, type NavGroup } from '../app/nav';
import { applyPendingUpdate, dismissUpdate, useOnline, useRuntime } from '../app/runtime';
import { useSettings } from '../app/SettingsContext';

const GROUPS: NavGroup[] = ['main', 'authoring', 'delivery', 'management'];

function Sidebar() {
  const { settings } = useSettings();
  return (
    <aside className="sidebar" aria-label="القائمة الرئيسية">
      <div className="sidebar-brand">
        <BrandLockup />
      </div>
      <nav className="sidebar-nav">
        {GROUPS.map((g) => (
          <div key={g} className="nav-group">
            {GROUP_LABEL[g] && <div className="nav-group-label">{GROUP_LABEL[g]}</div>}
            {NAV.filter((n) => n.group === g).map((n) => {
              const Icon = n.icon;
              return (
                <NavLink key={n.path} to={n.path} end={n.path === '/'} className="nav-link" title={n.label}>
                  <Icon size={19} aria-hidden="true" />
                  <span className="nav-text">{n.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <NavLink to="/me" className="sidebar-owner" title="صفحتي" data-testid="user-card">
        <UserAvatar name={displayName(settings)} />
        <span className="sidebar-owner-text">
          <strong data-testid="user-card-name">{displayName(settings) || 'أضف اسمك'}</strong>
          <span>{settings.userRole || 'صفحتي'}</span>
        </span>
      </NavLink>
    </aside>
  );
}

/** Initials of the user's name (or a neutral icon): no built-in photo or name. */
export function UserAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <span className={`user-avatar user-avatar-${size}`} aria-hidden="true">
      {initials || <UserRound size={size === 'lg' ? 30 : 18} />}
    </span>
  );
}

function MobileTopBar() {
  const online = useOnline();
  const { settings } = useSettings();
  return (
    <header className="mobile-topbar">
      <BrandLockup compact />
      <div className="mobile-topbar-end">
        {!online && (
          <span className="offline-dot" title="دون اتصال — كل شيء يعمل محليًا" data-testid="offline-indicator-mobile">
            <WifiOff size={16} aria-hidden="true" />
            <span className="sr-only">دون اتصال</span>
          </span>
        )}
        <NavLink to="/me" className="mobile-avatar" aria-label={`صفحتي${displayName(settings) ? `: ${displayName(settings)}` : ''}`}>
          <UserAvatar name={displayName(settings)} />
        </NavLink>
      </div>
    </header>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const primary = NAV.filter((n) => n.mobilePrimary);
  const inMore = !primary.some((n) => (n.path === '/' ? pathname === '/' : pathname.startsWith(n.path)));
  return (
    <nav className="bottom-nav" aria-label="التنقل السريع">
      {primary.map((n) => {
        const Icon = n.icon;
        return (
          <NavLink key={n.path} to={n.path} end={n.path === '/'} className="bottom-link">
            <Icon size={22} aria-hidden="true" />
            <span>{n.short}</span>
          </NavLink>
        );
      })}
      <NavLink to="/more" className={`bottom-link ${inMore ? 'active' : ''}`}>
        <LayoutGrid size={22} aria-hidden="true" />
        <span>المزيد</span>
      </NavLink>
    </nav>
  );
}

function UpdateToast() {
  const { needRefresh } = useRuntime();
  if (!needRefresh) return null;
  return (
    <div className="toast-stack toast-stack-update">
    <div className="toast" role="status">
      <RefreshCw size={18} aria-hidden="true" />
      <span>يتوفر إصدار أحدث من التطبيق.</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void applyPendingUpdate()}>
        تحديث الآن
      </button>
      <button type="button" className="icon-btn" aria-label="لاحقًا" onClick={dismissUpdate}>
        <X size={18} />
      </button>
    </div>
    </div>
  );
}

export function AppShell() {
  const { storageError } = useSettings();
  const online = useOnline();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    main.current?.scrollTo?.({ top: 0 });
    window.scrollTo?.({ top: 0 });
  }, [pathname]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>
        تخطَّ إلى المحتوى
      </a>
      <Sidebar />
      <MobileTopBar />
      <main id="main" ref={main} className="main" tabIndex={-1}>
        {storageError && (
          <div className="banner banner-danger" role="alert">
            {storageError}
          </div>
        )}
        {!online && (
          <div className="banner banner-offline" role="status" data-testid="offline-banner">
            <WifiOff size={16} aria-hidden="true" />
            دون اتصال بالإنترنت — التطبيق يعمل بالكامل من جهازك.
          </div>
        )}
        <Outlet />
      </main>
      <BottomNav />
      <UpdateToast />
    </div>
  );
}
