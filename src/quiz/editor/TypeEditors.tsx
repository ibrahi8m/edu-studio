import { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Brackets, Check, CheckCircle2, CircleAlert, Plus, Trash2, XCircle } from 'lucide-react';
import { newId } from '../../db/ids';
import { AutoTextarea, TextField } from '../../lesson/editor/parts';
import { parseFill } from '../grading';
import { LIMITS, moveItem } from '../model';
import { matchText } from '../textmatch';
import type { FillQuestion, MatchingQuestion, McqQuestion, OrderingQuestion, Question, ShortQuestion, TextMatch, TrueFalseQuestion } from '../types';

type On<Q extends Question> = (patch: Partial<Q>) => void;

export function Toggle({ checked, onChange, label, hint, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; testId?: string }) {
  return (
    <label className="switch-row toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span>
        {label}
        {hint && <span className="field-hint toggle-hint">{hint}</span>}
      </span>
    </label>
  );
}

/* ───────── multiple choice ───────── */

export function McqEditor({ q, on }: { q: McqQuestion; on: On<McqQuestion> }) {
  const name = useId();
  const [openFb, setOpenFb] = useState<Set<string>>(new Set());
  const setOption = (id: string, patch: Partial<McqQuestion['options'][number]>) => on({ options: q.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const toggleCorrect = (id: string) => {
    if (!q.multiple) on({ correct: [id] });
    else on({ correct: q.correct.includes(id) ? q.correct.filter((c) => c !== id) : [...q.correct, id] });
  };
  return (
    <div className="stack">
      <div className="toggles">
        <Toggle
          checked={q.multiple}
          onChange={(multiple) => on({ multiple, correct: multiple ? q.correct : q.correct.slice(0, 1) })}
          label="أكثر من إجابة صحيحة"
          testId="mcq-multiple"
        />
        {q.multiple && (
          <Toggle checked={q.partial} onChange={(partial) => on({ partial })} label="درجة جزئية" hint="لكل اختيار صحيح نصيب، ويُخصم نصيب لكل اختيار خاطئ (لا تقل عن صفر)." testId="mcq-partial" />
        )}
      </div>
      <fieldset className="opt-fieldset">
        <legend className="field-label">{q.multiple ? 'الخيارات — علّم كل الإجابات الصحيحة' : 'الخيارات — اختر الإجابة الصحيحة'}</legend>
        <ol className="opt-list">
          {q.options.map((o, i) => {
            const on_ = q.correct.includes(o.id);
            return (
              <li key={o.id} className={`opt-row ${on_ ? 'is-correct' : ''}`} data-testid="mcq-option">
                <label className="opt-mark" title="الإجابة الصحيحة">
                  <input type={q.multiple ? 'checkbox' : 'radio'} name={name} checked={on_} onChange={() => toggleCorrect(o.id)} data-testid="mcq-correct" />
                  <span className="sr-only">الخيار {i + 1} صحيح</span>
                </label>
                <div className="opt-fields">
                  <input
                    className="input"
                    value={o.text}
                    maxLength={LIMITS.option}
                    placeholder={`الخيار ${i + 1}`}
                    aria-label={`نص الخيار ${i + 1}`}
                    onChange={(e) => setOption(o.id, { text: e.target.value })}
                    data-testid="mcq-option-text"
                  />
                  {openFb.has(o.id) || o.feedback ? (
                    <input
                      className="input input-sm"
                      value={o.feedback}
                      maxLength={LIMITS.feedback}
                      placeholder="تغذية راجعة عند اختيار هذا الخيار (اختياري)"
                      aria-label={`تغذية راجعة للخيار ${i + 1}`}
                      onChange={(e) => setOption(o.id, { feedback: e.target.value })}
                    />
                  ) : (
                    <button type="button" className="link-btn" onClick={() => setOpenFb((s) => new Set(s).add(o.id))}>
                      + تغذية راجعة لهذا الخيار
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label={`حذف الخيار ${i + 1}`}
                  disabled={q.options.length <= 2}
                  onClick={() => on({ options: q.options.filter((x) => x.id !== o.id), correct: q.correct.filter((c) => c !== o.id) })}
                >
                  <Trash2 size={17} />
                </button>
              </li>
            );
          })}
        </ol>
      </fieldset>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={q.options.length >= 8}
        onClick={() => on({ options: [...q.options, { id: newId(), text: '', feedback: '' }] })}
        data-testid="mcq-add-option"
      >
        <Plus size={16} aria-hidden="true" /> خيار آخر
      </button>
    </div>
  );
}

/* ───────── true / false ───────── */

export function TrueFalseEditor({ q, on }: { q: TrueFalseQuestion; on: On<TrueFalseQuestion> }) {
  return (
    <div className="field">
      <span className="field-label" id={`tf-${q.id}`}>
        العبارة في نص السؤال:
      </span>
      <div className="segmented tf-seg" role="radiogroup" aria-labelledby={`tf-${q.id}`}>
        {[true, false].map((v) => (
          <button key={String(v)} type="button" role="radio" aria-checked={q.answer === v} className={q.answer === v ? 'is-active' : ''} onClick={() => on({ answer: v })} data-testid={v ? 'tf-true' : 'tf-false'}>
            {v ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
            {v ? 'صحيحة' : 'خاطئة'}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────── text matching rules (short answer + fill) ───────── */

function MatchRules({ match, on }: { match: TextMatch; on: (m: TextMatch) => void }) {
  const id = useId();
  return (
    <details className="rules">
      <summary>قواعد قبول الإجابة المكتوبة</summary>
      <div className="stack rules-body">
        <Toggle checked={match.normalize} onChange={(normalize) => on({ ...match, normalize })} label="تجاهل التشكيل والهمزات والتاء المربوطة و«ال» التعريف" />
        <Toggle checked={match.ignorePunctuation} onChange={(ignorePunctuation) => on({ ...match, ignorePunctuation })} label="تجاهل علامات الترقيم والمسافات الزائدة" />
        <div className="field">
          <label className="field-label" htmlFor={id}>
            أخطاء إملائية مقبولة
          </label>
          <select id={id} className="input" value={match.typos} onChange={(e) => on({ ...match, typos: Number(e.target.value) as 0 | 1 | 2 })} data-testid="match-typos">
            <option value={0}>لا شيء — مطابقة تامة</option>
            <option value={1}>خطأ واحد (للإجابات من 5 أحرف فأكثر)</option>
            <option value={2}>خطآن (للإجابات من 9 أحرف فأكثر)</option>
          </select>
        </div>
        <Toggle
          checked={match.reviewAllMismatches}
          onChange={(reviewAllMismatches) => on({ ...match, reviewAllMismatches })}
          label="إرسال كل إجابة غير مطابقة لمراجعتي"
          hint="بدونه تُرسل للمراجعة فقط الإجابات القريبة جدًا أو التي تتضمن الإجابة داخل جملة."
          testId="match-review-all"
        />
      </div>
    </details>
  );
}

/** Lets the teacher type a sample answer and see how it would be graded. */
function MatchTester({ accepted, match }: { accepted: string[]; match: TextMatch }) {
  const id = useId();
  const [sample, setSample] = useState('');
  const r = sample.trim() ? matchText(sample, accepted, match) : null;
  return (
    <div className="field tester">
      <label className="field-label" htmlFor={id}>
        جرّب إجابة طالب
      </label>
      <input id={id} className="input" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="اكتب إجابة لترى كيف ستُصحَّح" data-testid="match-tester" />
      {r && (
        <span className={`tester-out ${r.correct ? 'ok' : r.review ? 'warn' : 'bad'}`} role="status" data-testid="match-tester-result">
          {r.correct ? <Check size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
          {r.correct ? 'تُقبل' : r.review ? 'تُرسل لمراجعة المعلم' : 'تُعدّ خاطئة'}
          {r.note ? ` — ${r.note}` : ''}
        </span>
      )}
    </div>
  );
}

/* ───────── short answer ───────── */

export function ShortEditor({ q, on }: { q: ShortQuestion; on: On<ShortQuestion> }) {
  const setAt = (i: number, v: string) => on({ accepted: q.accepted.map((a, k) => (k === i ? v : a)) });
  return (
    <div className="stack">
      <fieldset className="opt-fieldset">
        <legend className="field-label">الإجابات المقبولة (أي واحدة منها تُعدّ صحيحة)</legend>
        <ol className="opt-list">
          {q.accepted.map((a, i) => (
            <li key={i} className="opt-row">
              <input
                className="input"
                value={a}
                maxLength={LIMITS.option}
                placeholder={i === 0 ? 'الإجابة الصحيحة' : 'صيغة أخرى مقبولة'}
                aria-label={`الإجابة المقبولة ${i + 1}`}
                onChange={(e) => setAt(i, e.target.value)}
                data-testid="short-accepted"
              />
              <button type="button" className="icon-btn danger" aria-label={`حذف الإجابة المقبولة ${i + 1}`} disabled={q.accepted.length <= 1} onClick={() => on({ accepted: q.accepted.filter((_, k) => k !== i) })}>
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ol>
      </fieldset>
      <button type="button" className="btn btn-ghost btn-sm" disabled={q.accepted.length >= 10} onClick={() => on({ accepted: [...q.accepted, ''] })} data-testid="short-add-accepted">
        <Plus size={16} aria-hidden="true" /> صيغة أخرى مقبولة
      </button>
      <MatchRules match={q.match} on={(match) => on({ match })} />
      <MatchTester accepted={q.accepted} match={q.match} />
    </div>
  );
}

/* ───────── matching ───────── */

export function MatchingEditor({ q, on }: { q: MatchingQuestion; on: On<MatchingQuestion> }) {
  const setPair = (id: string, patch: Partial<MatchingQuestion['pairs'][number]>) => on({ pairs: q.pairs.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  return (
    <div className="stack">
      <fieldset className="opt-fieldset">
        <legend className="field-label">الأزواج الصحيحة (يُخلط العمود الثاني للطالب)</legend>
        <ol className="opt-list">
          {q.pairs.map((p, i) => (
            <li key={p.id} className="opt-row pair-row" data-testid="pair-row">
              <span className="pair-n" aria-hidden="true">
                {i + 1}
              </span>
              <div className="pair-fields">
                <input className="input" value={p.left} maxLength={LIMITS.option} placeholder="العنصر" aria-label={`العنصر ${i + 1}`} onChange={(e) => setPair(p.id, { left: e.target.value })} data-testid="pair-left" />
                <span className="pair-arrow" aria-hidden="true">
                  ←
                </span>
                <input className="input" value={p.right} maxLength={LIMITS.option} placeholder="ما يطابقه" aria-label={`ما يطابق العنصر ${i + 1}`} onChange={(e) => setPair(p.id, { right: e.target.value })} data-testid="pair-right" />
              </div>
              <button type="button" className="icon-btn danger" aria-label={`حذف الزوج ${i + 1}`} disabled={q.pairs.length <= 2} onClick={() => on({ pairs: q.pairs.filter((x) => x.id !== p.id) })}>
                <Trash2 size={17} />
              </button>
            </li>
          ))}
        </ol>
      </fieldset>
      <button type="button" className="btn btn-ghost btn-sm" disabled={q.pairs.length >= 10} onClick={() => on({ pairs: [...q.pairs, { id: newId(), left: '', right: '' }] })} data-testid="pair-add">
        <Plus size={16} aria-hidden="true" /> زوج آخر
      </button>
      <TextField
        label="خيارات إضافية خاطئة في العمود الثاني (اختياري، سطر لكل خيار)"
        multiline
        minRows={2}
        value={q.distractors.join('\n')}
        maxLength={3000}
        onChange={(v) => on({ distractors: v.split('\n').map((s) => s.slice(0, LIMITS.option)) })}
        testId="pair-distractors"
      />
      <Toggle checked={q.partial} onChange={(partial) => on({ partial })} label="درجة جزئية لكل مطابقة صحيحة" testId="matching-partial" />
    </div>
  );
}

/* ───────── ordering ───────── */

export function OrderingEditor({ q, on }: { q: OrderingQuestion; on: On<OrderingQuestion> }) {
  return (
    <div className="stack">
      <fieldset className="opt-fieldset">
        <legend className="field-label">اكتب العناصر بترتيبها الصحيح — تُعرض للطالب مخلوطة</legend>
        <ol className="opt-list">
          {q.items.map((it, i) => (
            <li key={it.id} className="opt-row" data-testid="order-item">
              <span className="pair-n" aria-hidden="true">
                {i + 1}
              </span>
              <input
                className="input"
                value={it.text}
                maxLength={LIMITS.option}
                placeholder={`الخطوة ${i + 1}`}
                aria-label={`العنصر ${i + 1}`}
                onChange={(e) => on({ items: q.items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)) })}
                data-testid="order-text"
              />
              <span className="row-actions">
                <button type="button" className="icon-btn" aria-label={`نقل العنصر ${i + 1} للأعلى`} disabled={i === 0} onClick={() => on({ items: moveItem(q.items, it.id, -1) })}>
                  <ArrowUp size={17} />
                </button>
                <button type="button" className="icon-btn" aria-label={`نقل العنصر ${i + 1} للأسفل`} disabled={i === q.items.length - 1} onClick={() => on({ items: moveItem(q.items, it.id, 1) })}>
                  <ArrowDown size={17} />
                </button>
                <button type="button" className="icon-btn danger" aria-label={`حذف العنصر ${i + 1}`} disabled={q.items.length <= 2} onClick={() => on({ items: q.items.filter((x) => x.id !== it.id) })}>
                  <Trash2 size={17} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      </fieldset>
      <button type="button" className="btn btn-ghost btn-sm" disabled={q.items.length >= 10} onClick={() => on({ items: [...q.items, { id: newId(), text: '' }] })} data-testid="order-add">
        <Plus size={16} aria-hidden="true" /> عنصر آخر
      </button>
      <Toggle checked={q.partial} onChange={(partial) => on({ partial })} label="درجة جزئية لكل عنصر في موضعه الصحيح" testId="ordering-partial" />
    </div>
  );
}

/* ───────── fill in the blanks ───────── */

export function FillEditor({ q, on }: { q: FillQuestion; on: On<FillQuestion> }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const blanks = parseFill(q.text).filter((p): p is Extract<ReturnType<typeof parseFill>[number], { kind: 'blank' }> => p.kind === 'blank');
  const makeBlank = () => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = q.text.slice(s, e).trim();
    const insert = `[[${sel || 'الإجابة'}]]`;
    on({ text: q.text.slice(0, s) + insert + q.text.slice(e) });
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(s + 2, s + insert.length - 2);
    }, 0);
  };
  return (
    <div className="stack">
      <div className="field">
        <label className="field-label" htmlFor={id}>
          النص مع الفراغات
        </label>
        <AutoTextarea
          ref={ref}
          id={id}
          minRows={3}
          value={q.text}
          maxLength={5000}
          placeholder="تصنع النباتات غذاءها بعملية [[البناء الضوئي|التمثيل الضوئي]]."
          onChange={(e) => on({ text: e.target.value })}
          data-testid="fill-text"
        />
        <span className="field-hint">
          اكتب الإجابة بين <code dir="ltr">[[ ]]</code> لتصبح فراغًا، وافصل الصيغ المقبولة بالرمز <code dir="ltr">|</code>.
        </span>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={makeBlank} data-testid="fill-make-blank">
        <Brackets size={16} aria-hidden="true" /> تحويل الكلمة المحددة إلى فراغ
      </button>
      {blanks.length > 0 && (
        <ol className="blank-list" aria-label="الفراغات">
          {blanks.map((b) => (
            <li key={b.index}>
              <span className="pair-n">{b.index + 1}</span> {b.answers.length ? b.answers.join(' أو ') : <span className="field-error">بلا إجابة</span>}
            </li>
          ))}
        </ol>
      )}
      <Toggle checked={q.partial} onChange={(partial) => on({ partial })} label="درجة جزئية لكل فراغ صحيح" testId="fill-partial" />
      <MatchRules match={q.match} on={(match) => on({ match })} />
    </div>
  );
}
