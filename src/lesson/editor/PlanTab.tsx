import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, ClipboardList, Lightbulb, NotebookPen, Plus, Target, Trash2, TriangleAlert } from 'lucide-react';
import { STATUSES, STATUS_LABEL } from '../../db/catalog';
import type { ItemStatus } from '../../db/db';
import { useToast } from '../../app/Toasts';
import { BLOOM, bloomInfo, checkObjective, detectLevel, objectiveStatement } from '../bloom';
import { ASSESSMENT_TOOLS, ASSESSMENT_TYPES, STRATEGIES } from '../catalog';
import { addObjective, moveObjective, newObjective, removeObjective, restoreObjective, updateObjective } from '../model';
import type { BloomLevel, Objective } from '../types';
import type { EditorState } from '../useLessonEditor';
import { ChipGroup, SectionCard, TextField } from './parts';

type Edit = (fn: (s: EditorState) => EditorState) => void;

export function PlanTab({ state, edit }: { state: EditorState; edit: Edit }) {
  const { doc, meta } = state;
  const toast = useToast();
  const [open, setOpen] = useState<Set<string>>(() => new Set(doc.objectives.length === 1 ? [doc.objectives[0].id] : []));
  const [focusId, setFocusId] = useState<string | null>(null);
  const durationId = useId();
  const statusId = useId();

  const setDoc = (fn: (d: EditorState['doc']) => EditorState['doc']) => edit((s) => ({ ...s, doc: fn(s.doc) }));
  const counts = BLOOM.map((b) => doc.objectives.filter((o) => o.level === b.level).length);
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="plan-grid">
      <div className="plan-main">
        <SectionCard
          title="الأهداف التعليمية"
          icon={<Target size={18} aria-hidden="true" />}
          testId="objectives-section"
          actions={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="add-objective"
              onClick={() => {
                const o = newObjective();
                setDoc((d) => addObjective(d, o));
                setOpen((s) => new Set(s).add(o.id));
                setFocusId(o.id);
              }}
            >
              <Plus size={16} aria-hidden="true" /> هدف جديد
            </button>
          }
        >
          <p className="muted">
            صياغة الهدف: <strong>أن + فعل سلوكي + {doc.audience || 'الطالب'} + المحتوى + الشرط + معيار الأداء</strong>. اختر المستوى ثم فعلًا من بنك أفعال بلوم.
          </p>
          <div className="audience-row">
            <TextField
              label="الفئة في صياغة الأهداف"
              value={doc.audience}
              maxLength={60}
              onChange={(v) => setDoc((d) => ({ ...d, audience: v }))}
              placeholder="الطالب"
            />
          </div>

          {doc.objectives.length === 0 ? (
            <div className="empty" data-testid="objectives-empty">
              <p>لا توجد أهداف بعد.</p>
              <p className="muted">ابدأ بهدف واحد واضح قابل للقياس، ثم اربطه بالمحتوى والأنشطة.</p>
            </div>
          ) : (
            <ol className="objective-list" data-testid="objective-list">
              {doc.objectives.map((o, i) => (
                <ObjectiveCard
                  key={o.id}
                  objective={o}
                  index={i}
                  audience={doc.audience}
                  expanded={open.has(o.id)}
                  autoFocus={focusId === o.id}
                  isFirst={i === 0}
                  isLast={i === doc.objectives.length - 1}
                  onToggle={() =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(o.id)) n.delete(o.id);
                      else n.add(o.id);
                      return n;
                    })
                  }
                  onChange={(patch) => setDoc((d) => updateObjective(d, o.id, patch))}
                  onMove={(dir) => setDoc((d) => moveObjective(d, o.id, dir))}
                  onRemove={() => {
                    let removed: ReturnType<typeof removeObjective>['removed'] = null;
                    setDoc((d) => {
                      const r = removeObjective(d, o.id);
                      removed = r.removed;
                      return r.doc;
                    });
                    toast({
                      message: `حُذف الهدف ${i + 1}.`,
                      action: {
                        label: 'تراجع',
                        run: () => {
                          if (removed) {
                            const r = removed;
                            setDoc((d) => restoreObjective(d, r));
                          }
                        },
                      },
                    });
                  }}
                />
              ))}
            </ol>
          )}

          {doc.objectives.length > 0 && (
            <div className="bloom-dist" aria-label="توزيع الأهداف على مستويات بلوم" data-testid="bloom-distribution">
              {BLOOM.map((b, i) => (
                <div key={b.level} className={`bloom-bar b${b.level}`}>
                  <span className="bloom-bar-track">
                    <span className="bloom-bar-fill" style={{ blockSize: `${(counts[i] / maxCount) * 100}%` }} />
                  </span>
                  <span className="bloom-bar-n">{counts[i]}</span>
                  <span className="bloom-bar-l">{b.name}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="plan-side">
        <SectionCard title="بطاقة الدرس" icon={<NotebookPen size={18} aria-hidden="true" />}>
          <TextField
            label="ملخص الدرس"
            multiline
            value={meta.summary}
            maxLength={1000}
            onChange={(v) => edit((s) => ({ ...s, meta: { ...s.meta, summary: v } }))}
            testId="lesson-summary-field"
          />
          <div className="form-row">
            <div className="field">
              <label className="field-label" htmlFor={durationId}>
                المدة (دقيقة)
              </label>
              <input
                id={durationId}
                className="input"
                inputMode="numeric"
                value={meta.duration ? String(meta.duration) : ''}
                placeholder="45"
                onChange={(e) => {
                  const raw = e.target.value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
                  const n = raw ? Math.min(600, Number(raw)) : 0;
                  edit((s) => ({ ...s, meta: { ...s.meta, duration: n } }));
                }}
                data-testid="lesson-duration-field"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={statusId}>
                الحالة
              </label>
              <select
                id={statusId}
                className="input"
                value={meta.status}
                onChange={(e) => edit((s) => ({ ...s, meta: { ...s.meta, status: e.target.value as ItemStatus } }))}
                data-testid="lesson-status-field"
              >
                {STATUSES.map((x) => (
                  <option key={x} value={x}>
                    {STATUS_LABEL[x]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="الاستراتيجية التعليمية" icon={<Lightbulb size={18} aria-hidden="true" />} testId="strategy-section">
          <ChipGroup label="الاستراتيجيات" options={STRATEGIES} value={doc.strategies} onChange={(v) => setDoc((d) => ({ ...d, strategies: v }))} testId="strategy-chips" />
          <TextField
            label="لماذا اخترتها؟ (مبررات تربوية)"
            multiline
            value={doc.strategyNotes}
            maxLength={3000}
            placeholder="مثال: التعلم التعاوني يتيح للطلاب تبادل الأفكار حول مصادر الطاقة في بيئتهم…"
            onChange={(v) => setDoc((d) => ({ ...d, strategyNotes: v }))}
            testId="strategy-notes"
          />
        </SectionCard>

        <SectionCard title="التقويم" icon={<ClipboardList size={18} aria-hidden="true" />} testId="assessment-section">
          <span className="field-label">نوع التقويم</span>
          <ChipGroup label="نوع التقويم" options={ASSESSMENT_TYPES} value={doc.assessmentTypes} onChange={(v) => setDoc((d) => ({ ...d, assessmentTypes: v }))} testId="assessment-types" />
          <span className="field-label">أدوات التقويم</span>
          <ChipGroup label="أدوات التقويم" options={ASSESSMENT_TOOLS} value={doc.assessmentTools} onChange={(v) => setDoc((d) => ({ ...d, assessmentTools: v }))} testId="assessment-tools" />
          <TextField
            label="إجراءات التقويم"
            multiline
            value={doc.assessmentNotes}
            maxLength={3000}
            placeholder="متى وكيف سيُقاس تحقق الأهداف؟"
            onChange={(v) => setDoc((d) => ({ ...d, assessmentNotes: v }))}
            testId="assessment-notes"
          />
          <p className="muted">الاختبارات الإلكترونية المرتبطة بالأهداف تُبنى في المرحلة 3.</p>
        </SectionCard>
      </div>
    </div>
  );
}

function ObjectiveCard({
  objective: o,
  index,
  audience,
  expanded,
  autoFocus,
  isFirst,
  isLast,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  objective: Objective;
  index: number;
  audience: string;
  expanded: boolean;
  autoFocus: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Objective>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const verbRef = useRef<HTMLInputElement>(null);
  const check = checkObjective(o);
  const statement = objectiveStatement(o, audience);
  const info = bloomInfo(o.level);
  const levelVerbs = info?.verbs ?? [];

  useEffect(() => {
    if (autoFocus && expanded) window.setTimeout(() => verbRef.current?.focus({ preventScroll: false }), 50);
  }, [autoFocus, expanded]);

  const StatusIcon = check.level === 'ok' ? CircleCheck : check.level === 'warn' ? TriangleAlert : CircleAlert;

  return (
    <li className={`objective ${expanded ? 'is-open' : ''}`} data-testid="objective">
      <div className="objective-head">
        <span className={`objective-num ${o.level ? `b${o.level}` : ''}`} aria-hidden="true">
          {index + 1}
        </span>
        <button type="button" className="objective-summary" aria-expanded={expanded} onClick={onToggle} aria-label={`الهدف ${index + 1}: ${statement || 'غير مكتمل'}`}>
          <span className="objective-meta">
            <span className={`bloom-tag ${o.level ? `b${o.level}` : 'b0'}`}>{info ? info.name : 'بلا مستوى'}</span>
            <StatusIcon size={15} className={`chk chk-${check.level}`} aria-label={check.level === 'ok' ? 'مكتمل' : check.level === 'warn' ? 'يحتاج تحسينًا' : 'غير مكتمل'} />
          </span>
          <span className="objective-text" data-testid="objective-statement">
            {statement || <span className="muted">هدف جديد — اضغط لكتابته</span>}
          </span>
        </button>
        <span className="row-actions">
          <button type="button" className="icon-btn" aria-label={`نقل الهدف ${index + 1} إلى الأعلى`} disabled={isFirst} onClick={() => onMove(-1)}>
            <ArrowUp size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label={`نقل الهدف ${index + 1} إلى الأسفل`} disabled={isLast} onClick={() => onMove(1)}>
            <ArrowDown size={18} />
          </button>
          <button type="button" className="icon-btn danger" aria-label={`حذف الهدف ${index + 1}`} onClick={onRemove}>
            <Trash2 size={18} />
          </button>
        </span>
      </div>

      {expanded && (
        <div className="objective-body">
          <div className="field">
            <span className="field-label" id={`${uid}-lvl`}>
              مستوى بلوم
            </span>
            <div className="bloom-levels" role="radiogroup" aria-labelledby={`${uid}-lvl`}>
              {BLOOM.map((b) => (
                <button
                  key={b.level}
                  type="button"
                  role="radio"
                  aria-checked={o.level === b.level}
                  className={`bloom-level b${b.level} ${o.level === b.level ? 'is-on' : ''}`}
                  title={b.hint}
                  aria-label={`${b.level} ${b.name}`}
                  onClick={() => onChange({ level: b.level as BloomLevel })}
                >
                  <span className="bloom-level-n">{b.level}</span>
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor={`${uid}-verb`}>
              الفعل السلوكي
            </label>
            <input
              ref={verbRef}
              id={`${uid}-verb`}
              className="input"
              value={o.verb}
              maxLength={60}
              placeholder={info ? `مثل: ${info.verbs[0]}` : 'اختر مستوى أو اكتب فعلًا'}
              list={`${uid}-verbs`}
              onChange={(e) => {
                const v = e.target.value;
                const lvl = detectLevel(v);
                onChange(lvl && !o.level ? { verb: v, level: lvl } : { verb: v });
              }}
              data-testid="objective-verb"
            />
            <datalist id={`${uid}-verbs`}>
              {BLOOM.flatMap((b) => b.verbs).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            {info ? (
              <div className="verb-bank" role="group" aria-label={`أفعال مستوى ${info.name}`} data-testid="verb-bank">
                {levelVerbs.map((v) => (
                  <button key={v} type="button" className={`verb ${o.verb === v ? 'is-on' : ''}`} aria-pressed={o.verb === v} onClick={() => onChange({ verb: v })}>
                    {v}
                  </button>
                ))}
              </div>
            ) : (
              <span className="field-hint">اختر مستوى بلوم لعرض أفعاله المقترحة.</span>
            )}
          </div>

          <TextField label="المحتوى (ماذا سيؤدي؟)" value={o.content} maxLength={500} placeholder="مثل: ثلاثة مصادر للطاقة المتجددة" onChange={(v) => onChange({ content: v })} testId="objective-content" />
          <div className="form-row">
            <TextField label="الشرط (اختياري)" value={o.condition} maxLength={300} placeholder="مثل: بعد مشاهدة الفيديو" onChange={(v) => onChange({ condition: v })} testId="objective-condition" />
            <TextField label="معيار الأداء" value={o.criterion} maxLength={300} placeholder="مثل: دون أخطاء" onChange={(v) => onChange({ criterion: v })} testId="objective-criterion" />
          </div>

          <div className={`objective-preview chk-box-${check.level}`}>
            <span className="field-label">الهدف كما سيظهر</span>
            <p>{statement || '—'}</p>
            {check.messages.length > 0 && (
              <ul className="check-list" data-testid="objective-checks">
                {check.messages.map((m) => (
                  <li key={m.text} className={`chk-${m.level}`}>
                    {m.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
