import { DemoInstallButton } from '../demo/DemoUI';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FolderPlus, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { errorMessage, useAllLessons, useAllProjects } from '../app/data';
import { useToast } from '../app/Toasts';
import { db, type ContentKind, type ItemStatus, type Project } from '../db/db';
import { CONTENT_KINDS, KIND_SPECS } from '../db/contentKinds';
import { GRADES, STATUSES, STATUS_LABEL } from '../db/catalog';
import { createProject, distinctSubjects, queryLessons, queryProjects, type ProjectSort } from '../db/projects';
import { ProjectFormDialog } from '../components/forms';
import { LessonRow, ProjectCard } from '../components/ProjectBits';
import { PageHeader } from '../components/ui';

type Tab = 'projects' | 'lessons';

export function ProjectsPage() {
  const projects = useAllProjects();
  const lessons = useAllLessons();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const tab: Tab = params.get('tab') === 'lessons' ? 'lessons' : 'projects';
  const q = params.get('q') ?? '';
  const subject = params.get('subject') ?? '';
  const grade = params.get('grade') ?? '';
  const status = (params.get('status') ?? 'active') as ItemStatus | 'all' | 'active';
  const lessonStatus = (params.get('lstatus') ?? 'all') as ItemStatus | 'all';
  const sort = (params.get('sort') ?? 'updated') as ProjectSort;
  const kind = (CONTENT_KINDS.includes(params.get('kind') as ContentKind) ? params.get('kind') : '') as ContentKind | '';
  const publication = (['published', 'unpublished'].includes(params.get('pub') ?? '') ? params.get('pub') : '') as 'published' | 'unpublished' | '';
  // «إضافة محتوى تعليمي جديد» from the dashboard opens the dialog here (?new=1).
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setCreating(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const setParam = (k: string, v: string, fallback = '') => {
    const next = new URLSearchParams(params);
    if (!v || v === fallback) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const subjects = useMemo(() => distinctSubjects(projects ?? []), [projects]);
  const projectMap = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p] as [string, Project])), [projects]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lessons ?? []) m.set(l.projectId, (m.get(l.projectId) ?? 0) + 1);
    return m;
  }, [lessons]);

  const shownProjects = useMemo(
    () => (projects && lessons ? queryProjects(projects, lessons, { q, subject, grade, status, sort, kind, publication }) : []),
    [projects, lessons, q, subject, grade, status, sort, kind, publication],
  );
  const shownLessons = useMemo(
    () => (lessons ? queryLessons(lessons, projectMap, { q, status: lessonStatus }) : []),
    [lessons, projectMap, q, lessonStatus],
  );

  const loading = projects === undefined || lessons === undefined;
  const filtersActive = !!(subject || grade || kind || publication || status !== 'active' || sort !== 'updated' || lessonStatus !== 'all');
  const total = projects?.length ?? 0;

  const clearAll = () => setParams(tab === 'lessons' ? { tab } : {}, { replace: true });

  return (
    <div className="page" data-testid="page-projects">
      <PageHeader
        title="المحتوى التعليمي"
        subtitle="محتوى مدرسي، وجامعي، وبرامج تدريب معلمين؛ كلٌّ بوحداته ودروسه. تُحفظ البيانات على هذا الجهاز فقط."
        actions={
          <button type="button" className="btn btn-primary fab-mobile" onClick={() => setCreating(true)} data-testid="new-project">
            <Plus size={18} aria-hidden="true" />
            <span>إضافة محتوى تعليمي جديد</span>
          </button>
        }
      />

      {!loading && total === 0 ? (
        <section className="card empty-hero" data-testid="projects-empty">
          <span className="coming-icon" aria-hidden="true">
            <FolderPlus size={30} />
          </span>
          <h2>إضافة محتوى تعليمي جديد</h2>
          <p className="muted">مدرسي (مثل «وحدة الطاقة — العلوم — الصف السابع»)، أو جامعي، أو برنامج تدريب معلمين. بعد إنشائه أضف إليه الوحدات والدروس.</p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={18} aria-hidden="true" /> إضافة محتوى تعليمي جديد
            </button>
            <DemoInstallButton />
          </div>
          <p className="muted">أو جرّب التطبيق أولًا بمحتوى جاهز فيه دروس واختبارات ونتائج طلاب.</p>
        </section>
      ) : (
        <>
          <div className="toolbar">
            <div className="tabs" role="tablist" aria-label="عرض">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'projects'}
                className={tab === 'projects' ? 'is-active' : ''}
                onClick={() => setParam('tab', '', '')}
              >
                المحتوى <span className="tab-count">{shownProjects.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'lessons'}
                className={tab === 'lessons' ? 'is-active' : ''}
                onClick={() => setParam('tab', 'lessons')}
                data-testid="tab-lessons"
              >
                كل الدروس <span className="tab-count">{shownLessons.length}</span>
              </button>
            </div>

            <div className="search-row">
              <label className="search">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">بحث</span>
                <input
                  type="search"
                  className="search-input"
                  placeholder={tab === 'projects' ? 'ابحث في المحتوى ودروسه…' : 'ابحث في عناوين الدروس وملخصاتها…'}
                  value={q}
                  onChange={(e) => setParam('q', e.target.value)}
                  data-testid="search"
                />
                {q && (
                  <button type="button" className="icon-btn search-clear" aria-label="مسح البحث" onClick={() => setParam('q', '')}>
                    <X size={16} />
                  </button>
                )}
              </label>
              <button
                type="button"
                className={`btn btn-ghost filter-toggle ${filtersActive ? 'has-active' : ''}`}
                aria-expanded={showFilters}
                aria-label="التصنيف والترتيب"
                onClick={() => setShowFilters((s) => !s)}
                data-testid="toggle-filters"
              >
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span>التصنيف</span>
              </button>
            </div>

            <div className={`filters ${showFilters ? 'is-open' : ''}`} data-testid="filters">
              {tab === 'projects' ? (
                <>
                  <label className="filter">
                    <span>النوع</span>
                    <select className="input" value={kind} onChange={(e) => setParam('kind', e.target.value)} data-testid="filter-kind">
                      <option value="">كل الأنواع</option>
                      {CONTENT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_SPECS[k].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter">
                    <span>النشر</span>
                    <select className="input" value={publication} onChange={(e) => setParam('pub', e.target.value)} data-testid="filter-publication">
                      <option value="">المنشور وغير المنشور</option>
                      <option value="published">المنشور فقط</option>
                      <option value="unpublished">المسودات غير المنشورة</option>
                    </select>
                  </label>
                  <label className="filter">
                    <span>المادة أو المساق</span>
                    <select className="input" value={subject} onChange={(e) => setParam('subject', e.target.value)} data-testid="filter-subject">
                      <option value="">كل المواد</option>
                      {subjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter">
                    <span>الصف أو المرحلة</span>
                    <select className="input" value={grade} onChange={(e) => setParam('grade', e.target.value)} data-testid="filter-grade">
                      <option value="">كل المراحل</option>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter">
                    <span>مرحلة الإعداد</span>
                    <select className="input" value={status} onChange={(e) => setParam('status', e.target.value, 'active')} data-testid="filter-status">
                      <option value="active">غير المؤرشفة</option>
                      <option value="all">الكل</option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter">
                    <span>الترتيب</span>
                    <select className="input" value={sort} onChange={(e) => setParam('sort', e.target.value, 'updated')} data-testid="filter-sort">
                      <option value="updated">آخر تعديل</option>
                      <option value="created">الأحدث إنشاءً</option>
                      <option value="title">العنوان (أ–ي)</option>
                    </select>
                  </label>
                </>
              ) : (
                <label className="filter">
                  <span>حالة الدرس</span>
                  <select className="input" value={lessonStatus} onChange={(e) => setParam('lstatus', e.target.value, 'all')} data-testid="filter-lesson-status">
                    <option value="all">الكل</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(filtersActive || q) && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
                  مسح البحث والتصنيف
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : tab === 'projects' ? (
            shownProjects.length ? (
              <div className="project-grid" data-testid="project-results">
                {shownProjects.map((p) => (
                  <ProjectCard key={p.id} project={p} lessonCount={counts.get(p.id) ?? 0} />
                ))}
              </div>
            ) : (
              <NoResults onClear={clearAll} />
            )
          ) : shownLessons.length ? (
            <ul className="lesson-list" data-testid="lesson-results">
              {shownLessons.map((l) => (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  project={projectMap.get(l.projectId)}
                  onOpen={() => navigate(`/projects/${l.projectId}?lesson=${l.id}`)}
                />
              ))}
            </ul>
          ) : (
            <NoResults onClear={clearAll} lessons />
          )}
        </>
      )}

      <ProjectFormDialog
        key={creating ? 'new' : 'closed'}
        open={creating}
        subjects={subjects}
        onClose={() => setCreating(false)}
        onSave={async (input) => {
          try {
            const p = await createProject(db, input);
            setCreating(false);
            toast({ message: `حُفظ المحتوى «${p.title}» على هذا الجهاز.`, sound: 'save' });
            navigate(`/projects/${p.id}`);
          } catch (e) {
            toast({ message: errorMessage(e), tone: 'danger' });
          }
        }}
      />
    </div>
  );
}

function NoResults({ onClear, lessons }: { onClear: () => void; lessons?: boolean }) {
  return (
    <div className="empty" data-testid="no-results">
      <p>{lessons ? 'لا توجد دروس مطابقة.' : 'لا يوجد محتوى مطابق.'}</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
        مسح البحث والتصنيف
      </button>
    </div>
  );
}
