import { Link, Outlet, useNavigate } from 'react-router-dom';
import { signOut, useAuth } from '../auth/session';
import { HardDrive, LogOut, UserRound, Wifi, WifiOff } from 'lucide-react';
import { BrandMark } from '../components/Brand';
import { useOnline } from '../app/runtime';
import { useStudent } from './identity';
import { ThemeButton } from '../app/ThemeButton';
import { SoundButton } from '../audio/AudioControl';

/**
 * «بيئة المتعلم» (student mode before 1.1.0): its own full-screen frame, separate from the teacher's app shell.
 * No teacher navigation, no editing tools — only the student's lessons, quizzes and own results.
 */
export function StudentLayout() {
  const [name] = useStudent();
  const online = useOnline();
  const { user } = useAuth();
  const navigate = useNavigate();
  const student = user?.role === 'student';
  return (
    <div className="take-shell student-shell" data-testid="student-shell">
      <header className="take-bar student-bar">
        <Link to="/learn" className="student-brand" aria-label="الصفحة الرئيسية لبيئة المتعلم" data-testid="student-home-link">
          <BrandMark size={28} />
          <span>بيئة المتعلم</span>
        </Link>
        <span className="student-bar-end">
          <span
            className={`sync-chip ${online ? '' : 'is-offline'}`}
            title={`${online ? 'متصل بالإنترنت' : 'دون اتصال'} — كل تقدمك محفوظ على هذا الجهاز فقط، ولا توجد مزامنة مع جهاز آخر أو خادم.`}
            data-testid="learner-sync"
          >
            {online ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
            <span className="sync-text">{online ? 'متصل' : 'دون اتصال'}</span>
            <HardDrive size={14} aria-hidden="true" />
            <span className="sync-text">محفوظ على الجهاز · لا مزامنة</span>
          </span>
          <ThemeButton />
          <SoundButton />
          {name && (
            <span className="student-chip" data-testid="student-chip">
              <UserRound size={15} aria-hidden="true" /> {name}
            </span>
          )}
          {student ? (
            <>
              <Link to="/account" className="btn btn-ghost btn-sm" data-testid="student-account">
                <UserRound size={16} aria-hidden="true" /> <span>حسابي</span>
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="تسجيل الخروج"
                onClick={async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                }}
                data-testid="logout"
              >
                <LogOut size={16} aria-hidden="true" /> <span>خروج</span>
              </button>
            </>
          ) : (
            <Link to="/" className="btn btn-ghost btn-sm" aria-label="خروج من بيئة المتعلم" data-testid="exit-student">
              <LogOut size={16} aria-hidden="true" /> <span>خروج</span>
            </Link>
          )}
        </span>
      </header>
      <Outlet />
    </div>
  );
}
