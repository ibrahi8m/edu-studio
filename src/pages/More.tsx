import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { CURRENT_PHASE, GROUP_LABEL, useNav, type NavGroup } from '../app/nav';
import { PageHeader, PhaseBadge } from '../components/ui';

const GROUPS: NavGroup[] = ['authoring', 'delivery', 'management'];

export function More() {
  const nav = useNav();
  return (
    <div className="page" data-testid="page-more">
      <PageHeader title="كل الوحدات" />
      {GROUPS.map((g) => (
        <section key={g} className="more-group">
          <h2 className="section-title">{GROUP_LABEL[g]}</h2>
          <ul className="more-list">
            {nav.filter((n) => n.group === g).map((n) => {
              const Icon = n.icon;
              return (
                <li key={n.path}>
                  <Link to={n.path} className="more-link">
                    <span className="module-icon" aria-hidden="true">
                      <Icon size={20} />
                    </span>
                    <span className="more-name">{n.label}</span>
                    <PhaseBadge phase={n.phase} current={CURRENT_PHASE} />
                    <ChevronLeft size={18} aria-hidden="true" className="more-chev" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
