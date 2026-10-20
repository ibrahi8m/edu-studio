import { useEffect, useState } from 'react';
import { Check, CircleAlert, CircleCheck, Info, Target, TriangleAlert } from 'lucide-react';
import { bloomInfo, objectiveStatement } from '../bloom';
import { BLOCK_META } from '../catalog';
import { alignment, blockLabel, toggleLink, type CoverageStatus } from '../model';
import type { LessonDoc } from '../types';
import type { EditorState } from '../useLessonEditor';
import { BLOCK_ICON } from './BlockEditors';

type Edit = (fn: (s: EditorState) => EditorState) => void;

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  covered: 'مغطى',
  partial: 'تغطية جزئية',
  uncovered: 'غير مغطى',
};

function StatusBadge({ status }: { status: CoverageStatus }) {
  const Icon = status === 'covered' ? CircleCheck : status === 'partial' ? TriangleAlert : CircleAlert;
  return (
    <span className={`cov cov-${status}`}>
      <Icon size={14} aria-hidden="true" />
      {COVERAGE_LABEL[status]}
    </span>
  );
}

export function AlignmentTab({ state, edit, onGoToPlan, onGoToContent }: { state: EditorState; edit: Edit; onGoToPlan: () => void; onGoToContent: () => void }) {
  const { doc } = state;
  const narrow = useMediaQuery('(max-width: 767px)');
  const report = alignment(doc);
  const columns = doc.blocks.filter((b) => BLOCK_META[b.type].role !== 'structure');
  const setDoc = (fn: (d: LessonDoc) => LessonDoc) => edit((s) => ({ ...s, doc: fn(s.doc) }));
  const toggle = (blockId: string, objectiveId: string) => setDoc((d) => toggleLink(d, blockId, objectiveId));
  const blockIndex = (id: string) => doc.blocks.findIndex((b) => b.id === id) + 1;

  if (doc.objectives.length === 0)
    return (
      <section className="card empty-hero" data-testid="alignment-empty">
        <Target size={30} className="muted-icon" aria-hidden="true" />
        <h2>اكتب أهداف الدرس أولًا</h2>
        <p className="muted">تربط المصفوفة كل هدف بكتل المحتوى والأنشطة التي تحققه، وتنبّهك إلى أي هدف لم يُغطَّ.</p>
        <button type="button" className="btn btn-primary" onClick={onGoToPlan}>
          الانتقال إلى الأهداف
        </button>
      </section>
    );

  const uncoveredNums = report.rows.filter((r) => r.status === 'uncovered').map((r) => r.index + 1);
  const partialNums = report.rows.filter((r) => r.status === 'partial').map((r) => r.index + 1);

  return (
    <div className="alignment">
      <div className="align-alerts">
        {uncoveredNums.length > 0 && (
          <div className="align-alert is-error" role="alert" data-testid="alignment-alert">
            <CircleAlert size={20} aria-hidden="true" />
            <div>
              <strong>{uncoveredNums.length === 1 ? 'هدف غير مغطى' : `${uncoveredNums.length} أهداف غير مغطاة`}: الهدف {uncoveredNums.join('، ')}.</strong>
              <p>لا توجد أي كتلة محتوى أو نشاط مرتبطة به. اربطه بكتلة موجودة من المصفوفة، أو أضف محتوى جديدًا.</p>
            </div>
          </div>
        )}
        {partialNums.length > 0 && (
          <div className="align-alert is-warn" data-testid="alignment-partial">
            <TriangleAlert size={20} aria-hidden="true" />
            <div>
              <strong>تغطية جزئية: الهدف {partialNums.join('، ')}.</strong>
              <p>يكتمل الهدف بكتلة شرح (نص، صورة، فيديو، صوت، ملخص) وكتلة ممارسة (نشاط أو بطاقات).</p>
            </div>
          </div>
        )}
        {uncoveredNums.length === 0 && partialNums.length === 0 && (
          <div className="align-alert is-ok" data-testid="alignment-ok">
            <CircleCheck size={20} aria-hidden="true" />
            <div>
              <strong>كل الأهداف مغطاة بالمحتوى والممارسة.</strong>
            </div>
          </div>
        )}
        {report.unlinkedBlockIds.length > 0 && (
          <div className="align-alert is-info" data-testid="alignment-unlinked">
            <Info size={20} aria-hidden="true" />
            <div>
              <strong>كتل غير مرتبطة بأي هدف: {report.unlinkedBlockIds.map(blockIndex).map((n) => `#${n}`).join('، ')}.</strong>
              <p>كل كتلة في الدرس يُفضَّل أن تخدم هدفًا محددًا.</p>
            </div>
          </div>
        )}
      </div>

      {columns.length === 0 ? (
        <section className="card empty-hero">
          <p>لا توجد كتل محتوى لربطها بعد.</p>
          <button type="button" className="btn" onClick={onGoToContent}>
            الانتقال إلى المحتوى
          </button>
        </section>
      ) : narrow ? (
        <ol className="cov-list" data-testid="alignment-list">
          {report.rows.map((r) => (
            <li key={r.objective.id} className={`cov-card cov-card-${r.status}`} data-testid="coverage-row" data-status={r.status}>
              <div className="cov-card-head">
                <span className={`objective-num ${r.objective.level ? `b${r.objective.level}` : ''}`}>{r.index + 1}</span>
                <StatusBadge status={r.status} />
              </div>
              <p className="cov-card-text">{objectiveStatement(r.objective, doc.audience) || 'هدف غير مكتمل'}</p>
              <span className="field-label">الكتل التي تحقق هذا الهدف</span>
              <div className="cov-chips" role="group" aria-label={`كتل الهدف ${r.index + 1}`}>
                {columns.map((b) => {
                  const on = b.objectiveIds.includes(r.objective.id);
                  const Icon = BLOCK_ICON[b.type];
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={`cov-chip ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(b.id, r.objective.id)}
                      data-testid="matrix-cell"
                    >
                      {on ? <Check size={14} aria-hidden="true" /> : <Icon size={14} aria-hidden="true" />}#{blockIndex(b.id)} {blockLabel(b)}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="matrix-wrap" data-testid="alignment-matrix">
          <table className="matrix">
            <caption className="sr-only">مصفوفة مواءمة الأهداف مع المحتوى والأنشطة</caption>
            <thead>
              <tr>
                <th scope="col" className="matrix-obj-h">
                  الهدف
                </th>
                {columns.map((b) => {
                  const Icon = BLOCK_ICON[b.type];
                  return (
                    <th scope="col" key={b.id} className={`matrix-col role-${BLOCK_META[b.type].role}`} title={blockLabel(b)}>
                      <span className="matrix-col-in">
                        <Icon size={16} aria-hidden="true" />
                        <span className="matrix-col-n">#{blockIndex(b.id)}</span>
                        <span className="matrix-col-t">{BLOCK_META[b.type].label}</span>
                      </span>
                    </th>
                  );
                })}
                <th scope="col">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.objective.id} className={`row-${r.status}`} data-testid="coverage-row" data-status={r.status}>
                  <th scope="row" className="matrix-obj">
                    <span className={`objective-num ${r.objective.level ? `b${r.objective.level}` : ''}`}>{r.index + 1}</span>
                    <span className="matrix-obj-t">
                      {objectiveStatement(r.objective, doc.audience) || 'هدف غير مكتمل'}
                      {r.objective.level ? <span className={`bloom-tag b${r.objective.level}`}>{bloomInfo(r.objective.level)!.name}</span> : null}
                    </span>
                  </th>
                  {columns.map((b) => {
                    const on = b.objectiveIds.includes(r.objective.id);
                    return (
                      <td key={b.id} className="matrix-cell">
                        <button
                          type="button"
                          className={`cell-btn ${on ? 'is-on' : ''}`}
                          aria-pressed={on}
                          aria-label={`الهدف ${r.index + 1} و${BLOCK_META[b.type].label} #${blockIndex(b.id)}`}
                          onClick={() => toggle(b.id, r.objective.id)}
                          data-testid="matrix-cell"
                        >
                          {on && <Check size={16} aria-hidden="true" />}
                        </button>
                      </td>
                    );
                  })}
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted matrix-legend">
            اضغط أي خانة لربط الهدف بالكتلة أو فك الربط. الأعمدة الزرقاء محتوى، والخضراء ممارسة (نشاط أو بطاقات).
          </p>
        </div>
      )}
    </div>
  );
}
