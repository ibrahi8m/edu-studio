import { Monitor, Moon, Sun } from 'lucide-react';
import { useSettings } from './SettingsContext';
import type { ThemeMode } from '../db/settings';

const NEXT: Record<ThemeMode, ThemeMode> = { dark: 'light', light: 'system', system: 'dark' };
const LABEL: Record<ThemeMode, string> = { dark: 'الوضع الليلي', light: 'الوضع النهاري', system: 'تلقائي حسب الجهاز' };

/** 1.2.0: one button on every screen: ليلي → نهاري → تلقائي. The choice is saved like any setting. */
export function ThemeButton({ className = '' }: { className?: string }) {
  const { settings, update } = useSettings();
  const Icon = settings.theme === 'dark' ? Moon : settings.theme === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      className={`icon-btn theme-btn ${className}`}
      aria-label={`المظهر: ${LABEL[settings.theme]}. اضغط للتبديل إلى ${LABEL[NEXT[settings.theme]]}`}
      title={`المظهر: ${LABEL[settings.theme]}`}
      onClick={() => void update('theme', NEXT[settings.theme])}
      data-testid="theme-button"
      data-mode={settings.theme}
    >
      <Icon size={19} />
    </button>
  );
}
