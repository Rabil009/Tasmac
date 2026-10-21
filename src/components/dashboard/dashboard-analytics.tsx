import { useEffect, useState, type ReactNode } from "react";
import {
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
} from "@4rged-ai/platform";
import { fmt } from "@/components/analytics/bits";
import { composition, type ShopUnits } from "@/lib/analytics";
import { HEALTH, HEALTH_LABELS, type Health } from "@/lib/catalog";
import { Activity, Filter, History, MapPin } from "lucide-react";

/**
 * Dashboard semantic palette. WCAG contrast measured against card #171717 / muted track #1E1E1E:
 * text tones (brand, positive, negative, health.low) ≥ 6.4:1; graphical marks ≥ 3.5:1 against
 * card and track (lowest: shop bar slate #64748B 3.50:1 on track). `track` is a decorative
 * container, not a meaningful mark, so it has no contrast requirement.
 */
export const DASH_COLORS = {
  brand: "var(--primary)", // reserved for the primary/inward series
  issued: "#8d9aaf", // neutral slate
  track: "#222627", // graphite rail
  positive: "#5caea5", // muted teal
  negative: "#d96b65", // muted red
  category: {
    imfl: "#f97316",
    beer: "#d5a546",
    wine: "#879fca",
    rtd: "#5caea5",
  } as Record<string, string>,
  shopBar: "#8d9aaf", // blue shop-share bar
  health: {
    critical: "#d96b65",
    low: "#d5a546",
    healthy: "#5caea5",
    not_configured: "#7d817e",
  },
} as const;
const catColor = (k: string) => DASH_COLORS.category[k] ?? DASH_COLORS.issued;
const pct = (n: number) => `${n.toFixed(1)}%`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;

export interface ShopActivity {
  todayTransactions: number;
  receipts: number;
  issues: number;
  latestAt: string | null;
  latestLabel: string | null;
}

/** True when the user prefers reduced motion; charts then render without animation. */
function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  // Read synchronously so animation is never enabled on the first render when reduce matches.
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function DashPanel({
  title,
  meta,
  actions,
  children,
  className = "",
  flush = false,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Body without padding, for edge-to-edge tables. */
  flush?: boolean;
}) {
  return (
    <Card
      variant="outlined"
      className={`flex flex-col gap-0 rounded-[10px] border-border bg-card py-0 shadow-none ${className}`}
    >
      <section aria-label={title} className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
          <h2 className="text-base leading-[22px] font-semibold text-foreground">
            {title}
          </h2>
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            {meta ? (
              <div className="truncate text-xs leading-[18px] text-muted-foreground">
                {meta}
              </div>
            ) : null}
            {actions}
          </div>
        </header>
        <div className={`flex min-h-0 flex-1 flex-col ${flush ? "" : "p-5"}`}>
          {children}
        </div>
      </section>
    </Card>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

const hoverBind = (k: string, set: (v: string | null) => void) => ({
  onMouseEnter: () => set(k),
  onMouseLeave: () => set(null),
  onFocus: () => set(k),
  onBlur: () => set(null),
});

export function InventoryDistribution({
  entries,
}: {
  entries: { key: string; label: string; units: number }[];
}) {
  const reduced = useReducedMotion();
  const { total, items } = composition(entries);
  const [active, setActive] = useState<string | null>(null);
  const cur = items.find((i) => i.key === active);
  const slices = items.filter((i) => i.units > 0);

  return (
    <DashPanel
      title="Inventory distribution"
      meta="Units on hand by category · current"
    >
      {total === 0 ? (
        <Quiet>No units on hand within your scope.</Quiet>
      ) : (
        <div className="grid flex-1 grid-cols-[216px_minmax(0,1fr)] items-center gap-6">
          <figure
            className="relative size-[216px]"
            data-testid="distribution-donut"
          >
            <figcaption className="sr-only">
              {`${fmt(total)} units on hand. `}
              {items
                .map(
                  (i) => `${i.label}: ${fmt(i.units)} units, ${pct(i.share)}`,
                )
                .join("; ")}
            </figcaption>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="units"
                  nameKey="label"
                  innerRadius="68%"
                  outerRadius="96%"
                  paddingAngle={1.5}
                  stroke="var(--card)"
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={!reduced}
                  animationDuration={720}
                  animationEasing="ease-out"
                  onMouseEnter={(_, idx) => setActive(slices[idx]?.key ?? null)}
                  onMouseLeave={() => setActive(null)}
                >
                  {slices.map((s) => (
                    <Cell
                      key={s.key}
                      data-active={active === s.key ? "true" : undefined}
                      fill={catColor(s.key)}
                      fillOpacity={active && active !== s.key ? 0.2 : 1}
                      style={{
                        transition: "fill-opacity 160ms ease",
                        outline: "none",
                      }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
              aria-live="polite"
              data-testid="donut-center"
            >
              <span className="tasmac-metric-label text-muted-foreground">
                {cur ? cur.label : "Total on hand"}
              </span>
              <span className="text-[28px] leading-8 font-semibold tabular-nums text-foreground">
                {fmt(cur ? cur.units : total)}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {cur ? `${pct(cur.share)} of units` : "units"}
              </span>
            </div>
          </figure>
          <ul className="flex flex-col gap-1" aria-label="Category legend">
            {items.map((i) => (
              <li key={i.key}>
                <button
                  type="button"
                  data-active={active === i.key ? "true" : undefined}
                  aria-label={`${i.label}: ${fmt(i.units)} units, ${pct(i.share)}`}
                  {...hoverBind(i.key, setActive)}
                  className="tasmac-data-row grid h-9 w-full grid-cols-[10px_1fr_auto_52px] items-center gap-3 px-3 text-left"
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-[2px]"
                    style={{
                      background: catColor(i.key),
                      opacity: i.units ? 1 : 0.25,
                    }}
                  />
                  <span className="text-sm text-foreground">{i.label}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {fmt(i.units)}
                  </span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {pct(i.share)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashPanel>
  );
}

export function StockFlowBalance({
  inward,
  issued,
  period,
}: {
  inward: number;
  issued: number;
  period: string;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(inward, issued);
  const net = inward - issued;
  // Inner ring first (Issued), outer ring last (Inward).
  const data = [
    { key: "issued", name: "Issued", value: issued, fill: DASH_COLORS.issued },
    { key: "inward", name: "Inward", value: inward, fill: DASH_COLORS.brand },
  ];
  const rows = [
    { key: "inward", label: "Inward", value: inward, color: DASH_COLORS.brand },
    {
      key: "issued",
      label: "Issued",
      value: issued,
      color: DASH_COLORS.issued,
    },
  ];
  const cur = rows.find((r) => r.key === active);

  return (
    <DashPanel title="Stock flow balance" meta={period}>
      {max === 0 ? (
        <Quiet>No receipts or issues recorded in this period.</Quiet>
      ) : (
        <div className="flex flex-1 flex-col">
          <figure className="relative h-[160px]" data-testid="flow-balance">
            <figcaption className="sr-only">
              {`Inward ${fmt(inward)} units, issued ${fmt(issued)} units, net ${signed(net)} units, ${period}. Arcs are scaled to the larger value.`}
            </figcaption>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={data}
                cx="50%"
                cy="88%"
                innerRadius="96%"
                outerRadius="160%"
                startAngle={180}
                endAngle={0}
                barSize={14}
                barCategoryGap={6}
              >
                <PolarAngleAxis
                  type="number"
                  domain={[0, max]}
                  tick={false}
                  axisLine={false}
                />
                <RadialBar
                  dataKey="value"
                  cornerRadius={3}
                  background={{ fill: DASH_COLORS.track }}
                  isAnimationActive={!reduced}
                  animationDuration={760}
                  animationEasing="ease-out"
                  onMouseEnter={(d: { key?: string }) =>
                    setActive(d?.key ?? null)
                  }
                  onMouseLeave={() => setActive(null)}
                >
                  {data.map((d) => (
                    <Cell
                      key={d.key}
                      fill={d.fill}
                      fillOpacity={active && active !== d.key ? 0.3 : 1}
                      style={{ transition: "fill-opacity 160ms ease" }}
                    />
                  ))}
                </RadialBar>
              </RadialBarChart>
            </ResponsiveContainer>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center"
              aria-live="polite"
              data-testid="flow-center"
            >
              <span className="tasmac-metric-label text-muted-foreground">
                {cur ? cur.label : "Net change"}
              </span>
              <span
                className="tasmac-metric-value tabular-nums text-foreground"
                style={
                  !cur && net !== 0
                    ? {
                        color:
                          net > 0 ? DASH_COLORS.positive : DASH_COLORS.negative,
                      }
                    : undefined
                }
              >
                {cur ? fmt(cur.value) : signed(net)}
              </span>
              <span className="text-xs text-muted-foreground">
                units · {period}
              </span>
            </div>
          </figure>
          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-3">
            {rows.map((r) => (
              <div key={r.key}>
                <button
                  type="button"
                  data-active={active === r.key ? "true" : undefined}
                  aria-label={`${r.label}: ${fmt(r.value)} units`}
                  {...hoverBind(r.key, setActive)}
                  className="tasmac-data-row flex min-h-9 w-full flex-col items-start px-3 py-1.5 text-left"
                >
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      aria-hidden
                      className="h-0.5 w-3"
                      style={{ background: r.color }}
                    />
                    {r.label}
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">
                    {fmt(r.value)}
                  </dd>
                </button>
              </div>
            ))}
          </dl>
        </div>
      )}
    </DashPanel>
  );
}

export function InventoryByShop({
  shops,
  scopedToOneShop = false,
  shopActivity,
}: {
  shops: ShopUnits[];
  scopedToOneShop?: boolean;
  shopActivity?: ShopActivity;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [cityId, setCityId] = useState("");
  useEffect(() => {
    const h = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(h);
  }, []);
  const cities = [...new Map(
    shops
      .filter((shop) => shop.cityId)
      .map((shop) => [shop.cityId, shop.cityName]),
  )]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const scopedShops = cityId
    ? shops.filter((shop) => shop.cityId === cityId)
    : shops;
  const largest = Math.max(0, ...scopedShops.map((shop) => shop.units));
  const rankedShops = scopedShops.map((shop, index) => ({
    ...shop,
    rank: index + 1,
    relative: largest ? shop.units / largest : 0,
  }));
  const total = rankedShops.reduce((a, s) => a + s.units, 0);

  if (scopedToOneShop) {
    const shop = rankedShops[0];
    const [shopCode, ...shopNameParts] = shop?.label.split(" · ") ?? [];
    const shopName = shopNameParts.join(" · ");
    return (
      <DashPanel
        flush
        title="Shop overview"
        actions={
          <Badge variant="outline" size="sm" className="font-mono text-primary">
            {shopCode || "Assigned shop"}
          </Badge>
        }
      >
        {!shop ? (
          <Quiet>No shop inventory within your scope.</Quiet>
        ) : (
          <div className="flex h-full flex-col gap-4 p-5">
            <Card variant="outlined" className="gap-0 rounded-[8px] bg-muted/35 py-3 shadow-none">
              <CardHeader className="flex-row items-center justify-between gap-4 px-4">
                <div className="min-w-0">
                  <CardDescription className="text-xs font-semibold uppercase tracking-[0.08em]">
                    Assigned shop
                  </CardDescription>
                  <CardTitle className="mt-1.5 truncate text-lg">
                    {shopName || shop.label}
                  </CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-1.5 text-sm">
                    <MapPin aria-hidden className="size-3.5 text-primary" />
                    {shop.cityName}
                  </CardDescription>
                </div>
                <Badge variant="outline" size="sm">Shop Manager</Badge>
              </CardHeader>
            </Card>
            <div className="grid flex-1 grid-cols-2 gap-3">
              <StatCard
                label="Last stock update"
                value={shopActivity?.latestAt ? fmtTime(shopActivity.latestAt) : "No updates"}
                icon={History}
                hint={shopActivity?.latestLabel ?? "No stock movement recorded today."}
                className="h-full rounded-[8px] border-border bg-card p-4 shadow-none"
              />
              <StatCard
                label="Today's activity"
                value={shopActivity?.todayTransactions ?? 0}
                icon={Activity}
                hint={`${shopActivity?.receipts ?? 0} receipts · ${shopActivity?.issues ?? 0} issues`}
                className="h-full rounded-[8px] border-border bg-card p-4 shadow-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Today's activity and records are limited to {shopCode}.
            </p>
          </div>
        )}
      </DashPanel>
    );
  }

  return (
    <DashPanel
      flush={rankedShops.length > 0}
      title="Inventory by shop"
      actions={
        <Select value={cityId || "all"} onValueChange={(value) => setCityId(value === "all" ? "" : value)}>
          <SelectTrigger
            aria-label="Filter shops by city"
            className="h-8 w-[116px] rounded-[8px] border-border bg-background px-2 text-xs font-medium text-foreground shadow-none"
          >
            <Filter className="mr-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent position="popper" className="tasmac-select-content tasmac-ws-menu">
            <SelectItem value="all">All cities</SelectItem>
            {cities.map((city) => (
              <SelectItem key={city.id} value={city.id}>
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {rankedShops.length === 0 ? (
        <Quiet>No shop inventory within your scope.</Quiet>
      ) : (
        <>
          <p className="sr-only">
            {rankedShops.map((s) => `${s.label}: ${fmt(s.units)} units`).join("; ")}
          </p>
          <div
            className="tasmac-table-scroll min-h-0 flex-1 overflow-y-auto"
            aria-label="Shop ranking"
          >
            <table className="tasmac-dash-table tasmac-dash-compact table-fixed">
              <caption className="sr-only">Shops ranked by units on hand</caption>
              <colgroup>
                <col className="w-14" />
                <col />
                <col className="w-24" />
                <col className="w-[34%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th scope="col" className="!pl-5 text-center">
                    Rank
                  </th>
                  <th scope="col" className="text-left">
                    Shop
                  </th>
                  <th scope="col" className="text-center">
                    Units
                  </th>
                  <th scope="col" className="!pr-5 text-left">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankedShops.map((s) => {
                  const share = total ? (s.units / total) * 100 : 0;
                  return (
                    <tr
                      key={s.shopId}
                      tabIndex={0}
                      data-testid="shop-row"
                      data-active={active === s.shopId ? "true" : undefined}
                      aria-label={`Rank ${s.rank}, ${s.label}: ${fmt(s.units)} units, ${pct(share)} of units`}
                      {...hoverBind(s.shopId, setActive)}
                      className={`outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active === s.shopId ? "bg-muted" : ""}`}
                    >
                      <td className="!pl-5 text-center tabular-nums text-muted-foreground">
                        {s.rank}
                      </td>
                      <td className="truncate text-foreground" title={s.label}>
                        {s.label}
                      </td>
                      <td className="text-center text-sm font-semibold tabular-nums text-foreground">
                        {fmt(s.units)}
                      </td>
                      <td className="!pr-5">
                        <span className="flex items-center gap-3">
                          <span
                            className="tasmac-shop-share-track relative h-1.5 flex-1 overflow-hidden rounded-[2px]"
                            aria-hidden
                          >
                            <span
                              className="absolute inset-y-0 left-0 rounded-[2px]"
                              style={{
                                background: DASH_COLORS.shopBar,
                                width: `${(shown || reduced ? s.relative : 0) * 100}%`,
                                opacity: active && active !== s.shopId ? 0.4 : 1,
                                transition: reduced
                                  ? "none"
                                  : "width 700ms cubic-bezier(.2,.7,.2,1), opacity 160ms ease",
                              }}
                            />
                          </span>
                          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {pct(share)}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </DashPanel>
  );
}

const HEALTH_COLOR: Record<Health, string> = DASH_COLORS.health;

export function OperationalAttention({
  rows,
  health,
  guidance,
}: {
  rows: {
    count: number;
    label: string;
    desc: string;
    to: ReactNode;
    tone?: Health;
  }[];
  health: Record<Health, number>;
  guidance?: ReactNode;
}) {
  const lines = HEALTH.reduce((a, h) => a + health[h], 0);
  return (
    <DashPanel title="Operational attention" meta="Current">
      {guidance}
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((a) => (
          <li
            key={a.label}
            className="flex min-h-[52px] items-center gap-4 py-1.5"
          >
            <span
              className={`w-10 shrink-0 text-right text-xl font-semibold tabular-nums ${a.count ? "text-foreground" : "text-muted-foreground"}`}
              style={
                a.count && a.tone ? { color: HEALTH_COLOR[a.tone] } : undefined
              }
            >
              {fmt(a.count)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {a.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {a.desc}
              </span>
            </span>
            {a.to}
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-border pt-4">
        <p className="tasmac-metric-label mb-2 text-muted-foreground">
          Stock health · lines
        </p>
        {lines === 0 ? (
          <p className="text-xs text-muted-foreground">
            No inventory lines within your scope.
          </p>
        ) : (
          <>
            <div
              className="flex h-2 gap-[2px] overflow-hidden rounded-[3px]"
              role="img"
              aria-label={HEALTH.map(
                (h) => `${HEALTH_LABELS[h]}: ${fmt(health[h])} lines`,
              ).join(", ")}
            >
              {HEALTH.filter((h) => health[h] > 0).map((h) => (
                <span
                  key={h}
                  style={{
                    background: HEALTH_COLOR[h],
                    width: `${(health[h] / lines) * 100}%`,
                  }}
                  title={`${HEALTH_LABELS[h]}: ${fmt(health[h])}`}
                />
              ))}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {HEALTH.map((h) => (
                <div key={h} className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: HEALTH_COLOR[h] }}
                  />
                  <dt className="truncate text-muted-foreground">
                    {HEALTH_LABELS[h]}
                  </dt>
                  <dd className="ml-auto tabular-nums text-foreground">
                    {fmt(health[h])}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </DashPanel>
  );
}
