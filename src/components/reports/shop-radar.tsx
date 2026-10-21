import { useEffect, useMemo, useState } from "react";
import { HEALTH_LABELS, type Health } from "@/lib/catalog";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const fmt = (v: number) => v.toLocaleString("en-IN");
const MAX_AXES = 6;
// Worst-first: a shop takes the most severe health of its lines (health comes from inventory_status).
const SEVERITY: Health[] = ["critical", "low", "not_configured", "healthy"];

export interface RadarRow {
  shop_id: string | null;
  shop_number: string | null;
  shop_name: string | null;
  quantity_on_hand: number | null;
  safety_minimum: number | null;
  health: string | null;
}

interface ShopPoint {
  id: string;
  code: string;
  name: string;
  units: number;
  threshold: number;
  lines: number;
  status: Health;
}

/** Aggregates the given filtered stock rows per shop; ranks by units on hand. */
function shopPoints(rows: RadarRow[]): ShopPoint[] {
  const m = new Map<string, ShopPoint & { seen: Set<Health> }>();
  for (const r of rows) {
    if (!r.shop_id) continue;
    const e = m.get(r.shop_id) ?? {
      id: r.shop_id,
      code: r.shop_number ?? "—",
      name: r.shop_name ?? "",
      units: 0,
      threshold: 0,
      lines: 0,
      status: "healthy" as Health,
      seen: new Set<Health>(),
    };
    e.units += Math.max(0, r.quantity_on_hand ?? 0);
    e.threshold += Math.max(0, r.safety_minimum ?? 0);
    e.lines += 1;
    e.seen.add(
      (SEVERITY as string[]).includes(r.health ?? "")
        ? (r.health as Health)
        : "not_configured",
    );
    m.set(r.shop_id, e);
  }
  return [...m.values()]
    .map(({ seen, ...p }) => ({
      ...p,
      status: SEVERITY.find((h) => seen.has(h)) ?? "healthy",
    }))
    .sort((a, b) => b.units - a.units || a.code.localeCompare(b.code));
}

export function ShopRadarPanel({ rows }: { rows: RadarRow[] }) {
  const all = useMemo(() => shopPoints(rows), [rows]);
  const shops = all.slice(0, MAX_AXES);
  const [active, setActive] = useState<string | null>(null);
  const bind = (id: string) => ({
    onMouseEnter: () => setActive(id),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(id),
    onBlur: () => setActive(null),
  });
  const scope =
    all.length > MAX_AXES
      ? `Top ${MAX_AXES} of ${all.length} shops by units`
      : `${all.length} shop${all.length === 1 ? "" : "s"}`;

  return (
    <div className="tasmac-report-analysis">
      <section
        className="tasmac-op-surface tasmac-report-panel"
        aria-label="Stock against safety threshold by shop"
      >
        <header className="tasmac-report-panel-head">
          <div className="min-w-0">
            <h2 className="tasmac-report-panel-title">
              On hand vs safety threshold
            </h2>
            <p className="text-xs text-muted-foreground">
              {scope} · both series on one scale
            </p>
          </div>
          <ul className="tasmac-radar-legend" aria-label="Chart legend">
            <li>
              <span
                className="tasmac-radar-key"
                data-series="units"
                aria-hidden
              />
              Units on hand
            </li>
            <li>
              <span
                className="tasmac-radar-key"
                data-series="threshold"
                aria-hidden
              />
              Safety threshold (Σ line minimums)
            </li>
          </ul>
        </header>
        {shops.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No shops in the current filters.
          </p>
        ) : shops.length < 3 ? (
          <PairBars shops={shops} active={active} bind={bind} />
        ) : (
          <Radar shops={shops} active={active} />
        )}
      </section>
      <section
        className="tasmac-op-surface tasmac-report-panel"
        aria-label="Exact values by shop"
      >
        <header className="tasmac-report-panel-head">
          <h2 className="tasmac-report-panel-title">Shop readout</h2>
          <span className="text-xs text-muted-foreground">Exact values</span>
        </header>
        {shops.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No rows.
          </p>
        ) : (
          <>
          <div className="tasmac-radar-readout-scroll">
            <table className="tasmac-radar-readout">
              <caption className="sr-only">
                Units on hand, safety threshold and worst line health for each
                charted shop
              </caption>
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th scope="col">Shop</th>
                  <th scope="col" className="text-center">
                    On hand
                  </th>
                  <th scope="col" className="text-center">
                    Safety
                  </th>
                  <th scope="col" className="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    data-active={active === p.id}
                    aria-label={`${p.code} ${p.name}: ${fmt(p.units)} units on hand, safety threshold ${fmt(p.threshold)}, ${HEALTH_LABELS[p.status]}`}
                    {...bind(p.id)}
                  >
                    <td>
                      <span className="block font-mono text-xs text-foreground">
                        {p.code}
                      </span>
                      <span
                        className="block max-w-[160px] truncate text-xs text-muted-foreground"
                      >
                        {p.name}
                      </span>
                    </td>
                    <td className="text-center font-medium text-foreground tabular-nums">
                      {fmt(p.units)}
                    </td>
                    <td className="text-center tabular-nums">
                      {fmt(p.threshold)}
                    </td>
                    <td className="text-center">
                      <span className="tasmac-health" data-health={p.status}>
                        <span className="tasmac-health-dot" aria-hidden />
                        {HEALTH_LABELS[p.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}

const W = 560;
const H = 280;
const CX = W / 2;
const CY = H / 2;
const R = 116;
const LEVELS = [0.25, 0.5, 0.75, 1];

function Radar({
  shops,
  active,
}: {
  shops: ShopPoint[];
  active: string | null;
}) {
  const reduced = useReducedMotion();
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) return setDrawn(true);
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  const max = Math.max(1, ...shops.flatMap((s) => [s.units, s.threshold]));
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / shops.length;
  const at = (i: number, f: number) =>
    [CX + Math.cos(angle(i)) * R * f, CY + Math.sin(angle(i)) * R * f] as const;
  const poly = (f: (s: ShopPoint) => number) =>
    shops.map((s, i) => at(i, f(s) / max).join(",")).join(" ");
  const ring = (f: number) => shops.map((_, i) => at(i, f).join(",")).join(" ");
  const desc = shops
    .map(
      (s) =>
        `${s.code} ${s.name}: ${fmt(s.units)} on hand, threshold ${fmt(s.threshold)}`,
    )
    .join("; ");

  return (
    <div className="tasmac-radar-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="tasmac-radar"
        role="img"
        aria-labelledby="radar-title radar-desc"
      >
        <title id="radar-title">
          Units on hand and safety threshold by shop
        </title>
        <desc id="radar-desc">{`Scale maximum ${fmt(max)} units. ${desc}.`}</desc>
        {LEVELS.map((l) => (
          <polygon key={l} points={ring(l)} className="tasmac-radar-grid" />
        ))}
        {shops.map((s, i) => {
          const [x, y] = at(i, 1);
          const [lx, ly] = at(i, 1.16);
          const anchor =
            Math.abs(lx - CX) < 4 ? "middle" : lx > CX ? "start" : "end";
          return (
            <g key={s.id}>
              <line
                x1={CX}
                y1={CY}
                x2={x}
                y2={y}
                className="tasmac-radar-spoke"
              />
              <text
                x={lx}
                y={ly}
                dy="0.35em"
                textAnchor={anchor}
                className="tasmac-radar-axis"
                data-active={active === s.id}
              >
                {s.code}
              </text>
            </g>
          );
        })}
        <text x={CX + 4} y={CY - R - 2} className="tasmac-radar-scale">
          {fmt(max)}
        </text>
        <g
          className="tasmac-radar-series"
          data-drawn={drawn}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        >
          <polygon
            points={poly((s) => s.threshold)}
            className="tasmac-radar-poly"
            data-series="threshold"
          />
          <polygon
            points={poly((s) => s.units)}
            className="tasmac-radar-poly"
            data-series="units"
          />
          {shops.map((s, i) => {
            const [ux, uy] = at(i, s.units / max);
            const [tx, ty] = at(i, s.threshold / max);
            const on = active === s.id;
            return (
              <g key={s.id}>
                <circle
                  cx={tx}
                  cy={ty}
                  r={on ? 4 : 2.5}
                  className="tasmac-radar-dot"
                  data-series="threshold"
                >
                  <title>{`${s.code} · ${s.name}: threshold ${fmt(s.threshold)}`}</title>
                </circle>
                <circle
                  cx={ux}
                  cy={uy}
                  r={on ? 4.5 : 3}
                  className="tasmac-radar-dot"
                  data-series="units"
                >
                  <title>{`${s.code} · ${s.name}: ${fmt(s.units)} on hand`}</title>
                </circle>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** Honest fallback for 1–2 shops: paired bars on one shared scale. */
function PairBars({
  shops,
  active,
  bind,
}: {
  shops: ShopPoint[];
  active: string | null;
  bind: (id: string) => object;
}) {
  const max = Math.max(1, ...shops.flatMap((s) => [s.units, s.threshold]));
  return (
    <div className="tasmac-pair-list">
      <p className="text-xs text-muted-foreground">
        Fewer than three shops in scope — shown as bars instead of a radar.
      </p>
      {shops.map((s) => (
        <div
          key={s.id}
          className="tasmac-pair"
          data-active={active === s.id}
          {...bind(s.id)}
        >
          <span className="font-mono text-xs text-foreground">{s.code}</span>
          <div className="flex flex-col gap-1.5">
            {(["units", "threshold"] as const).map((k) => (
              <div key={k} className="tasmac-pair-bar">
                <span className="tasmac-report-track" aria-hidden>
                  <span
                    className="tasmac-pair-fill"
                    data-series={k}
                    style={{ width: `${(s[k] / max) * 100}%` }}
                  />
                </span>
                <span className="text-right text-xs tabular-nums text-foreground">
                  {fmt(s[k])}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
