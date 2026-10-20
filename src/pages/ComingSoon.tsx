import { Hammer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CURRENT_PHASE, NAV, PHASES } from '../app/nav';
import { PageHeader, Pill } from '../components/ui';

const PLANNED: Record<string, { intro: string; features: string[] }> = {
  '/studio': {
    intro: 'تصميم البطاقات التعليمية والملخصات البصرية وخرائط المفاهيم بقوالب محلية.',
    features: ['بطاقات تعليمية بقوالب جاهزة', 'ملخصات بصرية', 'خرائط مفاهيم قابلة للتحرير', 'تصدير صورة PNG'],
  },
  '/library': {
    intro: 'قوالب ووسائط تعليمية مخزنة على الجهاز وتعمل دون اتصال.',
    features: ['قوالب دروس وبطاقات مضمنة', 'رفع الصور والصوت وتصغيرها تلقائيًا', 'عرض المساحة المستخدمة', 'إعادة استخدام الوسائط في الدروس'],
  },
  '/backup': {
    intro: 'نقل البيانات بين الكمبيوتر والجوال بملف، دون مزامنة تلقائية.',
    features: ['تصدير مشروع بملف ‎.ibm', 'استيراد مع معاينة وتحقق من سلامة الملف', 'نسخة احتياطية كاملة واستعادتها', 'تذكير بالنسخ الاحتياطي'],
  },
};

export function ComingSoon({ path }: { path: string }) {
  const item = NAV.find((n) => n.path === path)!;
  const plan = PLANNED[path];
  const phase = PHASES.find((p) => p.n === item.phase)!;
  const Icon = item.icon;
  return (
    <div className="page" data-testid={`page-${path.slice(1)}`}>
      <PageHeader title={item.label} subtitle={plan.intro} />
      <section className="coming card">
        <div className="coming-icon" aria-hidden="true">
          <Icon size={30} />
        </div>
        <div className="coming-body">
          <div className="coming-tags">
            <Pill tone="warning" icon={Hammer}>
              قيد البناء
            </Pill>
            <Pill tone="neutral">
              المرحلة {phase.n}: {phase.title}
            </Pill>
          </div>
          <p className="coming-note">
            هذه الشاشة جزء من خريطة التطبيق، ولم تُنفَّذ وظائفها بعد. ستُبنى وتُختبر في المرحلة {phase.n}
            {CURRENT_PHASE < phase.n ? '، بعد اعتماد المراحل السابقة.' : '.'}
          </p>
          <h2 className="coming-h">ما ستتضمنه</h2>
          <ul className="coming-list">
            {plan.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <Link to="/" className="btn btn-ghost">
            العودة إلى لوحة التحكم
          </Link>
        </div>
      </section>
    </div>
  );
}
