import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Clock, FolderKanban, Pencil } from 'lucide-react';
import type { Lesson, Project } from '../db/db';
import { audienceLine, isPublished, KIND_SPECS, kindOf } from '../db/contentKinds';
import { STATUS_LABEL, STATUS_TONE } from '../db/catalog';
import { lessonsLabel, minutesLabel, relativeTime } from '../app/format';
import { Pill } from './ui';
import { DemoBadge } from '../demo/DemoUI';

export function StatusPill({ status }: { status: Project['status'] }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

export function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <ul className="tags" aria-label="الوسوم">
      {tags.map((t) => (
        <li key={t} className="tag">
          #{t}
        </li>
      ))}
    </ul>
  );
}

export function ProjectCard({ project, lessonCount }: { project: Project; lessonCount: number }) {
  const meta = audienceLine(project);
  const kind = kindOf(project);
  return (
    <Link to={`/projects/${project.id}`} className={`project-card c-${project.color}`} data-testid="project-card">
      <span className="project-card-bar" aria-hidden="true" />
      <span className="project-card-head">
        <span className="project-card-icon" aria-hidden="true">
          <FolderKanban size={20} />
        </span>
        <span className="project-card-pills">
          <DemoBadge id={project.id} />
          <Pill tone="neutral">{KIND_SPECS[kind].short}</Pill>
          {!isPublished(project) && (
            <span data-testid="unpublished-pill">
              <Pill tone="warning">غير منشور</Pill>
            </span>
          )}
          <StatusPill status={project.status} />
        </span>
      </span>
      <span className="project-card-title">{project.title}</span>
      {meta && <span className="project-card-meta">{meta}</span>}
      {project.description && <span className="project-card-desc">{project.description}</span>}
      <Tags tags={project.tags.slice(0, 4)} />
      <span className="project-card-foot">
        <span>{lessonsLabel(lessonCount)}</span>
        <span title={`أُنشئ ${new Date(project.createdAt).toLocaleDateString('ar')}`}>عُدّل {relativeTime(project.updatedAt)}</span>
      </span>
    </Link>
  );
}

export function LessonRow({
  lesson,
  index,
  project,
  onOpen,
  onEdit,
  onMove,
  isFirst,
  isLast,
  highlight,
  badge,
}: {
  lesson: Lesson;
  index?: number;
  project?: Project;
  onOpen: () => void;
  /** Quick edit of the lesson card (title, summary, status) without opening the editor. */
  onEdit?: () => void;
  onMove?: (dir: -1 | 1) => void;
  badge?: string;
  isFirst?: boolean;
  isLast?: boolean;
  highlight?: boolean;
}) {
  // Lesson rows open the full lesson editor.
  return (
    <li className={`lesson-row ${highlight ? 'is-highlight' : ''}`} data-testid="lesson-row" id={`lesson-${lesson.id}`}>
      {index != null && (
        <span className="lesson-num" aria-hidden="true">
          {index}
        </span>
      )}
      <button type="button" className="lesson-main" onClick={onOpen} aria-label={`فتح محرر الدرس: ${lesson.title}`}>
        <span className="lesson-title">{lesson.title}</span>
        <span className="lesson-meta">
          {project && <span className="lesson-project">{project.title}</span>}
          {lesson.duration > 0 && (
            <span className="lesson-dur">
              <Clock size={13} aria-hidden="true" /> {minutesLabel(lesson.duration)}
            </span>
          )}
          <span>عُدّل {relativeTime(lesson.updatedAt)}</span>
        </span>
        {lesson.summary && <span className="lesson-summary">{lesson.summary}</span>}
      </button>
      <span className="lesson-side">
        {badge && <span className="pill pill-neutral">{badge}</span>}
        <StatusPill status={lesson.status} />
        {onEdit && (
          <button type="button" className="icon-btn" aria-label={`تعديل بيانات الدرس: ${lesson.title}`} onClick={onEdit} data-testid="lesson-quick-edit">
            <Pencil size={16} />
          </button>
        )}
        {onMove && (
          <span className="lesson-move">
            <button type="button" className="icon-btn" aria-label={`نقل «${lesson.title}» إلى الأعلى`} disabled={isFirst} onClick={() => onMove(-1)}>
              <ChevronUp size={18} />
            </button>
            <button type="button" className="icon-btn" aria-label={`نقل «${lesson.title}» إلى الأسفل`} disabled={isLast} onClick={() => onMove(1)}>
              <ChevronDown size={18} />
            </button>
          </span>
        )}
      </span>
    </li>
  );
}
