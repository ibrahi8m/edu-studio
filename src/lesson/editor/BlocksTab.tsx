import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BookmarkPlus, Copy, Link2, Plus, Target, Trash2 } from 'lucide-react';
import { useToast } from '../../app/Toasts';
import { Dialog } from '../../components/Dialog';
import { objectiveStatement } from '../bloom';
import { BLOCK_META, BLOCK_ORDER } from '../catalog';
import { blockLabel, duplicateBlock, insertBlock, insertBlockAt, moveBlock, newBlock, removeBlock, toggleLink, updateBlock } from '../model';
import type { Block, BlockType, LessonDoc } from '../types';
import type { EditorState } from '../useLessonEditor';
import { BLOCK_ICON, BlockBody } from './BlockEditors';

type Edit = (fn: (s: EditorState) => EditorState) => void;

export function BlocksTab({ state, edit, lessonId, onGoToPlan, onSaveToLibrary }: { state: EditorState; edit: Edit; lessonId: string; onGoToPlan: () => void; onSaveToLibrary?: (b: Block) => void }) {
  const { doc } = state;
  const toast = useToast();
  const [adding, setAdding] = useState<{ open: boolean; after: string | null }>({ open: false, after: null });
  const [linking, setLinking] = useState<string | null>(null);
  const [focusBlock, setFocusBlock] = useState<string | null>(null);

  const setDoc = (fn: (d: LessonDoc) => LessonDoc) => edit((s) => ({ ...s, doc: fn(s.doc) }));

  // Bring a newly added block into view and put the cursor in its first field.
  useEffect(() => {
    if (!focusBlock) return;
    const el = document.getElementById(`block-${focusBlock}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const field = el.querySelector<HTMLElement>('input:not([type=file]):not([type=checkbox]), textarea, .dropzone');
    window.setTimeout(() => field?.focus({ preventScroll: true }), 250);
    setFocusBlock(null);
  }, [focusBlock, doc.blocks]);

  const add = (type: BlockType) => {
    const b = newBlock(type);
    setDoc((d) => insertBlock(d, b, adding.after));
    setAdding({ open: false, after: null });
    setFocusBlock(b.id);
  };

  const linkingBlock = doc.blocks.find((b) => b.id === linking) ?? null;

  return (
    <div className="blocks-tab">
      {doc.blocks.length === 0 ? (
        <section className="card empty-hero" data-testid="blocks-empty">
          <h2>ابدأ بناء محتوى الدرس</h2>
          <p className="muted">أضف كتلًا: عنوانًا، شرحًا، صورة، فيديو، ملخصًا بصريًا، بطاقات، ونشاطًا. يمكنك ترتيبها وتعديلها في أي وقت.</p>
          <button type="button" className="btn btn-primary" onClick={() => setAdding({ open: true, after: null })} data-testid="add-block">
            <Plus size={18} aria-hidden="true" /> إضافة أول كتلة
          </button>
        </section>
      ) : (
        <>
          <ol className="block-list" data-testid="block-list">
            {doc.blocks.map((b, i) => (
              <BlockCard
                key={b.id}
                block={b}
                index={i}
                count={doc.blocks.length}
                doc={doc}
                lessonId={lessonId}
                onPatch={(patch) => setDoc((d) => updateBlock(d, b.id, patch))}
                onMove={(dir) => setDoc((d) => moveBlock(d, b.id, dir))}
                onDuplicate={() => {
                  setDoc((d) => duplicateBlock(d, b.id));
                  toast({ message: 'نُسخت الكتلة أسفل الأصل.' });
                }}
                onRemove={() => {
                  const r = removeBlock(doc, b.id);
                  setDoc((d) => removeBlock(d, b.id).doc);
                  toast({
                    message: `حُذفت كتلة «${BLOCK_META[b.type].label}».`,
                    action: {
                      label: 'تراجع',
                      run: () => {
                        if (r.removed) setDoc((d) => insertBlockAt(d, r.removed!, r.index));
                      },
                    },
                  });
                }}
                onLink={() => setLinking(b.id)}
                onSaveToLibrary={onSaveToLibrary ? () => onSaveToLibrary(b) : undefined}
                onInsertAfter={() => setAdding({ open: true, after: b.id })}
              />
            ))}
          </ol>
          <button type="button" className="add-block-bar" onClick={() => setAdding({ open: true, after: null })} data-testid="add-block">
            <Plus size={20} aria-hidden="true" /> إضافة كتلة في النهاية
          </button>
        </>
      )}

      <Dialog open={adding.open} title="إضافة كتلة" onClose={() => setAdding({ open: false, after: null })} testId="add-block-dialog">
        <div className="block-types">
          {BLOCK_ORDER.map((t) => {
            const Icon = BLOCK_ICON[t];
            return (
              <button key={t} type="button" className={`block-type role-${BLOCK_META[t].role}`} onClick={() => add(t)} data-testid={`add-${t}`}>
                <span className="block-type-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <span className="block-type-name">{BLOCK_META[t].label}</span>
                <span className="block-type-hint">{BLOCK_META[t].hint}</span>
              </button>
            );
          })}
        </div>
      </Dialog>

      <Dialog open={!!linkingBlock} title="ربط الكتلة بالأهداف" onClose={() => setLinking(null)} size="md" testId="link-dialog">
        {linkingBlock && (
          <>
            <p className="muted">
              {BLOCK_META[linkingBlock.type].label}: {blockLabel(linkingBlock)}
            </p>
            {doc.objectives.length === 0 ? (
              <div className="empty">
                <p>لا توجد أهداف في هذا الدرس بعد.</p>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setLinking(null);
                    onGoToPlan();
                  }}
                >
                  <Target size={16} aria-hidden="true" /> كتابة الأهداف
                </button>
              </div>
            ) : (
              <ul className="link-list">
                {doc.objectives.map((o, i) => {
                  const on = linkingBlock.objectiveIds.includes(o.id);
                  return (
                    <li key={o.id}>
                      <label className={`link-item ${on ? 'is-on' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => setDoc((d) => toggleLink(d, linkingBlock.id, o.id))} data-testid="link-checkbox" />
                        <span className="link-n">{i + 1}</span>
                        <span>{objectiveStatement(o, doc.audience) || 'هدف غير مكتمل'}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="dialog-inline-foot">
              <button type="button" className="btn btn-primary" onClick={() => setLinking(null)} data-testid="link-done">
                تم
              </button>
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

function BlockCard({
  block: b,
  index,
  count,
  doc,
  lessonId,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onLink,
  onInsertAfter,
  onSaveToLibrary,
}: {
  block: Block;
  index: number;
  count: number;
  doc: LessonDoc;
  lessonId: string;
  onPatch: (patch: Partial<Block>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onLink: () => void;
  onInsertAfter: () => void;
  onSaveToLibrary?: () => void;
}) {
  const meta = BLOCK_META[b.type];
  const Icon = BLOCK_ICON[b.type];
  const linkedNums = doc.objectives.map((o, i) => (b.objectiveIds.includes(o.id) ? i + 1 : 0)).filter(Boolean);
  const needsLink = meta.role !== 'structure' && doc.objectives.length > 0 && linkedNums.length === 0;
  const name = `${meta.label} ${index + 1}`;
  return (
    <li className={`block role-${meta.role}`} id={`block-${b.id}`} data-testid="block" data-type={b.type}>
      <div className="block-head">
        <span className="block-icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="block-name">
          <span className="block-type-label">{meta.label}</span>
          <span className="block-idx">#{index + 1}</span>
        </span>
        {meta.role !== 'structure' && (
          <button type="button" className={`link-btn-chip ${needsLink ? 'is-warn' : linkedNums.length ? 'is-on' : ''}`} onClick={onLink} data-testid="block-link" aria-label={`ربط ${name} بالأهداف`}>
            <Link2 size={14} aria-hidden="true" />
            {linkedNums.length ? `الأهداف ${linkedNums.join('، ')}` : 'ربط بهدف'}
          </button>
        )}
        <span className="row-actions block-actions">
          <button type="button" className="icon-btn" aria-label={`نقل ${name} إلى الأعلى`} disabled={index === 0} onClick={() => onMove(-1)} data-testid="block-up">
            <ArrowUp size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label={`نقل ${name} إلى الأسفل`} disabled={index === count - 1} onClick={() => onMove(1)} data-testid="block-down">
            <ArrowDown size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label={`نسخ ${name}`} onClick={onDuplicate}>
            <Copy size={17} />
          </button>
          {onSaveToLibrary && (
            <button type="button" className="icon-btn" aria-label={`حفظ ${name} في المكتبة`} title="حفظ في المكتبة" onClick={onSaveToLibrary} data-testid="block-to-library">
              <BookmarkPlus size={17} />
            </button>
          )}
          <button type="button" className="icon-btn danger" aria-label={`حذف ${name}`} onClick={onRemove} data-testid="block-delete">
            <Trash2 size={18} />
          </button>
        </span>
      </div>
      <div className="block-body">
        <BlockBody block={b} lessonId={lessonId} onPatch={onPatch} />
      </div>
      <button type="button" className="inserter" onClick={onInsertAfter} aria-label={`إضافة كتلة بعد ${name}`}>
        <Plus size={14} aria-hidden="true" /> إضافة هنا
      </button>
    </li>
  );
}
