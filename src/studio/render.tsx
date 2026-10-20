import { useId, type ReactNode } from 'react';
import { CANVAS, nodeFill, shownCards, shownPoints, THEMES, type Theme } from './model';
import { FONT_BODY, FONT_HEAD, measure, widest, wrap, type Measure } from './text';
import type { CardsDesign, ConceptMapData, ConceptMapDesign, Design, MapNode, SummaryDesign } from './types';

/**
 * Every design is drawn as one SVG. The same SVG is shown in the editor and turned into the PNG,
 * so what the teacher sees is what is exported. Text is wrapped by measuring the real fonts.
 */

export const W = 1200;
const PAD = 48;
const FOOT = 44;

/* ───────── text helpers ───────── */

type Anchor = 'middle' | 'right' | 'left';

/** Lines of Arabic text. `right` anchors the line end on the right (start of an RTL line). */
export function Lines({
  lines,
  x,
  y,
  size,
  weight = 400,
  fill,
  anchor = 'middle',
  lh = 1.5,
  family = FONT_BODY,
  testId,
}: {
  lines: string[];
  x: number;
  y: number;
  size: number;
  weight?: number;
  fill: string;
  anchor?: Anchor;
  lh?: number;
  family?: string;
  testId?: string;
}) {
  const ta = anchor === 'middle' ? 'middle' : anchor === 'right' ? 'start' : 'end';
  return (
    <text
      x={x}
      y={y}
      direction="rtl"
      textAnchor={ta}
      fontFamily={`'${family}', sans-serif`}
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      data-testid={testId}
    >
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? size * 0.9 : size * lh}>
          {l || ' '}
        </tspan>
      ))}
    </text>
  );
}

const linesHeight = (n: number, size: number, lh = 1.5) => (n <= 0 ? 0 : size * 0.9 + (n - 1) * size * lh + size * 0.35);

function Frame({ w, h, theme, children, label, testId }: { w: number; h: number; theme: Theme; children: ReactNode; label: string; testId?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={label}
      direction="rtl"
      className="design-svg"
      data-testid={testId ?? 'design-svg'}
      data-width={w}
      data-height={h}
    >
      <rect x={0} y={0} width={w} height={h} fill={theme.bg} />
      {children}
    </svg>
  );
}

function Footer({ w, h, theme }: { w: number; h: number; theme: Theme }) {
  return (
    <text x={w / 2} y={h - 18} textAnchor="middle" fontFamily={`'${FONT_HEAD}', sans-serif`} fontSize={14} fontWeight={600} fill={theme.muted} letterSpacing={2} direction="ltr">
      IBRAHI8M EDU STUDIO
    </text>
  );
}

function Header({ title, sub, theme, m }: { title: string; sub?: string; theme: Theme; m: Measure }) {
  const t = wrap(title || 'بلا عنوان', W - 2 * PAD, 40, 700, { family: FONT_HEAD, m, maxLines: 3 });
  const s = sub ? wrap(sub, W - 2 * PAD - 120, 22, 400, { m, maxLines: 4 }) : [];
  const th = linesHeight(t.length, 40, 1.3);
  return {
    height: PAD + th + (s.length ? 12 + linesHeight(s.length, 22) : 0) + 28,
    node: (
      <g>
        <Lines lines={t} x={W / 2} y={PAD} size={40} weight={700} family={FONT_HEAD} fill={theme.text} lh={1.3} testId="design-heading" />
        {s.length > 0 && <Lines lines={s} x={W / 2} y={PAD + th + 12} size={22} fill={theme.muted} />}
        <rect x={W / 2 - 40} y={PAD + th + (s.length ? 12 + linesHeight(s.length, 22) : 0) + 10} width={80} height={4} rx={2} fill={theme.accent} />
      </g>
    ),
  };
}

/* ───────── cards ───────── */

export function CardsSvg({ d, m = measure }: { d: CardsDesign; m?: Measure }) {
  const theme = THEMES[d.theme];
  const cards = shownCards(d.data);
  const cols = Math.min(d.data.columns, Math.max(1, cards.length));
  const gap = 24;
  const cw = (W - 2 * PAD - (cols - 1) * gap) / cols;
  const head = Header({ title: d.title, sub: cards.length ? `${cards.length} ${cards.length === 1 ? 'بطاقة' : cards.length === 2 ? 'بطاقتان' : cards.length <= 10 ? 'بطاقات' : 'بطاقة'}` : '', theme, m });
  const laid = cards.map((c) => {
    const f = wrap(c.front || '—', cw - 56, 26, 700, { family: FONT_HEAD, m, maxLines: 5 });
    const b = d.data.show === 'both' ? wrap(c.back || '—', cw - 48, 19, 400, { m, maxLines: 10 }) : [];
    const fh = Math.max(120, linesHeight(f.length, 26, 1.35) + 56);
    const bh = d.data.show === 'both' ? Math.max(90, linesHeight(b.length, 19) + 44) : 0;
    return { c, f, b, fh, bh };
  });
  const rows: (typeof laid)[] = [];
  for (let i = 0; i < laid.length; i += cols) rows.push(laid.slice(i, i + cols));
  let y = head.height;
  const parts: ReactNode[] = [];
  rows.forEach((row, r) => {
    const fh = Math.max(...row.map((x) => x.fh));
    const bh = Math.max(...row.map((x) => x.bh));
    row.forEach((x, i) => {
      // RTL: the first card of a row is on the right.
      const left = W - PAD - (i + 1) * cw - i * gap;
      const n = r * cols + i + 1;
      parts.push(
        <g key={x.c.id} data-testid="design-card">
          <rect x={left} y={y} width={cw} height={fh + bh} rx={20} fill={theme.surface} stroke={theme.line} strokeOpacity={0.5} />
          <path d={`M${left} ${y + 20} a20 20 0 0 1 20 -20 h${cw - 40} a20 20 0 0 1 20 20 v${fh - 20} h${-cw} z`} fill={theme.accent} />
          <circle cx={left + cw - 30} cy={y + 30} r={15} fill={theme.onAccent} fillOpacity={0.2} />
          <text x={left + cw - 30} y={y + 36} textAnchor="middle" fontFamily={`'${FONT_HEAD}', sans-serif`} fontSize={16} fontWeight={700} fill={theme.onAccent}>
            {n}
          </text>
          <Lines lines={x.f} x={left + cw / 2} y={y + (fh - linesHeight(x.f.length, 26, 1.35)) / 2 + 6} size={26} weight={700} family={FONT_HEAD} fill={theme.onAccent} lh={1.35} />
          {d.data.show === 'both' && <Lines lines={x.b} x={left + cw / 2} y={y + fh + 22} size={19} fill={theme.text} />}
        </g>,
      );
    });
    y += fh + bh + gap;
  });
  if (!cards.length) {
    parts.push(<Lines key="empty" lines={['أضف بطاقة لتظهر هنا']} x={W / 2} y={y + 20} size={22} fill={theme.muted} />);
    y += 90;
  }
  const h = Math.ceil(y - gap + PAD + FOOT);
  return (
    <Frame w={W} h={h} theme={theme} label={`${d.title}: بطاقات تعليمية`}>
      {head.node}
      {parts}
      <Footer w={W} h={h} theme={theme} />
    </Frame>
  );
}

/* ───────── visual summary ───────── */

function Num({ x, y, n, theme, r = 20 }: { x: number; y: number; n: number; theme: Theme; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={theme.accent} />
      <text x={x} y={y + r * 0.36} textAnchor="middle" fontFamily={`'${FONT_HEAD}', sans-serif`} fontSize={r} fontWeight={700} fill={theme.onAccent}>
        {n}
      </text>
    </g>
  );
}

function pointBlock(p: { title: string; text: string }, width: number, m: Measure) {
  const t = p.title.trim() ? wrap(p.title, width, 22, 600, { m, maxLines: 4 }) : [];
  const b = p.text.trim() ? wrap(p.text, width, 18, 400, { m, maxLines: 10 }) : [];
  const h = linesHeight(t.length, 22, 1.35) + (t.length && b.length ? 8 : 0) + linesHeight(b.length, 18);
  return { t, b, h };
}

function PointText({ blk, x, y, theme, anchor = 'right' }: { blk: ReturnType<typeof pointBlock>; x: number; y: number; theme: Theme; anchor?: Anchor }) {
  const th = linesHeight(blk.t.length, 22, 1.35);
  return (
    <>
      {blk.t.length > 0 && <Lines lines={blk.t} x={x} y={y} size={22} weight={600} fill={theme.text} anchor={anchor} lh={1.35} />}
      {blk.b.length > 0 && <Lines lines={blk.b} x={x} y={y + th + (blk.t.length ? 8 : 0)} size={18} fill={theme.muted} anchor={anchor} />}
    </>
  );
}

export function SummarySvg({ d, m = measure }: { d: SummaryDesign; m?: Measure }) {
  const theme = THEMES[d.theme];
  const pts = shownPoints(d.data);
  const style = d.data.style;
  const parts: ReactNode[] = [];
  let y: number;
  let h: number;

  if (style === 'central') {
    const core = wrap(d.data.heading || 'الفكرة الرئيسية', 260, 28, 700, { family: FONT_HEAD, m, maxLines: 4 });
    const n = Math.max(1, pts.length);
    const boxW = n > 8 ? 230 : 270;
    const blocks = pts.map((p) => pointBlock(p, boxW - 36, m));
    const maxBox = Math.max(90, ...blocks.map((b) => b.h + 36));
    const rx = n > 6 ? 410 : 380;
    const ry = (n > 6 ? 300 : 250) + Math.max(0, maxBox - 110) / 2;
    const sub = d.data.subtitle ? wrap(d.data.subtitle, W - 2 * PAD, 20, 400, { m, maxLines: 3 }) : [];
    const top = PAD + (sub.length ? linesHeight(sub.length, 20) + 16 : 0);
    const cx = W / 2;
    const cy = top + ry + maxBox / 2 + 10;
    h = Math.ceil(cy + ry + maxBox / 2 + 30 + FOOT);
    if (sub.length) parts.push(<Lines key="sub" lines={sub} x={W / 2} y={PAD - 8} size={20} fill={theme.muted} />);
    const coreH = linesHeight(core.length, 28, 1.3);
    const cw = Math.max(200, widest(core, 28, 700, FONT_HEAD, m) + 70);
    const pos = pts.map((_, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      // RTL reading: go clockwise from the top towards the right.
      return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
    });
    pos.forEach((p, i) => parts.push(<line key={`l${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={theme.line} strokeWidth={3} strokeLinecap="round" />));
    parts.push(
      <g key="core" data-testid="design-core">
        <ellipse cx={cx} cy={cy} rx={cw / 2} ry={coreH / 2 + 40} fill={theme.accent} />
        <Lines lines={core} x={cx} y={cy - coreH / 2} size={28} weight={700} family={FONT_HEAD} fill={theme.onAccent} lh={1.3} />
      </g>,
    );
    pts.forEach((p, i) => {
      const b = blocks[i];
      const bh = b.h + 36;
      const bx = pos[i].x - boxW / 2;
      const by = pos[i].y - bh / 2;
      parts.push(
        <g key={p.id} data-testid="design-point">
          <rect x={bx} y={by} width={boxW} height={bh} rx={16} fill={theme.surface} stroke={theme.accent} strokeWidth={2} />
          <PointText blk={b} x={bx + boxW / 2} y={by + 18} theme={theme} anchor="middle" />
        </g>,
      );
    });
  } else {
    const head = Header({ title: d.data.heading || 'الفكرة الرئيسية', sub: d.data.subtitle, theme, m });
    parts.push(<g key="head">{head.node}</g>);
    y = head.height + 8;
    if (style === 'grid') {
      const cols = pts.length <= 4 ? 2 : 3;
      const gap = 24;
      const cw = (W - 2 * PAD - (cols - 1) * gap) / cols;
      const blocks = pts.map((p) => pointBlock(p, cw - 48, m));
      for (let r = 0; r < blocks.length; r += cols) {
        const row = blocks.slice(r, r + cols);
        const rh = Math.max(...row.map((b) => b.h)) + 92;
        row.forEach((b, i) => {
          const left = W - PAD - (i + 1) * cw - i * gap;
          parts.push(
            <g key={pts[r + i].id} data-testid="design-point">
              <rect x={left} y={y} width={cw} height={rh} rx={18} fill={theme.surface} />
              <rect x={left + cw - 6} y={y + 18} width={6} height={rh - 36} rx={3} fill={theme.accent} />
              <Num x={left + cw - 44} y={y + 40} n={r + i + 1} theme={theme} />
              <PointText blk={b} x={left + cw - 24} y={y + 72} theme={theme} />
            </g>,
          );
        });
        y += rh + gap;
      }
      y -= gap;
    } else if (style === 'steps') {
      const boxW = W - 2 * PAD - 90;
      const blocks = pts.map((p) => pointBlock(p, boxW - 48, m));
      const circleX = W - PAD - 28;
      const ys: number[] = [];
      blocks.forEach((b, i) => {
        const bh = Math.max(76, b.h + 40);
        ys.push(y + 32);
        parts.push(
          <g key={pts[i].id} data-testid="design-point">
            <rect x={PAD} y={y} width={boxW} height={bh} rx={16} fill={theme.surface} />
            <PointText blk={b} x={PAD + boxW - 24} y={y + 20} theme={theme} />
          </g>,
        );
        y += bh + 22;
      });
      if (ys.length > 1) parts.unshift(<line key="rail" x1={circleX} y1={ys[0]} x2={circleX} y2={ys[ys.length - 1]} stroke={theme.line} strokeWidth={4} />);
      ys.forEach((cy, i) => parts.push(<Num key={`n${i}`} x={circleX} y={cy} n={i + 1} theme={theme} r={24} />));
      y -= 22;
    } else {
      // timeline: a centre line, events alternating right and left (the first on the right)
      const boxW = (W - 2 * PAD - 80) / 2;
      const blocks = pts.map((p) => pointBlock(p, boxW - 44, m));
      const mid = W / 2;
      const start = y;
      const bottom = { right: y, left: y };
      const dots: number[] = [];
      let last = y - 60;
      blocks.forEach((b, i) => {
        const bh = Math.max(70, b.h + 36);
        const right = i % 2 === 0;
        const side = right ? 'right' : 'left';
        // never above the previous event, never overlapping the last box on the same side
        const top = Math.max(last + 60, bottom[side] + (i < 2 ? 0 : 20));
        const bx = right ? mid + 40 : PAD;
        dots.push(top + 30);
        parts.push(
          <g key={pts[i].id} data-testid="design-point">
            <line x1={right ? mid + 40 : mid - 40} y1={top + 30} x2={mid} y2={top + 30} stroke={theme.line} strokeWidth={3} />
            <rect x={bx} y={top} width={boxW} height={bh} rx={16} fill={theme.surface} />
            <PointText blk={b} x={bx + boxW - 22} y={top + 18} theme={theme} />
          </g>,
        );
        bottom[side] = top + bh;
        last = top;
      });
      y = Math.max(bottom.right, bottom.left, start);
      if (dots.length) parts.unshift(<line key="axis" x1={mid} y1={start} x2={mid} y2={Math.max(start + 40, y)} stroke={theme.line} strokeWidth={4} strokeLinecap="round" />);
      dots.forEach((cy, i) => parts.push(<Num key={`t${i}`} x={mid} y={cy} n={i + 1} theme={theme} r={18} />));
    }
    if (!pts.length) {
      parts.push(<Lines key="empty" lines={['أضف نقطة لتظهر هنا']} x={W / 2} y={y + 10} size={22} fill={theme.muted} />);
      y += 70;
    }
    h = Math.ceil(y + PAD + FOOT);
  }
  return (
    <Frame w={W} h={h} theme={theme} label={`${d.data.heading || d.title}: ملخص بصري`}>
      {parts}
      <Footer w={W} h={h} theme={theme} />
    </Frame>
  );
}

/* ───────── concept map ───────── */

export interface NodeBox {
  node: MapNode;
  lines: string[];
  w: number;
  h: number;
}

export const NODE_FONT = 20;
const NODE_LH = 1.4;

export function nodeBox(n: MapNode, m: Measure = measure): NodeBox {
  const lines = wrap(n.text || '…', 180, NODE_FONT, 600, { m, maxLines: 4 });
  const tw = widest(lines, NODE_FONT, 600, FONT_BODY, m);
  const ellipse = n.shape === 'ellipse';
  const w = Math.max(ellipse ? 150 : 110, tw + (ellipse ? 64 : 34));
  const h = Math.max(ellipse ? 70 : 52, linesHeight(lines.length, NODE_FONT, NODE_LH) + (ellipse ? 34 : 24));
  return { node: n, lines, w, h };
}

/** Where the segment from the box centre towards (tx, ty) leaves the box. */
function border(b: NodeBox, tx: number, ty: number) {
  const dx = tx - b.node.x;
  const dy = ty - b.node.y;
  if (!dx && !dy) return { x: b.node.x, y: b.node.y };
  if (b.node.shape === 'ellipse') {
    const a = b.w / 2;
    const c = b.h / 2;
    const t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (c * c));
    return { x: b.node.x + dx * t, y: b.node.y + dy * t };
  }
  const t = Math.min(Math.abs(b.w / 2 / (dx || 1e-9)), Math.abs(b.h / 2 / (dy || 1e-9)));
  return { x: b.node.x + dx * t, y: b.node.y + dy * t };
}

export function edgeGeometry(a: NodeBox, b: NodeBox) {
  const p1 = border(a, b.node.x, b.node.y);
  const p2 = border(b, a.node.x, a.node.y);
  // pull the arrow tip back slightly so the head is visible
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  const back = 4;
  return { x1: p1.x, y1: p1.y, x2: p2.x - ((p2.x - p1.x) / len) * back, y2: p2.y - ((p2.y - p1.y) / len) * back, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2, len };
}

export function mapBounds(boxes: NodeBox[]) {
  if (!boxes.length) return { x: 0, y: 0, w: CANVAS.width, h: CANVAS.height };
  const x0 = Math.min(...boxes.map((b) => b.node.x - b.w / 2));
  const x1 = Math.max(...boxes.map((b) => b.node.x + b.w / 2));
  const y0 = Math.min(...boxes.map((b) => b.node.y - b.h / 2));
  const y1 = Math.max(...boxes.map((b) => b.node.y + b.h / 2));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function NodeShapeEl({ b, fill, stroke, strokeWidth = 0 }: { b: NodeBox; fill: string; stroke?: string; strokeWidth?: number }) {
  const { x, y, shape } = b.node;
  if (shape === 'ellipse') return <ellipse cx={x} cy={y} rx={b.w / 2} ry={b.h / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  return <rect x={x - b.w / 2} y={y - b.h / 2} width={b.w} height={b.h} rx={shape === 'rounded' ? 16 : 4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
}

export function NodeText({ b }: { b: NodeBox }) {
  const th = linesHeight(b.lines.length, NODE_FONT, NODE_LH);
  return <Lines lines={b.lines} x={b.node.x} y={b.node.y - th / 2} size={NODE_FONT} weight={600} fill="#FFFFFF" lh={NODE_LH} />;
}

export function EdgeEl({ a, b, label, theme, markerId, highlight }: { a: NodeBox; b: NodeBox; label: string; theme: Theme; markerId: string; highlight?: boolean }) {
  const g = edgeGeometry(a, b);
  const lab = label.trim() ? wrap(label, 160, 16, 500, { maxLines: 2 }) : [];
  const lw = lab.length ? widest(lab, 16, 500) + 16 : 0;
  const lh = lab.length ? linesHeight(lab.length, 16, 1.3) + 8 : 0;
  return (
    <g>
      <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={highlight ? theme.accent : theme.line} strokeWidth={highlight ? 4 : 2.5} markerEnd={`url(#${markerId})`} />
      {lab.length > 0 && (
        <g>
          <rect x={g.mx - lw / 2} y={g.my - lh / 2} width={lw} height={lh} rx={6} fill={theme.bg} stroke={theme.line} strokeOpacity={0.6} />
          <Lines lines={lab} x={g.mx} y={g.my - lh / 2 + 3} size={16} weight={500} fill={theme.text} lh={1.3} />
        </g>
      )}
    </g>
  );
}

export function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill={color} />
    </marker>
  );
}

/** The finished map, cropped to its content, with the design title on top (export and gallery). */
export function ConceptMapSvg({ d, m = measure }: { d: ConceptMapDesign; m?: Measure }) {
  const theme = THEMES[d.theme];
  return <MapPicture data={d.data} title={d.title} theme={theme} m={m} />;
}

export function MapPicture({ data, title, theme, m = measure }: { data: ConceptMapData; title: string; theme: Theme; m?: Measure }) {
  const marker = `arrow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const boxes = data.nodes.map((n) => nodeBox(n, m));
  const byId = new Map(boxes.map((b) => [b.node.id, b]));
  const bounds = mapBounds(boxes);
  const head = Header({ title, theme, m });
  const w = Math.max(W, Math.ceil(bounds.w + 2 * PAD));
  const h = Math.ceil(head.height + bounds.h + 2 * PAD + FOOT);
  const dx = (w - bounds.w) / 2 - bounds.x;
  const dy = head.height + PAD - bounds.y;
  return (
    <Frame w={w} h={h} theme={theme} label={`${title}: خريطة مفاهيم`}>
      <defs>
        <ArrowMarker id={marker} color={theme.line} />
      </defs>
      <g transform={`translate(${(w - W) / 2} 0)`}>{head.node}</g>
      <g transform={`translate(${dx} ${dy})`}>
        {data.edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          return a && b ? <EdgeEl key={e.id} a={a} b={b} label={e.label} theme={theme} markerId={marker} /> : null;
        })}
        {boxes.map((b) => (
          <g key={b.node.id} data-testid="design-node">
            <NodeShapeEl b={b} fill={nodeFill(theme, b.node.color)} />
            <NodeText b={b} />
          </g>
        ))}
      </g>
      <Footer w={w} h={h} theme={theme} />
    </Frame>
  );
}

export function DesignSvg({ design }: { design: Design }) {
  if (design.kind === 'cards') return <CardsSvg d={design} />;
  if (design.kind === 'summary') return <SummarySvg d={design} />;
  return <ConceptMapSvg d={design} />;
}
