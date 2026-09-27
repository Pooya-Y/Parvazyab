import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { FA_MONTHS, formatDateKey, formatPrice, jalaliFromKey, toFaDigits } from "@/lib/persian";
import { spreadIndices, valueTicks } from "@/lib/chart-scale";
import type { PricePoint } from "@/lib/types";

const HEIGHT = 190;
// LTR coordinate space (the svg is dir="ltr"); time runs right → left to match the RTL timeline.
const MARGIN = { top: 22, right: 46, bottom: 26, left: 10 };

function dayMonth(key: string): string {
  const j = jalaliFromKey(key)!;
  return `${toFaDigits(j.jd)} ${FA_MONTHS[j.jm - 1]}`;
}

/** 2_150_000 → "۲٫۱۵" (millions, unit stated beside the axis). */
function millions(value: number): string {
  return toFaDigits(String(Math.round(value / 10_000) / 100)).replace(".", "٫");
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The observer reports the initial size too.
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Single-series trend of the route's daily lowest fare. Crosshair + tooltip on
 * hover/touch, arrow keys when focused, and a table view — the tooltip never
 * gates a value.
 */
export function PriceHistoryChart({
  points,
  average,
  label,
}: {
  points: PricePoint[];
  average?: number;
  label: string;
}) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const describedBy = useId();

  const geometry = useMemo(() => {
    if (width === 0 || points.length < 2) return null;
    const values = points.map((p) => p.minPrice);
    const { ticks, lo, hi } = valueTicks(
      Math.min(...values, average ?? Infinity),
      Math.max(...values, average ?? -Infinity),
    );
    const plotRight = width - MARGIN.right;
    const plotLeft = MARGIN.left;
    const plotBottom = HEIGHT - MARGIN.bottom;
    const step = (plotRight - plotLeft) / (points.length - 1);
    // Oldest point at the right edge, today at the left.
    const x = (i: number) => plotRight - i * step;
    const y = (v: number) => plotBottom - ((v - lo) / (hi - lo)) * (plotBottom - MARGIN.top);
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.minPrice).toFixed(1)}`).join("");
    const area = `${line}L${x(points.length - 1).toFixed(1)},${plotBottom}L${x(0).toFixed(1)},${plotBottom}Z`;
    return { ticks, x, y, line, area, plotLeft, plotRight, plotBottom, step };
  }, [points, average, width]);

  const indexAt = (clientX: number, rect: DOMRect) => {
    if (!geometry) return null;
    const i = Math.round((geometry.plotRight - (clientX - rect.left)) / geometry.step);
    return Math.min(points.length - 1, Math.max(0, i));
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) =>
    setActive(indexAt(e.clientX, e.currentTarget.getBoundingClientRect()));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = points.length - 1;
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

  const last = points.length - 1;
  const shown = active ?? null;
  const point = shown === null ? null : points[shown];

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
            {/* Recessive grid: solid hairlines one step off the surface. */}
            {geometry.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={geometry.plotLeft}
                  x2={geometry.plotRight}
                  y1={geometry.y(t)}
                  y2={geometry.y(t)}
                  className="stroke-chart-grid"
                  strokeWidth={1}
                />
                <text
                  x={geometry.plotRight + 6}
                  y={geometry.y(t)}
                  dy="0.35em"
                  textAnchor="start"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {millions(t)}
                </text>
              </g>
            ))}
            <text x={width - 2} y={10} textAnchor="end" className="fill-muted-foreground text-[10px]">
              میلیون تومان
            </text>

            {average !== undefined ? (
              <g>
                <line
                  x1={geometry.plotLeft}
                  x2={geometry.plotRight}
                  y1={geometry.y(average)}
                  y2={geometry.y(average)}
                  className="stroke-muted-foreground/50"
                  strokeWidth={1}
                />
                <text
                  x={geometry.plotRight - 4}
                  y={geometry.y(average) - 5}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px]"
                >
                  میانگین
                </text>
              </g>
            ) : null}

            <path d={geometry.area} className="fill-chart-1" fillOpacity={0.1} />
            <path
              d={geometry.line}
              fill="none"
              className="stroke-chart-1"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Baseline and date labels. */}
            <line
              x1={geometry.plotLeft}
              x2={geometry.plotRight}
              y1={geometry.plotBottom}
              y2={geometry.plotBottom}
              className="stroke-chart-axis"
              strokeWidth={1}
            />
            {spreadIndices(points.length, 4).map((i) => (
              <text
                key={i}
                x={geometry.x(i)}
                y={HEIGHT - 8}
                textAnchor={i === 0 ? "end" : i === last ? "start" : "middle"}
                className="fill-muted-foreground text-[10px]"
              >
                {i === last ? "امروز" : dayMonth(points[i].date)}
              </text>
            ))}

            {/* Today: an end dot with a surface ring and a direct label. */}
            <circle
              cx={geometry.x(last)}
              cy={geometry.y(points[last].minPrice)}
              r={4.5}
              className="fill-chart-1 stroke-card"
              strokeWidth={2}
            />
            <text
              x={geometry.x(last) + 8}
              y={geometry.y(points[last].minPrice) - 9}
              textAnchor="start"
              className="fill-foreground stroke-card text-[11px] font-bold"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {millions(points[last].minPrice)}
            </text>

            {shown !== null ? (
              <g>
                <line
                  x1={geometry.x(shown)}
                  x2={geometry.x(shown)}
                  y1={MARGIN.top - 6}
                  y2={geometry.plotBottom}
                  className="stroke-foreground/35"
                  strokeWidth={1}
                />
                <circle
                  cx={geometry.x(shown)}
                  cy={geometry.y(points[shown].minPrice)}
                  r={4.5}
                  className="fill-chart-1 stroke-card"
                  strokeWidth={2}
                />
              </g>
            ) : null}
          </svg>
        ) : null}

        {geometry && point && shown !== null ? (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={
              geometry.x(shown) > width / 2
                ? { right: width - geometry.x(shown) + 10 }
                : { left: geometry.x(shown) + 10 }
            }
          >
            <div className="font-bold tabular-nums">{formatPrice(point.minPrice)}</div>
            <div className="text-muted-foreground">{formatDateKey(point.date, { weekday: true })}</div>
          </div>
        ) : null}
      </div>

      <p id={describedBy} className="sr-only" aria-live="polite">
        {point
          ? `${formatDateKey(point.date, { weekday: true })}: ${formatPrice(point.minPrice)}`
          : "با کلیدهای جهت‌نما بین روزها جابه‌جا شوید."}
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
                  کمترین قیمت
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td className="px-3 py-1">{formatDateKey(p.date, { weekday: true })}</td>
                  <td className="px-3 py-1 tabular-nums">{formatPrice(p.minPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
