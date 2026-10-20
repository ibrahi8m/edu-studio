import { useState } from 'react';
import { CheckCircle2, Circle, ClipboardList, Clock, GraduationCap, ImageOff, Lightbulb, Package, Repeat2, Target, Users } from 'lucide-react';
import type { Lesson, Project } from '../../db/db';
import { minutesLabel } from '../../app/format';
import { bloomInfo, objectiveStatement } from '../bloom';
import { ASSESSMENT_TOOLS, ASSESSMENT_TYPES, GROUPING_LABEL, optionLabel, STRATEGIES } from '../catalog';
import { activitySteps, alignment, filledCards, filledPoints } from '../model';
import { useAssetUrl } from '../media';
import type { ActivityBlock, AudioBlock, Block, CardsBlock, ImageBlock, LessonDoc, SummaryBlock, VideoBlock } from '../types';
import { COVERAGE_LABEL } from '../editor/AlignmentTab';
import { RichText } from './RichText';

/** The lesson as a learner sees it. Layout adapts to its own width (container queries), so the phone frame previews correctly on a computer. */
export function LessonView({ lesson, project, doc, teacherNotes }: { lesson: Pick<Lesson, 'title' | 'summary' | 'duration'>; project: Project | null; doc: LessonDoc; teacherNotes: boolean }) {
  const objectives = doc.objectives.filter((o) => o.verb.trim() || o.content.trim());
  const meta = [project?.subject, project?.grade].filter(Boolean).join(' · ');
  return (
    <article className="lv" data-testid="lesson-view">
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

      {objectives.length > 0 && (
        <section className="lv-objectives" aria-labelledby="lv-obj-h">
          <h2 id="lv-obj-h">
            <Target size={18} aria-hidden="true" /> بنهاية هذا الدرس يُتوقع منك
          </h2>
          <ol>
            {objectives.map((o) => (
              <li key={o.id}>
                {objectiveStatement(o, doc.audience)}
                {teacherNotes && o.level ? <span className={`bloom-tag b${o.level}`}>{bloomInfo(o.level)!.name}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      )}

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

function ViewBlock({ block: b }: { block: Block }) {
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
  }
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
  if (!cards.length) return null;
  return (
    <section className="lv-cards" aria-label={b.title || 'بطاقات تعليمية'}>
      <h3 className="lv-sec-title">
        <Repeat2 size={18} aria-hidden="true" /> {b.title || 'بطاقات المراجعة'}
        <span className="lv-count">
          {flipped.size}/{cards.length}
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
              onClick={() =>
                setFlipped((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                })
              }
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
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <section className="lv-activity" aria-label={b.title || 'نشاط'} data-testid="lv-activity">
      <div className="lv-activity-head">
        <span className="lv-activity-icon" aria-hidden="true">
          <ClipboardList size={20} />
        </span>
        <div>
          <span className="lv-kicker">نشاط</span>
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
                    setDone((d) => {
                      const n = new Set(d);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
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
    </section>
  );
}
