import { Link } from 'react-router-dom';
import { ArrowLeft, Compass, FlaskConical, GraduationCap, Info, Layers, Sparkles, Target } from 'lucide-react';
import { useSettings } from '../app/SettingsContext';
import { BrandGlyph, Portrait, Wordmark } from '../components/Brand';
import { Card } from '../components/ui';
import { DB_NAME, SCHEMA_VERSION } from '../db/db';
import { DEMO_PROJECT_ID } from '../demo/content';
import { DemoInstallButton, useDemoInstalled } from '../demo/DemoUI';

/** Plan §9: every pedagogical principle has something concrete in the app to show during the discussion. */
const PRINCIPLES: { title: string; how: string; to: string; where: string }[] = [
  { title: 'أهداف قابلة للقياس', how: 'محرر أهداف بنموذج ABCD وبنك أفعال بلوم، وفاحص صياغة ينبّه إلى الأفعال غير القابلة للقياس.', to: '/builder', where: 'منشئ الدروس' },
  { title: 'المواءمة', how: 'مصفوفة لكل درس تربط كل هدف بالمحتوى والنشاط، وتلوّن الهدف غير المغطى بلون تحذيري.', to: '/builder', where: 'محرر الدرس ← المواءمة' },
  { title: 'تصنيف بلوم', how: 'مستوى لكل هدف وسؤال، وتوزيع المستويات في كل اختبار، والأداء حسب المستوى في النتائج.', to: '/quizzes', where: 'منشئ الاختبارات' },
  { title: 'الوسائط المتعددة', how: 'صور وصوت وفيديو محفوظة على الجهاز، بنص بديل ونص مكتوب للصوت.', to: '/library', where: 'المكتبة' },
  { title: 'التغذية الراجعة', how: 'تغذية لكل خيار خاطئ تشرح سبب الخطأ، بعد كل سؤال أو بعد التسليم.', to: '/quizzes', where: 'إعدادات الاختبار' },
  { title: 'التقويم التكويني', how: 'تحليل لكل سؤال ولكل هدف يحدد نسبة الإتقان والأهداف التي تحتاج إعادة تدريس.', to: '/results', where: 'النتائج والتحليلات' },
  { title: 'سهولة الوصول', how: 'تكبير الخط، وسمة فاتحة للإسقاط، وتنقل كامل بلوحة المفاتيح، ونص بديل للصور.', to: '/settings', where: 'الإعدادات' },
];

export function About() {
  const { settings } = useSettings();
  const demo = useDemoInstalled();
  const name = settings.ownerFullName || settings.ownerName;
  const rows: [string, string][] = [
    ['البرنامج', settings.program],
    ['المساق', settings.course],
    ['الجامعة', settings.university],
    ['أستاذ المساق', settings.instructor],
  ];
  const missing = !settings.ownerFullName || !settings.university || !settings.instructor;

  return (
    <div className="page" data-testid="page-about">
      <section className="about-hero">
        <div className="about-portrait">
          <Portrait variant="hero" alt={`صورة ${name}`} />
        </div>
        <div className="about-text">
          <span className="about-kicker">صاحب المشروع ومصممه</span>
          <h1 className="about-name" data-testid="about-name">{name}</h1>
          <p className="about-brand">
            <span dir="ltr" className="ltr-run">
              <Wordmark size="md" /> EDU STUDIO
            </span>
          </p>
          <p className="hero-slogan" dir="ltr">Create. Teach. Inspire.</p>
          <dl className="kv about-kv">
            {rows.map(([k, v]) => (
              <div key={k} className="kv-row">
                <dt>{k}</dt>
                <dd>{v || <span className="muted">لم يُحدَّد بعد</span>}</dd>
              </div>
            ))}
          </dl>
          {missing && (
            <p className="muted">
              يمكنك إكمال البيانات من <Link to="/settings">الإعدادات</Link>.
            </p>
          )}
        </div>
      </section>

      <div className="about-grid">
        <Card title="فكرة المشروع" icon={Compass}>
          <p>منصة عربية تساعد المعلم على تصميم المحتوى التعليمي الرقمي من الهدف حتى التقويم، وتعمل وظائفها الأساسية دون إنترنت.</p>
        </Card>
        <Card title="السياق الأكاديمي" icon={GraduationCap}>
          <p>مشروع مساق {settings.course} ضمن {settings.program}.</p>
        </Card>
      </div>

      <Card title="الأساس التربوي داخل التطبيق" icon={Target} testId="about-principles">
        <p className="muted">كل مبدأ تربوي يقابله عنصر يمكن فتحه وعرضه الآن.</p>
        <ul className="principles">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="principle">
              <strong>{p.title}</strong>
              <span>{p.how}</span>
              <Link to={p.to} className="principle-link" data-testid="principle-link">
                {p.where} <ArrowLeft size={14} aria-hidden="true" />
              </Link>
            </li>
          ))}
          <li className="principle">
            <strong>بطاقة القرار التربوي</strong>
            <span>«لماذا صُمم الدرس هكذا؟»: الأهداف والاستراتيجية والتقويم ومبرراتها في صفحة واحدة تُعرض على الشاشة.</span>
            {demo ? (
              <Link to="/preview/demo-lesson-1?notes=1" className="principle-link" data-testid="principle-link">
                مثال من المشروع التجريبي <ArrowLeft size={14} aria-hidden="true" />
              </Link>
            ) : (
              <Link to="/builder" className="principle-link" data-testid="principle-link">
                معاينة أي درس <ArrowLeft size={14} aria-hidden="true" />
              </Link>
            )}
          </li>
        </ul>
      </Card>

      <div className="about-grid">
        <Card title="الهوية" icon={Sparkles} testId="about-identity">
          <div className="identity">
            <BrandGlyph height={112} />
            <div>
              <p>
                الرقم <strong>8</strong> في الاسم هو الروبوت نفسه: الحلقة العليا رأس بعينين مضيئتين، والسفلى دائرة كهربائية متصلة لا تنقطع، رمزًا للتعلم المستمر.
              </p>
              <ul className="swatches" aria-label="ألوان الهوية">
                <li><span className="swatch" style={{ background: '#0E1014' }} aria-hidden="true" /> فحمي</li>
                <li><span className="swatch" style={{ background: '#A9B1BC' }} aria-hidden="true" /> فضي</li>
                <li><span className="swatch" style={{ background: '#2F7BFF' }} aria-hidden="true" /> أزرق كهربائي</li>
              </ul>
            </div>
          </div>
        </Card>
        <Card title="عن التطبيق" icon={Layers} testId="about-app">
          <dl className="kv">
            <dt>الإصدار</dt>
            <dd dir="ltr" data-testid="about-version">{__APP_VERSION__}</dd>
            <dt>قاعدة البيانات</dt>
            <dd dir="ltr">{DB_NAME} · v{SCHEMA_VERSION}</dd>
            <dt>الأجهزة</dt>
            <dd>الكمبيوتر (تطبيق سطح مكتب أو متصفح) والجوال (تطبيق ويب مثبّت)</dd>
            <dt>الإنترنت</dt>
            <dd>غير مطلوب في أي وظيفة أساسية؛ البيانات على الجهاز فقط</dd>
          </dl>
          <Link to="/settings" className="card-link">
            <Info size={16} aria-hidden="true" /> الإعدادات وحالة التخزين
          </Link>
        </Card>
      </div>

      <Card title="جرّب التطبيق" icon={FlaskConical} testId="about-demo">
        {demo ? (
          <p>
            المشروع التجريبي «وحدة الأمن الرقمي» موجود على هذا الجهاز.{' '}
            <Link to={`/projects/${DEMO_PROJECT_ID}`} data-testid="about-demo-open">
              افتحه
            </Link>
            ، أو ادخل <Link to="/learn">وضع الطالب</Link> باسم أحد طلابه، أو راجع <Link to="/results">نتائجهم</Link>.
          </p>
        ) : (
          <>
            <p>مشروع جاهز من ثلاثة دروس واختبارات ونتائج عشرة طلاب تجريبيين، لتجربة كل وظيفة دون إعداد. يُحذف متى شئت دون أن يمس مشاريعك.</p>
            <DemoInstallButton className="btn btn-primary" />
          </>
        )}
      </Card>
    </div>
  );
}
