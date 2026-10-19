import { Link } from 'react-router-dom';
import { Compass, GraduationCap, Layers, Target } from 'lucide-react';
import { useSettings } from '../app/SettingsContext';
import { Portrait, Wordmark } from '../components/Brand';
import { Card } from '../components/ui';

export function About() {
  const { settings } = useSettings();
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
        <Card title="الأساس التربوي" icon={Target}>
          <p>أهداف قابلة للقياس، ومواءمة بين الأهداف والمحتوى والتقويم، وتصنيف بلوم، وتغذية راجعة، وتقويم تكويني.</p>
        </Card>
        <Card title="التقنية" icon={Layers}>
          <p>تطبيق واحد للكمبيوتر والجوال، بقاعدة بيانات محلية على كل جهاز، ونقل البيانات بملف تصدير واستيراد.</p>
        </Card>
        <Card title="السياق الأكاديمي" icon={GraduationCap}>
          <p>مشروع مساق {settings.course} ضمن {settings.program}.</p>
        </Card>
      </div>
    </div>
  );
}
