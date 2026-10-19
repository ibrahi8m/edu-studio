const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.round((ts - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'الآن';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ts).toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function lessonsLabel(n: number): string {
  if (n === 0) return 'لا دروس';
  if (n === 1) return 'درس واحد';
  if (n === 2) return 'درسان';
  if (n <= 10) return `${n.toLocaleString('ar')} دروس`;
  return `${n.toLocaleString('ar')} درسًا`;
}

export function minutesLabel(m: number): string {
  if (!m) return '';
  if (m < 60) return `${m.toLocaleString('ar')} دقيقة`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h.toLocaleString('ar')} س ${r.toLocaleString('ar')} د` : `${h.toLocaleString('ar')} ساعة`;
}
