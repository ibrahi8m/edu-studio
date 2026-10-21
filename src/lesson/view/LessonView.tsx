import { createContext, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, Circle, ClipboardList, Clock, Download, FileText, GraduationCap, ImageOff, Lightbulb, Package, Repeat2, Target, Users } from 'lucide-react';
import type { Lesson, Project } from '../../db/db';
import { minutesLabel } from '../../app/format';
import { bloomInfo, objectiveStatement } from '../bloom';
import { ASSESSMENT_TOOLS, ASSESSMENT_TYPES, GROUPING_LABEL, optionLabel, STRATEGIES, TRACK_LABEL } from '../catalog';
import { activitySteps, alignment, filledCards, filledPoints } from '../model';
import { useAssetUrl } from '../media';
import type { ActivityBlock, AudioBlock, Block, CardsBlock, FileBlock, ImageBlock, LessonDoc, SummaryBlock, VideoBlock } from '../types';
import { COVERAGE_LABEL } from '../editor/AlignmentTab';
import { RichText } from './RichText';

/** The lesson as a learner sees it. Layout adapts to its own width (container queries), so the phone frame previews correctly on a computer. */
type LessonHead = Pick<Lesson, 'title' | 'summary' | 'duration'>;

export function LessonHero({ lesson, project }: { lesson: LessonHead; project: Project | null }) {
  const meta = [project?.subject, project?.grade].filter(Boolean).join(' · ');
  return (
    <header className="lv-hero">
      {meta && <span className="lv-kicker">{meta}</span>}
      <h1 className="lv-title" data-testid="lv-title">
        {lesson.title}
      </h1>
      {lesson.duration > 0 && (
        <span className="lv-chip">
          <Clock size={14} aria-hidden="true" /> {minutesLabel(lesson.duration)}
        </span>
      )}
      {lesson.summary && <p className="lv-summary">{lesson.summary}</p>}
    </header>
  );
}

export function LessonObjectives({ doc, showLevels = false }: { doc: LessonDoc; showLevels?: boolean }) {
  const objectives = doc.objectives.filter((o) => o.verb.trim() || o.content.trim());
  if (!objectives.length) return null;
  return (
    <section className="lv-objectives" aria-labelledby="lv-obj-h">
      <h2 id="lv-obj-h">
        <Target size={18} aria-hidden="true" /> بنهاية هذا الدرس يُتوقع منك
      </h2>
      <ol>
        {objectives.map((o) => (
          <li key={o.id}>
            {objectiveStatement(o, doc.audience)}
            {showLevels && o.level ? <span className={`bloom-tag b${o.level}`}>{bloomInfo(o.level)!.name}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The lesson as a learner sees it. Layout adapts to its own width (container queries), so the phone frame previews correctly on a computer. */
export function LessonView({ lesson, project, doc, teacherNotes }: { lesson: LessonHead; project: Project | null; doc: LessonDoc; teacherNotes: boolean }) {
  return (
    <article className="lv" data-testid="lesson-view">
      <LessonHero lesson={lesson} project={project} />
      <LessonObjectives doc={doc} showLevels={teacherNotes} />

      {teacherNotes && <TeacherPanel doc={doc} />}

      {doc.blocks.length === 0 ? (
        <p className="lv-empty">لم يُضف محتوى لهذا الدرس بعد.</p>
      ) : (
        <div className="lv-blocks">
          {doc.blocks.map((b) => (
            <ViewBlock key={b.id} block={b} />
          ))}
        </div>
      )}
      <footer className="lv-end">
        <CheckCircle2 size={18} aria-hidden="true" /> نهاية الدرس
      </footer>
    </article>
  );
}

function TeacherPanel({ doc }: { doc: LessonDoc }) {
  const report = alignment(doc);
  return (
    <aside className="lv-teacher" aria-label="القرارات التربوية" data-testid="teacher-panel">
      <h2>
        <GraduationCap size={18} aria-hidden="true" /> لماذا صُمم الدرس هكذا؟
      </h2>
      <dl>
        <dt>الاستراتيجية</dt>
        <dd>{doc.strategies.length ? doc.strategies.map((s) => optionLabel(STRATEGIES, s)).join('، ') : 'لم تُحدَّد'}</dd>
        {doc.strategyNotes && (
          <>
            <dt>المبررات</dt>
            <dd className="pre">{doc.strategyNotes}</dd>
          </>
        )}
        <dt>التقويم</dt>
        <dd>
          {[...doc.assessmentTypes.map((t) => optionLabel(ASSESSMENT_TYPES, t)), ...doc.assessmentTools.map((t) => optionLabel(ASSESSMENT_TOOLS, t))].join('، ') || 'لم يُحدَّد'}
        </dd>
        {doc.assessmentNotes && (
          <>
            <dt>إجراءات التقويم</dt>
            <dd className="pre">{doc.assessmentNotes}</dd>
          </>
        )}
        {report.rows.length > 0 && (
          <>
            <dt>تغطية الأهداف</dt>
            <dd>
              {report.rows.map((r) => (
                <span key={r.objective.id} className={`cov cov-${r.status}`}>
                  الهدف {r.index + 1}: {COVERAGE_LABEL[r.status]}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
    </aside>
  );
}

/**
 * Lets a host page (the student's lesson player) remember which cards were turned over and which
 * activity steps were ticked. Without a provider these stay local to the page, as in the teacher preview.
 */
export interface LessonInteraction {
  flipped: (blockId: string) => string[];
  onFlip: (blockId: string, cardId: string) => void;
  stepsDone: (blockId: string) => number[];
  onStep: (blockId: string, step: number) => void;
  /** Extra content under an activity (the learner's assignment panel). */
  activityExtra?: (block: ActivityBlock) => ReactNode;
}
export const LessonInteractionContext = createContext<LessonInteraction | null>(null);

export function ViewBlock({ block: b }: { block: Block }) {
  switch (b.type) {
    case 'heading':
      return b.text.trim() ? b.level === 2 ? <h2 className="lv-h2">{b.text}</h2> : <h3 className="lv-h3">{b.text}</h3> : null;
    case 'text':
      return b.text.trim() ? <RichText text={b.text} /> : null;
    case 'image':
      return <ViewImage b={b} />;
    case 'audio':
    case 'video':
      return <ViewAv b={b} />;
    case 'cards':
      return <ViewCards b={b} />;
    case 'summary':
      return <ViewSummary b={b} />;
    case 'activity':
      return <ViewActivity b={b} />;
    case 'file':
      return <ViewFile b={b} />;
  }
}

function ViewFile({ b }: { b: FileBlock }) {
  const { url, asset, state } = useAssetUrl(b.assetId);
  return (
    <section className="lv-file" aria-label={b.title || 'ملف مرفق'} data-testid="lv-file">
      <span className="lv-activity-icon" aria-hidden="true">
        <FileText size={20} />
      </span>
      <div className="lv-file-body">
        <h3>{b.title || asset?.name || 'ملف مرفق'}</h3>
        {b.description && <p className="pre">{b.description}</p>}
        {state === 'none' || state === 'missing' ? (
          <span className="lv-missing">{state === 'none' ? 'لم يُرفق ملف بعد.' : 'الملف غير موجود على هذا الجهاز.'}</span>
        ) : url && asset ? (
          <a className="btn btn-sm" href={url} download={asset.name} data-testid="lv-file-download">
            <Download size={16} aria-hidden="true" /> تنزيل «{asset.name}»
          </a>
        ) : (
          <span className="lv-media-loading" />
        )}
      </div>
    </section>
  );
}

function ViewImage({ b }: { b: ImageBlock }) {
  const { url, state } = useAssetUrl(b.assetId);
  if (state === 'none' || state === 'missing')
    return (
      <div className="lv-missing">
        <ImageOff size={20} aria-hidden="true" /> {state === 'none' ? 'لم تُضف صورة بعد.' : 'الصورة غير موجودة على هذا الجهاز.'}
      </div>
    );
  return (
    <figure className="lv-figure">
      {url ? <img src={url} alt={b.decorative ? '' : b.alt} data-testid="lv-image" /> : <span className="lv-media-loading" />}
      {b.caption && <figcaption>{b.caption}</figcaption>}
    </figure>
  );
}

function ViewAv({ b }: { b: AudioBlock | VideoBlock }) {
  const { url, state } = useAssetUrl(b.assetId);
  return (
    <section className={`lv-av lv-${b.type}`}>
      {b.title && <h3 className="lv-av-title">{b.title}</h3>}
      {state === 'none' || state === 'missing' ? (
        <div className="lv-missing">{state === 'none' ? 'لم يُضف ملف بعد.' : 'الملف غير موجود على هذا الجهاز.'}</div>
      ) : url ? (
        b.type === 'video' ? (
          <video src={url} controls playsInline preload="metadata" data-testid="lv-video" aria-label={b.title || 'فيديو الدرس'} />
        ) : (
          <audio src={url} controls preload="metadata" data-testid="lv-audio" aria-label={b.title || 'تسجيل صوتي'} />
        )
      ) : (
        <span className="lv-media-loading" />
      )}
      {b.transcript.trim() && (
        <details className="lv-transcript">
          <summary>{b.type === 'video' ? 'الوصف المكتوب' : 'النص المكتوب'}</summary>
          <RichText text={b.transcript} />
        </details>
      )}
    </section>
  );
}

function ViewCards({ b }: { b: CardsBlock }) {
  const cards = filledCards(b);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const host = useContext(LessonInteractionContext);
  // Cards already seen (saved) are counted; a card shows its back only while turned over on this visit.
  const seen = host ? new Set(host.flipped(b.id)) : flipped;
  if (!cards.length) return null;
  return (
    <section className="lv-cards" aria-label={b.title || 'بطاقات تعليمية'}>
      <h3 className="lv-sec-title">
        <Repeat2 size={18} aria-hidden="true" /> {b.title || 'بطاقات المراجعة'}
        <span className="lv-count">
          {cards.filter((c) => seen.has(c.id) || flipped.has(c.id)).length}/{cards.length}
        </span>
      </h3>
      <p className="lv-hint">اضغط البطاقة لقلبها.</p>
      <div className="flip-grid">
        {cards.map((c, i) => {
          const on = flipped.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`flip ${on ? 'is-flipped' : ''}`}
              aria-pressed={on}
              aria-label={on ? `البطاقة ${i + 1}: ${c.back}` : `البطاقة ${i + 1}: ${c.front}`}
              onClick={() => {
                setFlipped((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                });
                if (!on) host?.onFlip(b.id, c.id);
              }}
              data-testid="flip-card"
            >
              <span className="flip-inner" aria-hidden="true">
                <span className="flip-face flip-front">{c.front}</span>
                <span className="flip-face flip-back">{c.back}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ViewSummary({ b }: { b: SummaryBlock }) {
  const points = filledPoints(b);
  if (!points.length && !b.title.trim()) return null;
  if (b.style === 'central')
    return (
      <section className="lv-summary-central" aria-label={b.title || 'ملخص'}>
        <div className="central-core">{b.title || 'الفكرة الرئيسية'}</div>
        <ul className="central-branches">
          {points.map((p) => (
            <li key={p.id}>
              <strong>{p.title}</strong>
              {p.text && <span>{p.text}</span>}
            </li>
          ))}
        </ul>
      </section>
    );
  const Tag = b.style === 'steps' ? 'ol' : 'ul';
  return (
    <section className={`lv-summary lv-summary-${b.style}`} aria-label={b.title || 'ملخص'}>
      {b.title && (
        <h3 className="lv-sec-title">
          <Lightbulb size={18} aria-hidden="true" /> {b.title}
        </h3>
      )}
      <Tag className="summary-points">
        {points.map((p, i) => (
          <li key={p.id}>
            <span className="sp-n" aria-hidden="true">
              {i + 1}
            </span>
            <span className="sp-body">
              <strong>{p.title}</strong>
              {p.text && <span>{p.text}</span>}
            </span>
          </li>
        ))}
      </Tag>
    </section>
  );
}

function ViewActivity({ b }: { b: ActivityBlock }) {
  const steps = activitySteps(b);
  const [local, setLocal] = useState<Set<number>>(new Set());
  const host = useContext(LessonInteractionContext);
  const done = host ? new Set(host.stepsDone(b.id)) : local;
  return (
    <section className="lv-activity" aria-label={b.title || 'نشاط'} data-testid="lv-activity">
      <div className="lv-activity-head">
        <span className="lv-activity-icon" aria-hidden="true">
          <ClipboardList size={20} />
        </span>
        <div>
          <span className="lv-kicker">
            {b.submit ? 'تكليف' : 'نشاط'}
            {b.track !== 'core' && <span className={`track-tag track-${b.track}`}> · {TRACK_LABEL[b.track]}</span>}
          </span>
          <h3>{b.title || 'نشاط تعليمي'}</h3>
        </div>
      </div>
      <div className="lv-activity-meta">
        <span className="lv-chip">
          <Users size={14} aria-hidden="true" /> {GROUPING_LABEL[b.grouping]}
        </span>
        {b.duration > 0 && (
          <span className="lv-chip">
            <Clock size={14} aria-hidden="true" /> {minutesLabel(b.duration)}
          </span>
        )}
        {host && steps.length > 0 && (
          <span className="lv-chip" data-testid="activity-progress">
            <CheckCircle2 size={14} aria-hidden="true" /> {steps.filter((_, i) => done.has(i)).length}/{steps.length} خطوات
          </span>
        )}
      </div>
      {steps.length > 0 && (
        <ol className="lv-steps">
          {steps.map((s, i) => {
            const on = done.has(i);
            return (
              <li key={i}>
                <button
                  type="button"
                  className={`step-btn ${on ? 'is-done' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    host
                      ? host.onStep(b.id, i)
                      : setLocal((d) => {
                          const n = new Set(d);
                          if (n.has(i)) n.delete(i);
                          else n.add(i);
                          return n;
                        })
                  }
                  data-testid="activity-step"
                >
                  {on ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
                  <span>{s}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {(b.materials || b.output) && (
        <dl className="lv-activity-dl">
          {b.materials && (
            <>
              <dt>
                <Package size={14} aria-hidden="true" /> المواد
              </dt>
              <dd>{b.materials}</dd>
            </>
          )}
          {b.output && (
            <>
              <dt>
                <CheckCircle2 size={14} aria-hidden="true" /> المطلوب
              </dt>
              <dd>{b.output}</dd>
            </>
          )}
        </dl>
      )}
      {host?.activityExtra?.(b)}
    </section>
  );
}
