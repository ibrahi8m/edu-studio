import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutGrid, RefreshCw, UserRound, WifiOff, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { BrandLockup } from './Brand';
import { ThemeButton } from '../app/ThemeButton';
import { SoundButton, useSfx } from '../audio/AudioControl';
import { GROUP_LABEL, useNav, type NavGroup } from '../app/nav';
import { useAuth } from '../auth/session';
import { PORTAL_LABEL, ROLE_LABEL } from '../auth/types';
import { applyPendingUpdate, dismissUpdate, useOnline, useRuntime } from '../app/runtime';
import { useSettings } from '../app/SettingsContext';

const GROUPS: NavGroup[] = ['main', 'authoring', 'delivery', 'management'];

function Sidebar() {
  const nav = useNav();
  const { user } = useAuth();
  return (
    <aside className="sidebar" aria-label="القائمة الرئيسية">
      <div className="sidebar-brand">
        <BrandLockup />
        {user && (
          <span className={`portal-badge is-${user.role}`} data-testid="portal-badge">
            {PORTAL_LABEL[user.role]}
          </span>
        )}
        <div className="sidebar-tools" role="group" aria-label="المظهر والصوت">
          <ThemeButton />
          <SoundButton />
        </div>
      </div>
      <nav className="sidebar-nav">
        {GROUPS.map((g) => (
          <div key={g} className="nav-group">
            {GROUP_LABEL[g] && <div className="nav-group-label">{GROUP_LABEL[g]}</div>}
            {nav.filter((n) => n.group === g).map((n) => {
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
      <NavLink to="/account" className="sidebar-owner" title="حسابي" data-testid="user-card">
        <UserAvatar name={user?.displayName ?? ''} />
        <span className="sidebar-owner-text">
          <strong data-testid="user-card-name">{user?.displayName ?? ''}</strong>
          <span data-testid="user-card-role">{user ? ROLE_LABEL[user.role] : ''}</span>
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
  const { user } = useAuth();
  return (
    <header className="mobile-topbar">
      <BrandLockup compact />
      {user && (
        <span className={`portal-badge is-${user.role}`} data-testid="portal-badge-mobile">
          {PORTAL_LABEL[user.role]}
        </span>
      )}
      <div className="mobile-topbar-end">
        <ThemeButton />
        <SoundButton />
        {!online && (
          <span className="offline-dot" title="دون اتصال — كل شيء يعمل محليًا" data-testid="offline-indicator-mobile">
            <WifiOff size={16} aria-hidden="true" />
            <span className="sr-only">دون اتصال</span>
          </span>
        )}
        <NavLink to="/account" className="mobile-avatar" aria-label={`حسابي${user ? `: ${user.displayName}` : ''}`} data-testid="mobile-account">
          <UserAvatar name={user?.displayName ?? ''} />
        </NavLink>
      </div>
    </header>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const primary = useNav().filter((n) => n.mobilePrimary);
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
  const play = useSfx();
  // an important notice: one soft alert sound (only if interface sounds are on)
  useEffect(() => {
    if (needRefresh) play('alert');
  }, [needRefresh, play]);
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
