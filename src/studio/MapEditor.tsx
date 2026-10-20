import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { ArrowLeftRight, Link2, Plus, Shuffle, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useToast } from '../app/Toasts';
import { AutoTextarea } from '../lesson/editor/parts';
import { addNode, autoLayout, CANVAS, connect, flipEdge, LIMITS, moveNode, NODE_COLOR_LABEL, NODE_COLORS, nodeFill, removeEdge, removeNode, restoreNode, SHAPE_LABEL, updateEdge, updateNode, type Theme } from './model';
import { ArrowMarker, EdgeEl, nodeBox, NodeShapeEl, NodeText, type NodeBox } from './render';
import type { ConceptMapData, NodeShape } from './types';

type Sel = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

/**
 * Concept map editor. Concepts are dragged with the mouse or a finger (pointer events),
 * or moved with the arrow keys; arrows are drawn by choosing two concepts, either on the
 * canvas or from the side panel. Coordinates are SVG units, so right-to-left layout of the
 * page never flips the map.
 */
export function MapEditor({ data, theme, onChange }: { data: ConceptMapData; theme: Theme; onChange: (fn: (m: ConceptMapData) => ConceptMapData) => void }) {
  const uid = useId();
  const marker = `m${uid.replace(/[^a-zA-Z0-9]/g, '')}`;
  const markerOn = `${marker}on`;
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [newEdgeTo, setNewEdgeTo] = useState('');
  const [newEdgeLabel, setNewEdgeLabel] = useState('');
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean; pointer: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [focusText, setFocusText] = useState(false);
  // On phones the whole canvas is very small: start zoomed in, the frame scrolls.
  const [zoom, setZoom] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? 2 : 1));

  // When zoomed in, start with the first concept (usually the main one) in view.
  useEffect(() => {
    const wrap = svgRef.current?.parentElement;
    const first = svgRef.current?.querySelector<SVGGraphicsElement>('.map-node');
    if (!wrap || !first || zoom <= 1) return;
    const w = wrap.getBoundingClientRect();
    const b = first.getBoundingClientRect();
    wrap.scrollBy({ left: b.left + b.width / 2 - (w.left + w.width / 2), top: b.top + b.height / 2 - (w.top + w.height / 2) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Touch: a finger on a concept drags it (no page scroll); a finger on the empty canvas scrolls as usual.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onTouch = (e: TouchEvent) => {
      if ((e.target as Element | null)?.closest?.('.map-node') || drag.current) e.preventDefault();
    };
    svg.addEventListener('touchstart', onTouch, { passive: false });
    svg.addEventListener('touchmove', onTouch, { passive: false });
    return () => {
      svg.removeEventListener('touchstart', onTouch);
      svg.removeEventListener('touchmove', onTouch);
    };
  }, []);

  const boxes = useMemo(() => data.nodes.map((n) => nodeBox(n)), [data.nodes]);
  const byId = useMemo(() => new Map<string, NodeBox>(boxes.map((b) => [b.node.id, b])), [boxes]);
  const selNode = sel?.kind === 'node' ? data.nodes.find((n) => n.id === sel.id) ?? null : null;
  const selEdge = sel?.kind === 'edge' ? data.edges.find((e) => e.id === sel.id) ?? null : null;
  const name = (id: string) => data.nodes.find((n) => n.id === id)?.text.trim() || 'مفهوم بلا نص';

  useEffect(() => {
    if (focusText && selNode) {
      textRef.current?.focus();
      textRef.current?.select();
      setFocusText(false);
    }
  }, [focusText, selNode]);

  // Selection that no longer exists (deleted, undone) is cleared.
  useEffect(() => {
    if (sel?.kind === 'node' && !data.nodes.some((n) => n.id === sel.id)) setSel(null);
    if (sel?.kind === 'edge' && !data.edges.some((e) => e.id === sel.id)) setSel(null);
  }, [data, sel]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // Results are computed from the current map first, so the new id is known right away.
  const add = useCallback(
    (at?: { x: number; y: number }) => {
      const r = addNode(data, '', { near: sel?.kind === 'node' ? sel.id : undefined, x: at?.x, y: at?.y });
      if (!r.node) {
        toast({ message: `الحد الأقصى ${LIMITS.nodes} مفهومًا.`, tone: 'danger' });
        return;
      }
      const node = r.node;
      onChange((m) => (m.nodes.length >= LIMITS.nodes ? m : { ...m, nodes: [...m.nodes, node] }));
      setSel({ kind: 'node', id: node.id });
      setFocusText(true);
    },
    [data, onChange, sel, toast],
  );

  const tryConnect = (from: string, to: string, label = '') => {
    const r = connect(data, from, to, label);
    if (r.problem === 'self') toast({ message: 'اختر مفهومًا آخر غير المفهوم نفسه.', tone: 'danger' });
    else if (r.problem === 'exists') toast({ message: 'هذا السهم موجود من قبل.', tone: 'danger' });
    else if (r.problem === 'limit') toast({ message: `الحد الأقصى ${LIMITS.edges} سهمًا.`, tone: 'danger' });
    if (!r.edge) return;
    const edge = r.edge;
    onChange((m) => (m.edges.some((e) => e.from === edge.from && e.to === edge.to) ? m : { ...m, edges: [...m.edges, edge] }));
    setSel({ kind: 'edge', id: edge.id });
  };

  const del = (id: string) => {
    const r = removeNode(data, id);
    if (!r.node) return;
    onChange((m) => removeNode(m, id).map);
    setSel(null);
    toast({
      message: `حُذف المفهوم «${r.node.text || 'بلا نص'}»${r.edges.length ? ` و${r.edges.length === 1 ? 'سهم واحد' : `${r.edges.length} أسهم`}` : ''}.`,
      action: { label: 'تراجع', run: () => onChange((m) => restoreNode(m, r.node!, r.edges, r.index)) },
    });
  };

  /* ───────── pointer: drag, select, link ───────── */

  const onNodeDown = (e: RPointerEvent<SVGGElement>, id: string) => {
    e.stopPropagation();
    if (linking) {
      if (!linkFrom) setLinkFrom(id);
      else {
        tryConnect(linkFrom, id);
        setLinkFrom(null);
        setLinking(false);
      }
      return;
    }
    setSel({ kind: 'node', id });
    const n = data.nodes.find((x) => x.id === id);
    if (!n) return;
    const p = toSvg(e);
    drag.current = { id, dx: p.x - n.x, dy: p.y - n.y, moved: false, pointer: e.pointerId };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = toSvg(e);
    d.moved = true;
    onChange((m) => moveNode(m, d.id, p.x - d.dx, p.y - d.dy));
  };

  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointer === e.pointerId) {
      drag.current = null;
      svgRef.current?.releasePointerCapture?.(e.pointerId);
    }
  };

  const onKey = (e: RKeyboardEvent<SVGGElement>, id: string) => {
    const step = e.shiftKey ? 40 : 10;
    const n = data.nodes.find((x) => x.id === id);
    if (!n) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    if (moves[e.key]) {
      e.preventDefault();
      setSel({ kind: 'node', id });
      onChange((m) => moveNode(m, id, n.x + moves[e.key][0], n.y + moves[e.key][1]));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (linking) {
        if (!linkFrom) setLinkFrom(id);
        else {
          tryConnect(linkFrom, id);
          setLinkFrom(null);
          setLinking(false);
        }
      } else {
        setSel({ kind: 'node', id });
        setFocusText(true);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      del(id);
    } else if (e.key === 'Escape') {
      setLinking(false);
      setLinkFrom(null);
    }
  };

  const linkHint = linking ? (linkFrom ? `اختر المفهوم الذي يتجه إليه السهم من «${name(linkFrom)}».` : 'اختر المفهوم الذي يبدأ منه السهم.') : '';

  return (
    <div className="map-editor" data-testid="map-editor">
      <div className="map-toolbar" role="toolbar" aria-label="أدوات الخريطة">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => add()} disabled={data.nodes.length >= LIMITS.nodes} data-testid="map-add-node">
          <Plus size={16} aria-hidden="true" /> مفهوم
        </button>
        <button
          type="button"
          className={`btn btn-sm ${linking ? 'btn-primary' : ''}`}
          aria-pressed={linking}
          onClick={() => {
            setLinking((v) => !v);
            setLinkFrom(null);
          }}
          disabled={data.nodes.length < 2}
          data-testid="map-link-mode"
        >
          <Link2 size={16} aria-hidden="true" /> {linking ? 'إلغاء الربط' : 'سهم'}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => onChange(autoLayout)} disabled={data.nodes.length < 2} data-testid="map-auto-layout">
          <Shuffle size={16} aria-hidden="true" /> ترتيب تلقائي
        </button>
        <span className="map-zoom" role="group" aria-label="التكبير">
          <button type="button" className="icon-btn" aria-label="تصغير اللوحة" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} data-testid="map-zoom-out">
            <ZoomOut size={18} />
          </button>
          <span className="map-zoom-n" aria-live="polite" data-testid="map-zoom">
            {Math.round(zoom * 100)}٪
          </span>
          <button type="button" className="icon-btn" aria-label="تكبير اللوحة" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))} data-testid="map-zoom-in">
            <ZoomIn size={18} />
          </button>
        </span>
        <span className="map-count muted" data-testid="map-count">
          {data.nodes.length} {data.nodes.length === 1 ? 'مفهوم' : 'مفاهيم'} · {data.edges.length} {data.edges.length === 1 ? 'سهم' : 'أسهم'}
        </span>
      </div>
      <p className="map-hint" role="status" aria-live="polite" data-testid="map-hint">
        {linkHint || 'اسحب المفاهيم لترتيبها، أو اختر مفهومًا وحرّكه بالأسهم في لوحة المفاتيح. انقر مرتين في مكان فارغ لإضافة مفهوم هناك.'}
      </p>

      <div className="map-layout">
        <div className="map-canvas-wrap" data-testid="map-canvas-wrap">
          <svg
            ref={svgRef}
            className={`map-canvas ${linking ? 'is-linking' : ''}`}
            style={{ width: `${zoom * 100}%` }}
            viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
            role="group"
            aria-label="لوحة خريطة المفاهيم"
            data-testid="map-canvas"
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerDown={() => {
              if (!linking) setSel(null);
            }}
            onDoubleClick={(e) => {
              if (e.target === svgRef.current || (e.target as Element).classList?.contains('map-bg')) add(toSvg(e));
            }}
          >
            <defs>
              <ArrowMarker id={marker} color={theme.line} />
              <ArrowMarker id={markerOn} color={theme.accent} />
              <pattern id={`${marker}grid`} width={40} height={40} patternUnits="userSpaceOnUse">
                <path d="M40 0 H0 V40" fill="none" stroke={theme.line} strokeOpacity={0.18} />
              </pattern>
            </defs>
            <rect className="map-bg" x={0} y={0} width={CANVAS.width} height={CANVAS.height} fill={theme.bg} />
            <rect className="map-bg" x={0} y={0} width={CANVAS.width} height={CANVAS.height} fill={`url(#${marker}grid)`} />
            {data.edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const on = sel?.kind === 'edge' && sel.id === e.id;
              return (
                <g
                  key={e.id}
                  className="map-edge"
                  data-testid="map-edge"
                  data-from={e.from}
                  data-to={e.to}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    if (!linking) setSel({ kind: 'edge', id: e.id });
                  }}
                >
                  <line x1={a.node.x} y1={a.node.y} x2={b.node.x} y2={b.node.y} stroke="transparent" strokeWidth={22} />
                  <EdgeEl a={a} b={b} label={e.label} theme={theme} markerId={on ? markerOn : marker} highlight={on} />
                </g>
              );
            })}
            {boxes.map((b) => {
              const on = sel?.kind === 'node' && sel.id === b.node.id;
              const from = linkFrom === b.node.id;
              return (
                <g
                  key={b.node.id}
                  className={`map-node ${on ? 'is-selected' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`مفهوم: ${b.node.text || 'بلا نص'}`}
                  aria-pressed={on}
                  data-testid="map-node"
                  data-id={b.node.id}
                  data-x={b.node.x}
                  data-y={b.node.y}
                  onPointerDown={(e) => onNodeDown(e, b.node.id)}
                  onKeyDown={(e) => onKey(e, b.node.id)}
                  onFocus={(e) => {
                    // keyboard focus selects; a click selects in onPointerDown (and must not undo a new arrow's selection)
                    if (!linking && e.currentTarget.matches(':focus-visible')) setSel({ kind: 'node', id: b.node.id });
                  }}
                >
                  {(on || from) && <NodeShapeEl b={{ ...b, w: b.w + 14, h: b.h + 14 }} fill="none" stroke={from ? '#F59E0B' : theme.text} strokeWidth={3} />}
                  <NodeShapeEl b={b} fill={nodeFill(theme, b.node.color)} />
                  <NodeText b={b} />
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="map-panel card" aria-label="خصائص العنصر المحدد">
          {selNode ? (
            <div className="map-props" data-testid="node-props">
              <div className="map-props-head">
                <h3>المفهوم المحدد</h3>
                <button type="button" className="icon-btn" aria-label="إلغاء التحديد" onClick={() => setSel(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`${uid}-nt`}>
                  النص
                </label>
                <AutoTextarea
                  id={`${uid}-nt`}
                  ref={textRef}
                  minRows={1}
                  value={selNode.text}
                  maxLength={LIMITS.text}
                  placeholder="مثال: الطاقة المتجددة"
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange((m) => updateNode(m, selNode.id, { text: v }));
                  }}
                  data-testid="node-text"
                />
              </div>
              <div className="field">
                <span className="field-label" id={`${uid}-nc`}>
                  اللون
                </span>
                <div className="swatches" role="radiogroup" aria-labelledby={`${uid}-nc`}>
                  {NODE_COLORS.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={selNode.color === i}
                      aria-label={NODE_COLOR_LABEL[i]}
                      title={NODE_COLOR_LABEL[i]}
                      className={`swatch ${selNode.color === i ? 'is-on' : ''}`}
                      style={{ background: nodeFill(theme, i) }}
                      onClick={() => onChange((m) => updateNode(m, selNode.id, { color: i }))}
                      data-testid="node-color"
                    />
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`${uid}-ns`}>
                  الشكل
                </label>
                <select id={`${uid}-ns`} className="input" value={selNode.shape} onChange={(e) => onChange((m) => updateNode(m, selNode.id, { shape: e.target.value as NodeShape }))} data-testid="node-shape">
                  {(Object.keys(SHAPE_LABEL) as NodeShape[]).map((s) => (
                    <option key={s} value={s}>
                      {SHAPE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field map-new-edge">
                <span className="field-label">سهم جديد من هذا المفهوم</span>
                <label className="sr-only" htmlFor={`${uid}-to`}>
                  إلى المفهوم
                </label>
                <select id={`${uid}-to`} className="input" value={newEdgeTo} onChange={(e) => setNewEdgeTo(e.target.value)} data-testid="edge-to">
                  <option value="">إلى المفهوم…</option>
                  {data.nodes
                    .filter((n) => n.id !== selNode.id)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.text.trim() || 'مفهوم بلا نص'}
                      </option>
                    ))}
                </select>
                <label className="sr-only" htmlFor={`${uid}-el`}>
                  كلمات الربط
                </label>
                <input id={`${uid}-el`} className="input" value={newEdgeLabel} maxLength={LIMITS.label} placeholder="كلمات الربط (اختياري): يتكوّن من…" onChange={(e) => setNewEdgeLabel(e.target.value)} data-testid="edge-new-label" />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!newEdgeTo}
                  onClick={() => {
                    tryConnect(selNode.id, newEdgeTo, newEdgeLabel);
                    setNewEdgeTo('');
                    setNewEdgeLabel('');
                  }}
                  data-testid="edge-add"
                >
                  <Link2 size={16} aria-hidden="true" /> إضافة السهم
                </button>
              </div>
              <div className="map-props-actions">
                <button type="button" className="btn btn-sm" onClick={() => add()} data-testid="node-add-child">
                  <Plus size={16} aria-hidden="true" /> مفهوم قريب منه
                </button>
                <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => del(selNode.id)} data-testid="node-delete">
                  <Trash2 size={16} aria-hidden="true" /> حذف المفهوم
                </button>
              </div>
            </div>
          ) : selEdge ? (
            <div className="map-props" data-testid="edge-props">
              <div className="map-props-head">
                <h3>السهم المحدد</h3>
                <button type="button" className="icon-btn" aria-label="إلغاء التحديد" onClick={() => setSel(null)}>
                  <X size={16} />
                </button>
              </div>
              <p className="map-edge-desc">
                من «{name(selEdge.from)}» إلى «{name(selEdge.to)}»
              </p>
              <div className="field">
                <label className="field-label" htmlFor={`${uid}-lb`}>
                  كلمات الربط
                </label>
                <input
                  id={`${uid}-lb`}
                  className="input"
                  value={selEdge.label}
                  maxLength={LIMITS.label}
                  placeholder="مثال: يتكوّن من، يؤدي إلى، مثل"
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange((m) => updateEdge(m, selEdge.id, { label: v }));
                  }}
                  data-testid="edge-label"
                />
              </div>
              <div className="map-props-actions">
                <button type="button" className="btn btn-sm" onClick={() => onChange((m) => flipEdge(m, selEdge.id))} data-testid="edge-flip">
                  <ArrowLeftRight size={16} aria-hidden="true" /> عكس الاتجاه
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger-ghost"
                  onClick={() => {
                    const e = selEdge;
                    onChange((m) => removeEdge(m, e.id));
                    setSel(null);
                    toast({ message: 'حُذف السهم.', action: { label: 'تراجع', run: () => onChange((m) => ({ ...m, edges: [...m.edges, e] })) } });
                  }}
                  data-testid="edge-delete"
                >
                  <Trash2 size={16} aria-hidden="true" /> حذف السهم
                </button>
              </div>
            </div>
          ) : (
            <p className="muted map-empty-sel">اختر مفهومًا أو سهمًا لتعديله.</p>
          )}

          <details className="map-lists" open>
            <summary>
              المفاهيم ({data.nodes.length}) والأسهم ({data.edges.length})
            </summary>
            <ol className="map-list" data-testid="node-list">
              {data.nodes.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`map-list-btn ${sel?.kind === 'node' && sel.id === n.id ? 'is-on' : ''}`} onClick={() => setSel({ kind: 'node', id: n.id })} data-testid="node-list-item">
                    <span className="map-dot" style={{ background: nodeFill(theme, n.color) }} aria-hidden="true" />
                    {n.text.trim() || 'مفهوم بلا نص'}
                  </button>
                </li>
              ))}
            </ol>
            {data.edges.length > 0 && (
              <ul className="map-list" data-testid="edge-list">
                {data.edges.map((e) => (
                  <li key={e.id}>
                    <button type="button" className={`map-list-btn ${sel?.kind === 'edge' && sel.id === e.id ? 'is-on' : ''}`} onClick={() => setSel({ kind: 'edge', id: e.id })} data-testid="edge-list-item">
                      {name(e.from)} ← {e.label.trim() ? `${e.label.trim()} ← ` : ''}
                      {name(e.to)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </aside>
      </div>
    </div>
  );
}
