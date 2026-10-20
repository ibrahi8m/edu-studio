import { useId } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, CircleAlert, Copy, Link2, Trash2, TriangleAlert } from 'lucide-react';
import { AutoTextarea } from '../../lesson/editor/parts';
import type { ObjectiveRef } from '../../db/quizzes';
import { LIMITS, TYPE_LABEL, validateQuestion } from '../model';
import type { Question } from '../types';
import { FillEditor, MatchingEditor, McqEditor, OrderingEditor, ShortEditor, TrueFalseEditor } from './TypeEditors';
import { QTYPE_ICON } from './icons';

export function QuestionCard({
  q,
  index,
  count,
  objectives,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onLink,
}: {
  q: Question;
  index: number;
  count: number;
  objectives: ObjectiveRef[];
  onPatch: (patch: Partial<Question>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onLink: () => void;
}) {
  const uid = useId();
  const issues = validateQuestion(q);
  const errors = issues.filter((i) => i.level === 'error');
  const Icon = QTYPE_ICON[q.type];
  const name = `السؤال ${index + 1}`;
  const linked = q.objectiveIds.map((id) => objectives.find((o) => o.objective.id === id)).filter((o): o is ObjectiveRef => !!o);
  const dangling = q.objectiveIds.length - linked.length;

  return (
    <li className={`qcard ${errors.length ? 'has-errors' : ''}`} id={`q-${q.id}`} data-testid="question" data-type={q.type}>
      <div className="qcard-head">
        <span className="qcard-n" aria-hidden="true">
          {index + 1}
        </span>
        <span className="qcard-type">
          <Icon size={16} aria-hidden="true" /> {TYPE_LABEL[q.type]}
        </span>
        <label className="points-field">
          <span>الدرجة</span>
          <input
            type="number"
            inputMode="decimal"
            className="input input-sm"
            min={0.5}
            max={LIMITS.points}
            step={0.5}
            value={q.points}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
              onPatch({ points: Number.isFinite(n) ? Math.max(0, Math.min(LIMITS.points, Math.round(n * 100) / 100)) : 0 });
            }}
            aria-label={`درجة ${name}`}
            data-testid="q-points"
          />
        </label>
        <span className="row-actions">
          <button type="button" className="icon-btn" aria-label={`نقل ${name} للأعلى`} disabled={index === 0} onClick={() => onMove(-1)} data-testid="q-up">
            <ArrowUp size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label={`نقل ${name} للأسفل`} disabled={index === count - 1} onClick={() => onMove(1)} data-testid="q-down">
            <ArrowDown size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label={`نسخ ${name}`} onClick={onDuplicate} data-testid="q-duplicate">
            <Copy size={17} />
          </button>
          <button type="button" className="icon-btn danger" aria-label={`حذف ${name}`} onClick={onRemove} data-testid="q-delete">
            <Trash2 size={18} />
          </button>
        </span>
      </div>

      <div className="qcard-body">
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-p`}>
            {q.type === 'fill' ? 'تعليمات (اختياري)' : q.type === 'truefalse' ? 'العبارة' : 'نص السؤال'}
          </label>
          <AutoTextarea
            id={`${uid}-p`}
            minRows={2}
            value={q.prompt}
            maxLength={LIMITS.prompt}
            placeholder={q.type === 'truefalse' ? 'مثل: الفحم مصدر متجدد للطاقة.' : q.type === 'fill' ? 'أكمل الفراغات بما يناسب:' : 'اكتب السؤال بوضوح'}
            onChange={(e) => onPatch({ prompt: e.target.value })}
            data-testid="q-prompt"
          />
        </div>

        {q.type === 'mcq' && <McqEditor q={q} on={onPatch} />}
        {q.type === 'truefalse' && <TrueFalseEditor q={q} on={onPatch} />}
        {q.type === 'short' && <ShortEditor q={q} on={onPatch} />}
        {q.type === 'matching' && <MatchingEditor q={q} on={onPatch} />}
        {q.type === 'ordering' && <OrderingEditor q={q} on={onPatch} />}
        {q.type === 'fill' && <FillEditor q={q} on={onPatch} />}

        <div className="field">
          <span className="field-label">الأهداف التي يقيسها</span>
          <div className="obj-links">
            {linked.map((o) => (
              <span key={o.objective.id} className={`bloom-tag b${o.level || 0}`} title={o.statement}>
                {o.lessonTitle} · هدف {o.number}
              </span>
            ))}
            {dangling > 0 && <span className="pill pill-warning">{dangling === 1 ? 'هدف من درس لم يعد مرتبطًا' : `${dangling} أهداف لم تعد متاحة`}</span>}
            <button type="button" className={`link-btn-chip ${q.objectiveIds.length ? 'is-on' : 'is-warn'}`} onClick={onLink} data-testid="q-link" aria-label={`ربط ${name} بالأهداف`}>
              <Link2 size={14} aria-hidden="true" /> {q.objectiveIds.length ? 'تعديل الربط' : 'ربط بهدف'}
            </button>
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-fc`}>
              تغذية راجعة عند الإجابة الصحيحة
            </label>
            <AutoTextarea id={`${uid}-fc`} minRows={1} value={q.feedbackCorrect} maxLength={LIMITS.feedback} placeholder="أحسنت! …" onChange={(e) => onPatch({ feedbackCorrect: e.target.value })} data-testid="q-feedback-correct" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-fi`}>
              تغذية راجعة / تفسير عند الخطأ
            </label>
            <AutoTextarea id={`${uid}-fi`} minRows={1} value={q.feedbackIncorrect} maxLength={LIMITS.feedback} placeholder="الإجابة الصحيحة هي … لأن …" onChange={(e) => onPatch({ feedbackIncorrect: e.target.value })} data-testid="q-feedback-incorrect" />
          </div>
        </div>

        <div className={`qcard-check ${errors.length ? 'is-error' : issues.length ? 'is-warn' : 'is-ok'}`} data-testid="q-issues">
          {issues.length === 0 ? (
            <>
              <CheckCircle2 size={16} aria-hidden="true" /> السؤال مكتمل وجاهز.
            </>
          ) : (
            <ul>
              {issues.map((i) => (
                <li key={i.text} className={`chk-${i.level}`}>
                  {i.level === 'error' ? <CircleAlert size={15} aria-hidden="true" /> : <TriangleAlert size={15} aria-hidden="true" />} {i.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
