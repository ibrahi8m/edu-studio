import { useId } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { parseFill } from '../grading';
import { matchingChoices } from '../model';
import type { Answer, Question } from '../types';

/** One question as the student answers it. Native inputs: keyboard, touch and screen readers work as expected. */
export function QuestionView({
  q,
  answer,
  optionOrder,
  onChange,
}: {
  q: Question;
  answer: Answer | undefined;
  optionOrder: string[] | undefined;
  onChange: (a: Answer) => void;
}) {
  const uid = useId();
  switch (q.type) {
    case 'mcq': {
      const order = optionOrder?.length ? optionOrder : q.options.map((o) => o.id);
      const options = order.map((id) => q.options.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => !!o);
      const selected = answer?.type === 'mcq' ? answer.selected : [];
      return (
        <fieldset className="answer-set">
          <legend className="sr-only">الخيارات</legend>
          {q.multiple && <p className="answer-hint">اختر كل الإجابات الصحيحة.</p>}
          <div className="choices">
            {options.map((o) => {
              const on = selected.includes(o.id);
              return (
                <label key={o.id} className={`choice ${on ? 'is-on' : ''}`}>
                  <input
                    type={q.multiple ? 'checkbox' : 'radio'}
                    name={`${uid}-mcq`}
                    checked={on}
                    onChange={() =>
                      onChange({ type: 'mcq', selected: q.multiple ? (on ? selected.filter((x) => x !== o.id) : [...selected, o.id]) : [o.id] })
                    }
                    data-testid="take-option"
                  />
                  <span>{o.text}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }
    case 'truefalse': {
      const v = answer?.type === 'truefalse' ? answer.value : null;
      return (
        <fieldset className="answer-set">
          <legend className="sr-only">صح أم خطأ</legend>
          <div className="choices choices-tf">
            {[true, false].map((b) => (
              <label key={String(b)} className={`choice ${v === b ? 'is-on' : ''}`}>
                <input type="radio" name={`${uid}-tf`} checked={v === b} onChange={() => onChange({ type: 'truefalse', value: b })} data-testid={b ? 'take-true' : 'take-false'} />
                <span>{b ? 'صح' : 'خطأ'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case 'short': {
      const text = answer?.type === 'short' ? answer.text : '';
      return (
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-s`}>
            إجابتك
          </label>
          <input id={`${uid}-s`} className="input input-lg" value={text} maxLength={300} autoComplete="off" onChange={(e) => onChange({ type: 'short', text: e.target.value })} data-testid="take-short" />
        </div>
      );
    }
    case 'matching': {
      const map = answer?.type === 'matching' ? answer.map : {};
      const all = matchingChoices(q);
      const order = optionOrder?.length ? optionOrder : all.map((c) => c.key);
      const choices = order.map((k) => all.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => !!c);
      return (
        <ol className="match-list">
          {q.pairs.map((p, i) => (
            <li key={p.id} className="match-row">
              <label className="match-left" htmlFor={`${uid}-m${i}`}>
                {p.left}
              </label>
              <select
                id={`${uid}-m${i}`}
                className="input"
                value={map[p.id] ?? ''}
                onChange={(e) => onChange({ type: 'matching', map: { ...map, [p.id]: e.target.value } })}
                data-testid="take-match"
              >
                <option value="">اختر…</option>
                {choices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.text}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ol>
      );
    }
    case 'ordering': {
      const cur = answer?.type === 'ordering' ? answer : { type: 'ordering' as const, order: q.items.map((i) => i.id), touched: false };
      const byId = new Map(q.items.map((i) => [i.id, i.text]));
      const move = (i: number, d: -1 | 1) => {
        const j = i + d;
        if (j < 0 || j >= cur.order.length) return;
        const order = cur.order.slice();
        [order[i], order[j]] = [order[j], order[i]];
        onChange({ type: 'ordering', order, touched: true });
      };
      return (
        <div className="stack">
          <p className="answer-hint">رتّب العناصر من الأول إلى الأخير باستخدام الأسهم.</p>
          <ol className="order-list" data-testid="take-order">
            {cur.order.map((id, i) => (
              <li key={id} className="order-row">
                <span className="order-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="order-text" data-testid="take-order-text">
                  {byId.get(id)}
                </span>
                <span className="row-actions">
                  <button type="button" className="icon-btn" aria-label={`نقل «${byId.get(id)}» للأعلى`} disabled={i === 0} onClick={() => move(i, -1)} data-testid="take-order-up">
                    <ArrowUp size={18} />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`نقل «${byId.get(id)}» للأسفل`} disabled={i === cur.order.length - 1} onClick={() => move(i, 1)} data-testid="take-order-down">
                    <ArrowDown size={18} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={`btn btn-sm ${cur.touched ? 'btn-ghost' : ''}`}
            aria-pressed={cur.touched}
            onClick={() => onChange({ ...cur, touched: true })}
            data-testid="take-order-confirm"
          >
            <Check size={16} aria-hidden="true" /> {cur.touched ? 'اعتُمد هذا الترتيب' : 'اعتمد هذا الترتيب'}
          </button>
        </div>
      );
    }
    case 'fill': {
      const blanks = answer?.type === 'fill' ? answer.blanks : [];
      const parts = parseFill(q.text);
      return (
        <p className="fill-text">
          {parts.map((p, i) =>
            p.kind === 'text' ? (
              <span key={i}>{p.text}</span>
            ) : (
              <input
                key={i}
                className="input fill-input"
                aria-label={`الفراغ ${p.index + 1}`}
                value={blanks[p.index] ?? ''}
                maxLength={120}
                autoComplete="off"
                size={Math.max(6, Math.min(18, Math.max(...p.answers.map((a) => a.length)) + 2))}
                onChange={(e) => {
                  const next = blanks.slice();
                  next[p.index] = e.target.value;
                  onChange({ type: 'fill', blanks: next });
                }}
                data-testid="take-blank"
              />
            ),
          )}
        </p>
      );
    }
  }
}
