import { Link, Outlet } from 'react-router-dom';
import { LogOut, UserRound, WifiOff } from 'lucide-react';
import { BrandMark } from '../components/Brand';
import { useOnline } from '../app/runtime';
import { useStudent } from './identity';

/**
 * Student mode: its own full-screen frame, separate from the teacher's app shell.
 * No teacher navigation, no editing tools — only the student's lessons, quizzes and own results.
 */
export function StudentLayout() {
  const [name] = useStudent();
  const online = useOnline();
  return (
    <div className="take-shell student-shell" data-testid="student-shell">
      <header className="take-bar student-bar">
        <Link to="/learn" className="student-brand" aria-label="الصفحة الرئيسية للطالب" data-testid="student-home-link">
          <BrandMark size={28} />
          <span>وضع الطالب</span>
        </Link>
        <span className="student-bar-end">
          {!online && (
            <span className="offline-dot" title="دون اتصال — كل شيء يعمل محليًا">
              <WifiOff size={16} aria-hidden="true" />
              <span className="sr-only">دون اتصال</span>
            </span>
          )}
          {name && (
            <span className="student-chip" data-testid="student-chip">
              <UserRound size={15} aria-hidden="true" /> {name}
            </span>
          )}
          <Link to="/" className="btn btn-ghost btn-sm" aria-label="خروج من وضع الطالب" data-testid="exit-student">
            <LogOut size={16} aria-hidden="true" /> <span>خروج</span>
          </Link>
        </span>
      </header>
      <Outlet />
    </div>
  );
}
