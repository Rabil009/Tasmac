/**
 * M9 single aggregation layer. Dashboard and Reports both derive every total,
 * chart series and table from these pure functions over the same RLS-scoped rows,
 * so figures reconcile exactly for the same role, scope, filters and timeframe.
 */
import type { Category, Health } from "./catalog";
import type { MovementType } from "./stock";
import type { TransferStatus } from "./transfers";

export const TIMEFRAMES = ["all", "7d", "today"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];
export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  all: "All Time",
  "7d": "Last 7 Days",
  today: "Today",
};

/** Start instant for a preset (local midnight for Today, rolling 7×24h for Last 7 Days). */
export function sinceFor(tf: Timeframe, now: Date = new Date()): Date | null {
  if (tf === "all") return null;
  if (tf === "today")
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/** Local calendar date key YYYY-MM-DD. */
export const dateKey = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export interface InvRow {
  sku: string | null;
  product_name: string | null;
  category: Category | null;
  shop_id: string | null;
  shop_name: string | null;
  shop_number: string | null;
  city_id: string | null;
  quantity_on_hand: number | null;
  safety_minimum: number | null;
  health: string | null;
  mrp: number | null;
}
export interface MoveRow {
  id: string | null;
  created_at: string | null;
  movement_type: MovementType | null;
  quantity: number | null;
  delta: number | null;
  shop_id: string | null;
  city_id: string | null;
  sku: string | null;
  product_name: string | null;
  shop_name: string | null;
  reference: string | null;
  actor_name: string | null;
  txn_no: number | null;
}
export interface XferRow {
  status: TransferStatus | null;
  quantity: number | null;
  requested_at: string | null;
  source_shop_id: string | null;
  dest_shop_id: string | null;
  source_city_id: string | null;
  dest_city_id: string | null;
  sku: string | null;
  product_name: string | null;
  source_label: string | null;
  dest_label: string | null;
  reason: string | null;
  requester_name: string | null;
  txn_no: number | null;
}

const n = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const has = (hay: (string | number | null | undefined)[], q: string) => {
  const t = q.trim().toLowerCase();
  return (
    !t ||
    hay.some(
      (h) =>
        h !== null && h !== undefined && String(h).toLowerCase().includes(t),
    )
  );
};
const inTime = (iso: string | null, since: Date | null) =>
  !since || (iso !== null && new Date(iso) >= since);

export interface InvFilter {
  q?: string;
  city?: string;
  shop?: string;
  category?: Category | "";
  health?: Health | "";
}
export const filterInventory = <R extends InvRow>(rows: R[], f: InvFilter) =>
  rows.filter(
    (r) =>
      (!f.city || r.city_id === f.city) &&
      (!f.shop || r.shop_id === f.shop) &&
      (!f.category || r.category === f.category) &&
      (!f.health || r.health === f.health) &&
      has([r.sku, r.product_name, r.shop_name, r.shop_number], f.q ?? ""),
  );

export interface MoveFilter {
  q?: string;
  city?: string;
  shop?: string;
  type?: MovementType | "";
  since?: Date | null;
}
export const filterMovements = <R extends MoveRow>(rows: R[], f: MoveFilter) =>
  rows.filter(
    (r) =>
      inTime(r.created_at, f.since ?? null) &&
      (!f.city || r.city_id === f.city) &&
      (!f.shop || r.shop_id === f.shop) &&
      (!f.type || r.movement_type === f.type) &&
      has(
        [
          r.sku,
          r.product_name,
          r.shop_name,
          r.reference,
          r.actor_name,
          r.txn_no,
        ],
        f.q ?? "",
      ),
  );

export interface XferFilter {
  q?: string;
  city?: string;
  shop?: string;
  status?: TransferStatus | "";
  since?: Date | null;
}
export const filterTransfers = <R extends XferRow>(rows: R[], f: XferFilter) =>
  rows.filter(
    (r) =>
      inTime(r.requested_at, f.since ?? null) &&
      (!f.city || r.source_city_id === f.city || r.dest_city_id === f.city) &&
      (!f.shop || r.source_shop_id === f.shop || r.dest_shop_id === f.shop) &&
      (!f.status || r.status === f.status) &&
      has(
        [
          r.sku,
          r.product_name,
          r.source_label,
          r.dest_label,
          r.reason,
          r.requester_name,
          r.txn_no,
        ],
        f.q ?? "",
      ),
  );

export function summarizeInventory(rows: InvRow[]) {
  const health: Record<Health, number> = {
    critical: 0,
    low: 0,
    healthy: 0,
    not_configured: 0,
  };
  const category: Record<Category, number> = {
    imfl: 0,
    beer: 0,
    wine: 0,
    rtd: 0,
  };
  let units = 0,
    mrpValue = 0;
  for (const r of rows) {
    const q = n(r.quantity_on_hand);
    units += q;
    mrpValue += q * n(r.mrp);
    if (r.health && r.health in health) health[r.health as Health] += 1;
    if (r.category) category[r.category] += q;
  }
  return {
    lines: rows.length,
    units,
    mrpValue: Math.round(mrpValue * 100) / 100,
    low: health.low,
    critical: health.critical,
    health,
    category,
    configured: rows.length === 0 ? null : health.not_configured === 0,
  };
}

export function summarizeMovements(rows: MoveRow[]) {
  let inward = 0,
    issued = 0,
    net = 0;
  const trend = new Map<
    string,
    { date: string; inward: number; issued: number }
  >();
  const byType: Partial<Record<MovementType, number>> = {};
  for (const r of rows) {
    const q = n(r.quantity);
    net += n(r.delta);
    if (r.movement_type)
      byType[r.movement_type] = (byType[r.movement_type] ?? 0) + q;
    if (r.movement_type !== "receive" && r.movement_type !== "issue") continue;
    const k = r.created_at ? dateKey(r.created_at) : "unknown";
    const e = trend.get(k) ?? { date: k, inward: 0, issued: 0 };
    if (r.movement_type === "receive") {
      inward += q;
      e.inward += q;
    } else {
      issued += q;
      e.issued += q;
    }
    trend.set(k, e);
  }
  return {
    count: rows.length,
    inward,
    issued,
    net,
    byType,
    trend: [...trend.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function summarizeTransfers(rows: XferRow[]) {
  const byStatus: Record<TransferStatus, number> = {
    requested: 0,
    approved: 0,
    dispatched: 0,
    received: 0,
    rejected: 0,
    cancelled: 0,
  };
  let units = 0;
  for (const r of rows) {
    if (r.status) byStatus[r.status] += 1;
    units += n(r.quantity);
  }
  return {
    count: rows.length,
    units,
    byStatus,
    inTransit: byStatus.dispatched,
  };
}

export const paginate = <T>(rows: T[], page: number, size = 8) => {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages };
};

/** RFC 4180 CSV with UTF-8 BOM and CRLF rows. */
export function toCsv(
  header: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    "\uFEFF" +
    [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") +
    "\r\n"
  );
}

export const csvFilename = (
  type: "stock" | "movement" | "transfer",
  d: Date = new Date(),
) => `tasmac-${type}-report-${dateKey(d)}.csv`;

export interface CompositionItem<K extends string = string> {
  key: K;
  label: string;
  units: number;
  /** Share of total units in percent (0 when total is 0). */
  share: number;
  /** Units relative to the largest category, 0..1. */
  relative: number;
  rank: number;
}

/** Ranks categories by units and derives shares from the given totals only. */
export function composition<K extends string>(
  entries: { key: K; label: string; units: number }[],
): { total: number; items: CompositionItem<K>[] } {
  const total = entries.reduce((a, e) => a + Math.max(0, e.units), 0);
  const max = Math.max(0, ...entries.map((e) => e.units));
  const items = [...entries]
    .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label))
    .map((e, i) => ({
      ...e,
      share: total ? (e.units / total) * 100 : 0,
      relative: max ? e.units / max : 0,
      rank: i + 1,
    }));
  return { total, items };
}

export interface ShopUnits {
  shopId: string;
  cityId: string;
  cityName: string;
  label: string;
  units: number;
  lines: number;
  /** Units relative to the largest shop, 0..1. */
  relative: number;
  rank: number;
}

/** Aggregates the given (already RLS-scoped) inventory rows by shop, ranked by units. */
export function unitsByShop(
  rows: {
    shop_id: string | null;
    shop_number: string | null;
    shop_name: string | null;
    city_id?: string | null;
    city_name?: string | null;
    quantity_on_hand: number | null;
  }[],
): ShopUnits[] {
  const m = new Map<
    string,
    {
      shopId: string;
      cityId: string;
      cityName: string;
      label: string;
      units: number;
      lines: number;
    }
  >();
  for (const r of rows) {
    if (!r.shop_id) continue;
    const e = m.get(r.shop_id) ?? {
      shopId: r.shop_id,
      cityId: r.city_id ?? "",
      cityName: r.city_name ?? "Unassigned city",
      label: `${r.shop_number ?? ""} · ${r.shop_name ?? ""}`,
      units: 0,
      lines: 0,
    };
    e.units += Math.max(0, r.quantity_on_hand ?? 0);
    e.lines += 1;
    m.set(r.shop_id, e);
  }
  const list = [...m.values()].sort(
    (a, b) => b.units - a.units || a.label.localeCompare(b.label),
  );
  const max = Math.max(0, ...list.map((s) => s.units));
  return list.map((s, i) => ({
    ...s,
    relative: max ? s.units / max : 0,
    rank: i + 1,
  }));
}
