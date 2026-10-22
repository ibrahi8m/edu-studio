import { useEffect, useId, useRef, useState } from 'react';
import { Download, ImagePlus, Stamp } from 'lucide-react';
import { useToast } from '../app/Toasts';
import { formatBytes } from '../db/storage';
import { OFFICIAL_LOGO } from './catalog';

/**
 * 1.3.0 — «تركيب الشعار»: places the ORIGINAL logo file on an image the user generated elsewhere,
 * entirely in the browser (canvas), so the logo in the final design is pixel-exact rather than
 * redrawn by an image generator. The picture never leaves the device.
 */

type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'bottom-center';
const CORNERS: { value: Corner; label: string }[] = [
  { value: 'bottom-left', label: 'أسفل اليسار' },
  { value: 'bottom-right', label: 'أسفل اليمين' },
  { value: 'top-left', label: 'أعلى اليسار' },
  { value: 'top-right', label: 'أعلى اليمين' },
  { value: 'bottom-center', label: 'أسفل المنتصف' },
];
const MAX_BYTES = 25 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('تعذّر تحميل الصورة.'));
    img.src = src;
  });
}

export function LogoComposer() {
  const toast = useToast();
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [photo, setPhoto] = useState<{ img: HTMLImageElement; name: string; size: number } | null>(null);
  const [corner, setCorner] = useState<Corner>('bottom-left');
  const [size, setSize] = useState(16); // % of the image width
  const [margin, setMargin] = useState(4); // % of the shorter side
  const [variant, setVariant] = useState<'mark' | 'bare'>('mark');
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let alive = true;
    const file = variant === 'mark' ? OFFICIAL_LOGO.file : OFFICIAL_LOGO.bare;
    loadImage(`${import.meta.env.BASE_URL}brand/${file}`)
      .then((img) => alive && setLogo(img))
      .catch(() => alive && setLogo(null));
    return () => {
      alive = false;
    };
  }, [variant]);

  // Draw at the photo's full resolution; the preview is the same canvas scaled down by CSS.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !photo || !logo) return;
    const { img } = photo;
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const ratio = (logo.naturalHeight || 1) / (logo.naturalWidth || 1);
    const w = Math.round((c.width * size) / 100);
    const h = Math.round(w * ratio);
    const m = Math.round((Math.min(c.width, c.height) * margin) / 100);
    const x = corner.endsWith('left') ? m : corner.endsWith('right') ? c.width - w - m : Math.round((c.width - w) / 2);
    const y = corner.startsWith('top') ? m : c.height - h - m;
    ctx.drawImage(logo, x, y, w, h); // the original artwork, scaled uniformly: same shapes, colours and proportions
    c.dataset.logoBox = `${x},${y},${w},${h}`;
  }, [photo, logo, corner, size, margin]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast({ message: 'اختر صورة PNG أو JPG أو WebP.', tone: 'danger' });
    if (file.size > MAX_BYTES) return toast({ message: `حجم الصورة ${formatBytes(file.size)} أكبر من الحد (${formatBytes(MAX_BYTES)}).`, tone: 'danger' });
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      setPhoto({ img, name: file.name, size: file.size });
    } catch {
      toast({ message: 'تعذّرت قراءة الصورة.', tone: 'danger' });
    }
  };

  const save = () => {
    const c = canvas.current;
    if (!c || !photo) return;
    c.toBlob((blob) => {
      if (!blob) return toast({ message: 'تعذّر إنشاء الصورة.', tone: 'danger' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${photo.name.replace(/\.[^.]+$/, '')}-IBRAHI8M.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast({ message: 'حُفظت الصورة مع الشعار الأصلي (PNG).', sound: 'export' });
    }, 'image/png');
  };

  return (
    <section className="card logo-composer" data-testid="logo-composer">
      <h2 className="card-title">
        <Stamp size={18} aria-hidden="true" /> تركيب الشعار الأصلي على صورتك
      </h2>
      <p className="muted">
        أدوات توليد الصور لا ترسم الشعار مطابقًا للأصل. ارفع الصورة التي ولّدتها، فيضع التطبيق عليها ملف شعار <bdi>{OFFICIAL_LOGO.name}</bdi> الأصلي كما هو (دون إعادة رسم أو تغيير ألوان أو نِسب)، ثم نزّلها PNG. الصورة لا تغادر جهازك.
      </p>
      <input ref={input} type="file" accept={TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ''))} data-testid="compose-input" />
      <div className="compose-grid">
        <div className="compose-controls">
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} data-testid="compose-pick">
            <ImagePlus size={18} aria-hidden="true" /> {photo ? 'صورة أخرى' : 'اختر الصورة المولّدة'}
          </button>
          {photo && (
            <p className="muted" data-testid="compose-info">
              {photo.name} · <span dir="ltr">{photo.img.naturalWidth}×{photo.img.naturalHeight}</span> · {formatBytes(photo.size)}
            </p>
          )}
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-c`}>
              المكان
            </label>
            <select id={`${uid}-c`} className="input" value={corner} onChange={(e) => setCorner(e.target.value as Corner)} data-testid="compose-corner">
              {CORNERS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field-label">الملف</span>
            <div className="segmented segmented-sm" role="radiogroup" aria-label="ملف الشعار">
              <button type="button" role="radio" aria-checked={variant === 'mark'} className={variant === 'mark' ? 'is-active' : ''} onClick={() => setVariant('mark')}>
                الشعار مع خلفيته
              </button>
              <button type="button" role="radio" aria-checked={variant === 'bare'} className={variant === 'bare' ? 'is-active' : ''} onClick={() => setVariant('bare')}>
                دون الخلفية
              </button>
            </div>
          </div>
          <div className="field slider-field">
            <label className="field-label" htmlFor={`${uid}-s`}>
              الحجم: <span dir="ltr">{size}٪</span> من عرض الصورة
            </label>
            <input id={`${uid}-s`} type="range" min={6} max={35} value={size} onChange={(e) => setSize(Number(e.target.value))} data-testid="compose-size" />
          </div>
          <div className="field slider-field">
            <label className="field-label" htmlFor={`${uid}-m`}>
              المسافة من الحافة: <span dir="ltr">{margin}٪</span>
            </label>
            <input id={`${uid}-m`} type="range" min={1} max={12} value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
          </div>
          <button type="button" className="btn btn-primary" disabled={!photo || !logo} onClick={save} data-testid="compose-save">
            <Download size={18} aria-hidden="true" /> تنزيل الصورة مع الشعار (PNG)
          </button>
        </div>
        <div className="compose-preview">
          {photo ? <canvas ref={canvas} data-testid="compose-canvas" aria-label="معاينة الصورة مع الشعار" role="img" /> : <div className="empty">ستظهر المعاينة هنا.</div>}
        </div>
      </div>
    </section>
  );
}
