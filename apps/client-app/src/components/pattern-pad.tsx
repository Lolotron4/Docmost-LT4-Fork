// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
// Entsperr-Muster: 3×3 Punkte, mit Maus, Stift oder Finger verbinden.
import { useRef, useState } from "react";

const SIZE = 240;
const STEP = SIZE / 3;
const RADIUS = 30;
const points = Array.from({ length: 9 }, (_, i) => ({
  i,
  x: STEP / 2 + (i % 3) * STEP,
  y: STEP / 2 + Math.floor(i / 3) * STEP,
}));

/** Punkte, die beim direkten Weg von a nach b übersprungen würden (z. B. 0→2 über 1). */
export function between(a: number, b: number): number | null {
  const ax = a % 3, ay = Math.floor(a / 3), bx = b % 3, by = Math.floor(b / 3);
  if ((ax + bx) % 2 === 0 && (ay + by) % 2 === 0) {
    const m = ((ay + by) / 2) * 3 + (ax + bx) / 2;
    return m === a || m === b ? null : m;
  }
  return null;
}

export function PatternPad({
  onComplete,
  disabled,
  error,
}: {
  onComplete: (pattern: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const [path, setPath] = useState<number[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const local = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };

  const hit = (x: number, y: number) =>
    points.find((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= RADIUS ** 2)?.i;

  const pathRef = useRef<number[]>([]);

  const add = (i: number | undefined) => {
    if (i === undefined) return;
    const prev = pathRef.current;
    if (prev.includes(i)) return;
    const next = [...prev];
    const last = prev[prev.length - 1];
    if (last !== undefined) {
      const mid = between(last, i);
      if (mid !== null && !next.includes(mid)) next.push(mid);
    }
    next.push(i);
    pathRef.current = next;
    setPath(next);
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setCursor(null);
    const done = pathRef.current;
    pathRef.current = [];
    setPath([]);
    if (done.length) onComplete(done.join("-"));
  };

  const color = error ? "var(--mantine-color-red-6)" : "var(--mantine-color-blue-6)";
  const coords = path.map((i) => points[i]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      role="img"
      aria-label="Muster zeichnen"
      style={{ touchAction: "none", userSelect: "none", opacity: disabled ? 0.4 : 1, maxWidth: "100%" }}
      onPointerDown={(e) => {
        if (disabled) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drawing.current = true;
        const p = local(e);
        add(hit(p.x, p.y));
        setCursor(p);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = local(e);
        add(hit(p.x, p.y));
        setCursor(p);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onPointerLeave={finish}
    >
      {coords.length > 0 && (
        <polyline
          points={[...coords.map((c) => `${c.x},${c.y}`), ...(cursor ? [`${cursor.x},${cursor.y}`] : [])].join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />
      )}
      {points.map((p) => {
        const active = path.includes(p.i);
        return (
          <g key={p.i}>
            <circle cx={p.x} cy={p.y} r={RADIUS - 6} fill="transparent" stroke={active ? color : "var(--mantine-color-gray-5)"} strokeWidth={2} />
            <circle cx={p.x} cy={p.y} r={active ? 10 : 7} fill={active ? color : "var(--mantine-color-gray-6)"} />
          </g>
        );
      })}
    </svg>
  );
}
