import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { countTicks, spreadIndices } from "@/lib/chart-scale";
import { FA_MONTHS, formatDateKey, jalaliFromKey, toFaDigits } from "@/lib/persian";

const HEIGHT = 180;
// LTR coordinate space (the svg is dir="ltr"); days run right → left like the RTL timeline.
const MARGIN = { top: 14, right: 34, bottom: 24, left: 4 };

function dayMonth(key: string): string {
  const j = jalaliFromKey(key)!;
  return `${toFaDigits(j.jd)} ${FA_MONTHS[j.jm - 1]}`;
}

/** A bar with rounded data-end corners, anchored square on the baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(2, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * One count per day as columns (a single series: the title names it, no legend).
 * Tooltip on hover/touch, arrow keys when focused, and a table view: the
 * tooltip never gates a value.
 */
export function DailyBarsChart({
  points,
  label,
  unit,
}: {
  /** Chronological, one per day. */
  points: { date: string; value: number }[];
  label: string;
  /** "کلیک" → "۱۲ کلیک" */
  unit: string;
}) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const describedBy = useId();
  const last = points.length - 1;

  const geometry = useMemo(() => {
    if (width === 0 || points.length === 0) return null;
    const ticks = countTicks(Math.max(...points.map((p) => p.value)));
    const hi = ticks[ticks.length - 1];
    const plotLeft = MARGIN.left;
    const plotRight = width - MARGIN.right;
    const plotBottom = HEIGHT - MARGIN.bottom;
    const band = (plotRight - plotLeft) / points.length;
    const gap = band > 8 ? 2 : 1;
    const barWidth = Math.max(1, band - gap);
    // Oldest day at the right edge.
    const bandLeft = (i: number) => plotRight - (i + 1) * band;
    const y = (v: number) => plotBottom - (v / hi) * (plotBottom - MARGIN.top);
    return { ticks, y, band, gap, barWidth, bandLeft, plotLeft, plotRight, plotBottom };
  }, [points, width]);

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!geometry) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = Math.floor((geometry.plotRight - x) / geometry.band);
    setActive(Math.min(last, Math.max(0, i)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = active ?? last;
    // ← moves towards today (left), → back in time.
    const next =
      e.key === "ArrowLeft"
        ? current + 1
        : e.key === "ArrowRight"
          ? current - 1
          : e.key === "End"
            ? last
            : e.key === "Home"
              ? 0
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };

  const point = active === null ? null : points[active];
  const describe = (p: { date: string; value: number }) =>
    `${formatDateKey(p.date, { weekday: true })}: ${toFaDigits(p.value)} ${unit}`;

  return (
    <div>
      <div
        ref={containerRef}
        className="relative rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="group"
        aria-label={label}
        aria-describedby={describedBy}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a ?? last)}
        onBlur={() => setActive(null)}
      >
        {geometry ? (
          <svg
            width={width}
            height={HEIGHT}
            direction="ltr"
            className="block touch-pan-y select-none"
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
            onPointerLeave={() => setActive(null)}
            aria-hidden
          >
            {geometry.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={geometry.plotLeft}
                  x2={geometry.plotRight}
                  y1={geometry.y(t)}
                  y2={geometry.y(t)}
                  className={t === 0 ? "stroke-chart-axis" : "stroke-chart-grid"}
                  strokeWidth={1}
                />
                <text
                  x={geometry.plotRight + 6}
                  y={geometry.y(t)}
                  dy="0.35em"
                  textAnchor="start"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {toFaDigits(t)}
                </text>
              </g>
            ))}

            {points.map((p, i) =>
              p.value > 0 ? (
                <path
                  key={p.date}
                  d={barPath(
                    geometry.bandLeft(i) + geometry.gap / 2,
                    geometry.y(p.value),
                    geometry.barWidth,
                    geometry.plotBottom - geometry.y(p.value),
                  )}
                  className="fill-chart-1"
                  fillOpacity={active === null || active === i ? 1 : 0.45}
                />
              ) : null,
            )}

            {spreadIndices(points.length, 4).map((i) => (
              <text
                key={i}
                x={geometry.bandLeft(i) + geometry.band / 2}
                y={HEIGHT - 7}
                textAnchor={i === 0 ? "end" : i === last ? "start" : "middle"}
                className="fill-muted-foreground text-[10px]"
              >
                {i === last ? "امروز" : dayMonth(points[i].date)}
              </text>
            ))}

            {active !== null ? (
              <rect
                x={geometry.bandLeft(active)}
                y={MARGIN.top - 4}
                width={geometry.band}
                height={geometry.plotBottom - MARGIN.top + 4}
                className="fill-foreground"
                fillOpacity={0.05}
              />
            ) : null}
          </svg>
        ) : null}

        {geometry && point && active !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={
              geometry.bandLeft(active) > width / 2
                ? { right: width - geometry.bandLeft(active) + 6 }
                : { left: geometry.bandLeft(active) + geometry.band + 6 }
            }
          >
            <div className="font-bold tabular-nums">
              {toFaDigits(point.value)} {unit}
            </div>
            <div className="text-muted-foreground">{formatDateKey(point.date, { weekday: true })}</div>
          </div>
        ) : null}
      </div>

      <p id={describedBy} className="sr-only" aria-live="polite">
        {point ? describe(point) : "با کلیدهای جهت‌نما بین روزها جابه‌جا شوید."}
      </p>

      <details className="mt-2 text-xs">
        <summary className="w-fit cursor-pointer rounded-sm text-muted-foreground hover:text-foreground">
          نمایش داده‌ها به صورت جدول
        </summary>
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border">
          <table className="w-full text-xs">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-start font-medium">
                  روز
                </th>
                <th scope="col" className="px-3 py-1.5 text-start font-medium">
                  {unit}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td className="px-3 py-1">{formatDateKey(p.date, { weekday: true })}</td>
                  <td className="px-3 py-1 tabular-nums">{toFaDigits(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
