import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { userMessage } from "@/lib/app-error";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  PageHeading,
  SectionGuard,
  useAccess,
} from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import { StatusBadge } from "@/components/tracking/sheets";
import { TimeframePicker, fmt, fmtTime } from "@/components/analytics/bits";
import { FilterSelect, MovementTypeCell } from "@/components/stock/ops-bits";
import {
  ComparisonPanel,
  ReportPager,
  ReportSummary,
  ReportTable,
  type Slice,
} from "@/components/reports/report-kit";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  HEALTH,
  HEALTH_LABELS,
  type Category,
  type Health,
} from "@/lib/catalog";
import { MOVEMENT_LABELS, type MovementType } from "@/lib/stock";
import {
  STATUS_LABELS,
  TRANSFER_STATUSES,
  type TransferStatus,
} from "@/lib/transfers";
import { fetchCities, fetchShops } from "@/lib/master-data.queries";
import { shopsWithinAccess } from "@/lib/rbac";
import {
  TIMEFRAMES,
  csvFilename,
  filterInventory,
  filterMovements,
  filterTransfers,
  paginate,
  sinceFor,
  summarizeInventory,
  summarizeMovements,
  summarizeTransfers,
  toCsv,
  TIMEFRAME_LABELS,
  type Timeframe,
} from "@/lib/analytics";
import {
  analyticsKeys,
  fetchAllInventory,
  fetchAllMovements,
  fetchAllTransfers,
} from "@/lib/analytics.queries";
import { Button, Input, Label, Skeleton } from "@4rged-ai/platform";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  CheckCircle2,
  Download,
  IndianRupee,
  Layers,
  Package,
  Search as SearchIcon,
  Sigma,
  Truck,
  X,
} from "lucide-react";
import { ShopRadarPanel } from "@/components/reports/shop-radar";

const TABS = ["stock", "movements", "transfers"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  stock: "Stock ledger",
  movements: "Movement audit",
  transfers: "Transfers",
};
const PAGE_SIZE = 8;
// Status/type colours carry data meaning only.
const TYPE_COLORS: Record<MovementType, string> = {
  receive: "#4fb3a5",
  issue: "#8b9bb0",
  adjust_surplus: "#7fc7bc",
  adjust_writeoff: "#e06c6c",
  transfer_out: "#737373",
  transfer_in: "#a3a3a3",
};
const STATUS_COLORS: Record<TransferStatus, string> = {
  requested: "#d9a441",
  approved: "#7fc7bc",
  dispatched: "#8b9bb0",
  received: "#4fb3a5",
  rejected: "#e06c6c",
  cancelled: "#9a5a5a",
};
const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABELS) as MovementType[];

interface Search {
  tab: Tab;
  q: string;
  city: string;
  shop: string;
  kind: string;
  tf: Timeframe;
  page: number;
}
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : d;
const uuidOr = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : "";

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: (r: Record<string, unknown>): Search => {
    const raw = r as Partial<Record<keyof Search, unknown>>;
    return {
      tab: pick(raw.tab, TABS, "stock"),
      q: typeof raw.q === "string" ? raw.q.slice(0, 80) : "",
      city: uuidOr(raw.city),
      shop: uuidOr(raw.shop),
      kind: typeof raw.kind === "string" ? raw.kind.slice(0, 40) : "",
      tf: pick(raw.tf, TIMEFRAMES, "all"),
      page: Math.max(1, Math.min(10000, Math.floor(Number(raw.page)) || 1)),
    };
  },
  head: () => ({
    meta: [
      { title: "Reports · TASMAC Inventory" },
      {
        name: "description",
        content:
          "Stock valuation, movement audit and consignment transfer reports with CSV export.",
      },
      { property: "og:title", content: "Reports · TASMAC Inventory" },
      {
        property: "og:description",
        content:
          "Stock valuation, movement audit and consignment transfer reports with CSV export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="reports">
      <ReportsPage />
    </SectionGuard>
  ),
});

function download(csv: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function ReportsPage() {
  const s = Route.useSearch();
  const access = useAccess();
  const navigate = useNavigate({ from: "/reports" });
  const set = (patch: Partial<Search>, resetPage = true) =>
    navigate({
      search: (prev) => ({
        ...prev,
        ...(resetPage ? { page: 1 } : {}),
        ...patch,
      }),
      replace: true,
    });
  const [q, setQ] = useState(s.q);
  useEffect(() => setQ(s.q), [s.q]);
  useEffect(() => {
    const h = setTimeout(() => q !== s.q && set({ q }), 300);
    return () => clearTimeout(h);
  });

  const cities = useQuery({ queryKey: ["cities"], queryFn: fetchCities });
  const shops = useQuery({ queryKey: ["shops"], queryFn: fetchShops });
  const visibleShops = shopsWithinAccess(
    access.role,
    access.scopeCode,
    shops.data ?? [],
  );
  const visibleCityIds = new Set(visibleShops.map((shop) => shop.city_id));
  const visibleCities =
    access.role === "shop_manager"
      ? (cities.data ?? []).filter((city) => visibleCityIds.has(city.id))
      : (cities.data ?? []);
  const kinds: { value: string; label: string }[] =
    s.tab === "stock"
      ? [
          ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
          ...HEALTH.map((h) => ({
            value: `h:${h}`,
            label: `Health: ${HEALTH_LABELS[h]}`,
          })),
        ]
      : s.tab === "movements"
        ? MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABELS[t] }))
        : TRANSFER_STATUSES.map((t) => ({ value: t, label: STATUS_LABELS[t] }));
  const dirty = Boolean(s.q || s.city || s.shop || s.kind);
  const go = (t: Tab) => set({ tab: t, kind: "" });

  return (
    <div className="tasmac-ws tasmac-ws-reports tasmac-reports flex flex-col gap-4">
      <PageHeading
        title="Reports"
        description="Stock, movement and transfer reports for your scope, with CSV export."
      />
      <div role="tablist" aria-label="Report types" className="tasmac-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            data-tab={t}
            aria-selected={s.tab === t}
            tabIndex={s.tab === t ? 0 : -1}
            onClick={() => go(t)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i =
                TABS.indexOf(t) +
                (e.key === "ArrowRight" ? 1 : TABS.length - 1);
              const next = TABS[i % TABS.length]!;
              go(next);
              const list = e.currentTarget.parentElement;
              requestAnimationFrame(() =>
                (
                  list?.querySelector(
                    `[data-tab="${next}"]`,
                  ) as HTMLElement | null
                )?.focus(),
              );
            }}
            className="tasmac-tab"
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <form
        className="tasmac-toolbar"
        role="search"
        aria-label="Filter report"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: q.trim() });
        }}
      >
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="r-q">Search</Label>
          <Input
            id="r-q"
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            placeholder="SKU, product, shop, reference…"
          />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-44">
          <Label htmlFor="r-city">City</Label>
          <FilterSelect
            id="r-city"
            value={s.city}
            allLabel="All cities"
            options={visibleCities.map((c) => ({
              value: c.id,
              label: `${c.code} · ${c.name}`,
            }))}
            onChange={(v) => set({ city: v, shop: "" })}
          />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-56">
          <Label htmlFor="r-shop">Shop</Label>
          <FilterSelect
            id="r-shop"
            value={s.shop}
            allLabel="All shops"
            options={visibleShops
              .filter((x) => !s.city || x.city_id === s.city)
              .map((x) => ({
                value: x.id,
                label: `${x.shop_number} · ${x.name}`,
              }))}
            onChange={(v) => set({ shop: v })}
          />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-44">
          <Label htmlFor="r-kind">
            {s.tab === "stock"
              ? "Category / health"
              : s.tab === "movements"
                ? "Type"
                : "Status"}
          </Label>
          <FilterSelect
            key={s.tab}
            id="r-kind"
            value={s.kind}
            allLabel="All"
            options={kinds}
            onChange={(v) => set({ kind: v })}
          />
        </div>
        {s.tab !== "stock" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Period
            </span>
            <TimeframePicker value={s.tf} onChange={(tf) => set({ tf })} />
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            size="lg"
            type="submit"
            variant="outline"
            className="tasmac-btn tasmac-btn-toolbar"
          >
            <SearchIcon aria-hidden />
            Search
          </Button>
          {dirty ? (
            <Button
              size="sm"
              type="button"
              variant="ghost"
              className="tasmac-btn tasmac-btn-quiet"
              onClick={() => {
                setQ("");
                set({ q: "", city: "", shop: "", kind: "" });
              }}
            >
              <X aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </div>
      </form>
      <p className="tasmac-report-ledger" aria-label="Report context">
        <span>{TAB_LABELS[s.tab]}</span>
        <span>
          Scope:{" "}
          {s.shop
            ? (shops.data?.find((x) => x.id === s.shop)?.shop_number ??
              "Selected shop")
            : s.city
              ? (cities.data?.find((c) => c.id === s.city)?.name ??
                "Selected city")
              : "All authorized shops"}
        </span>
        <span>
          Period:{" "}
          {s.tab === "stock" ? "Current balance" : TIMEFRAME_LABELS[s.tf]}
        </span>
        {s.kind ? (
          <span>
            Filter: {kinds.find((k) => k.value === s.kind)?.label ?? s.kind}
          </span>
        ) : null}
        {s.q ? <span>Search: “{s.q}”</span> : null}
      </p>
      {s.tab === "stock" ? (
        <StockTab s={s} set={set} />
      ) : s.tab === "movements" ? (
        <MovementTab s={s} set={set} />
      ) : (
        <TransferTab s={s} set={set} />
      )}
    </div>
  );
}

type TabProps = {
  s: Search;
  set: (p: Partial<Search>, resetPage?: boolean) => void;
};

function Frame({
  loading,
  error,
  capped,
  children,
}: {
  loading: boolean;
  error: Error | null;
  capped?: boolean | undefined;
  children: ReactNode;
}) {
  if (error)
    return (
      <StatePanel
        tone="error"
        title="Report unavailable"
        description={userMessage(error)}
      />
    );
  if (loading)
    return (
      <div
        className="flex flex-col gap-4"
        aria-busy="true"
        aria-label="Loading report"
      >
        <Skeleton className="h-[78px] w-full" />
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return (
    <>
      {capped ? (
        <StatePanel
          tone="error"
          title="Result limit reached"
          description="More rows exist than this report aggregates; narrow the filters or timeframe."
        />
      ) : null}
      {children}
    </>
  );
}

const NoRows = () => (
  <StatePanel
    title="No matching rows"
    description="No records in your scope match the current filters."
  />
);

function ExportBtn({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      variant="outline"
      className="tasmac-btn tasmac-btn-retry"
      onClick={onClick}
      disabled={disabled}
    >
      <Download aria-hidden />
      Export CSV
    </Button>
  );
}

function HealthTag({ health }: { health: string | null }) {
  const h = (HEALTH as readonly string[]).includes(health ?? "")
    ? (health as Health)
    : "not_configured";
  return (
    <span className="tasmac-health" data-health={h}>
      <span className="tasmac-health-dot" aria-hidden />
      {HEALTH_LABELS[h]}
    </span>
  );
}

function StockTab({ s, set }: TabProps) {
  const inv = useQuery({
    queryKey: analyticsKeys.inventory,
    queryFn: fetchAllInventory,
  });
  const filtered = useMemo(
    () =>
      filterInventory(inv.data?.rows ?? [], {
        q: s.q,
        city: s.city,
        shop: s.shop,
        category: (CATEGORIES as readonly string[]).includes(s.kind)
          ? (s.kind as Category)
          : "",
        health: s.kind.startsWith("h:") ? (s.kind.slice(2) as Health) : "",
      }),
    [inv.data, s.q, s.city, s.shop, s.kind],
  );
  const sum = summarizeInventory(filtered);
  const pg = paginate(filtered, s.page, PAGE_SIZE);
  const head = [
    "SKU",
    "Description",
    "Category",
    "Shop",
    "Units",
    "Safety threshold",
    "Health",
    "Last audit",
  ];
  const exportCsv = () =>
    download(
      toCsv(
        [...head, "MRP value (INR)"],
        filtered.map((r) => [
          r.sku,
          r.product_name,
          r.category ? CATEGORY_LABELS[r.category] : "",
          `${r.shop_number} ${r.shop_name}`,
          r.quantity_on_hand,
          r.safety_minimum,
          r.health ? HEALTH_LABELS[r.health as Health] : "",
          r.last_audit_at ?? "",
          ((r.quantity_on_hand ?? 0) * (r.mrp ?? 0)).toFixed(2),
        ]),
      ),
      csvFilename("stock"),
    );
  return (
    <Frame loading={inv.isPending} error={inv.error} capped={inv.data?.capped}>
      <ReportSummary
        label="Stock summary"
        items={[
          { label: "Units on hand", value: fmt(sum.units), icon: <Package /> },
          {
            label: "Shop-product lines",
            value: fmt(sum.lines),
            icon: <Layers />,
          },
          {
            label: "MRP valuation",
            icon: <IndianRupee />,
            value: `₹${sum.mrpValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            hint: "Units × stored MRP; not a cost or excise valuation",
          },
          sum.configured === false
            ? {
                label: "Threshold alerts",
                value: "Not configured",
                icon: <AlertTriangle />,
              }
            : {
                label: "Critical · Low",
                icon: <AlertTriangle />,
                value: `${fmt(sum.critical)} · ${fmt(sum.low)}`,
                tone:
                  sum.critical > 0
                    ? "critical"
                    : sum.low > 0
                      ? "low"
                      : undefined,
              },
        ]}
      />
      <ShopRadarPanel rows={filtered} />
      <ReportTable
        title="Stock ledger"
        count={filtered.length}
        head={head}
        numeric={["Units", "Safety threshold"]}
        centered={[
          "SKU",
          "Category",
          "Units",
          "Safety threshold",
          "Health",
          "Last audit",
        ]}
        action={<ExportBtn onClick={exportCsv} disabled={!filtered.length} />}
        empty={<NoRows />}
        footer={
          <ReportPager
            page={pg.page}
            pages={pg.pages}
            size={PAGE_SIZE}
            total={filtered.length}
            onPage={(p) => set({ page: p }, false)}
          />
        }
      >
        {pg.rows.map((r) => (
          <tr key={r.id}>
            <td className="text-center font-mono text-xs">{r.sku}</td>
            <td className="whitespace-nowrap font-medium text-foreground">
              {r.product_name}
            </td>
            <td className="text-center whitespace-nowrap">
              {r.category ? CATEGORY_LABELS[r.category] : "—"}
            </td>
            <td className="whitespace-nowrap">
              <span className="font-mono text-xs">{r.shop_number}</span> ·{" "}
              {r.shop_name}
            </td>
            <td className="text-center font-medium">
              {fmt(r.quantity_on_hand ?? 0)}
            </td>
            <td className="text-center">{fmt(r.safety_minimum ?? 0)}</td>
            <td className="text-center">
              <HealthTag health={r.health} />
            </td>
            <td className="text-center whitespace-nowrap font-medium text-muted-foreground">
              {r.last_audit_at ? fmtTime(r.last_audit_at) : "Never adjusted"}
            </td>
          </tr>
        ))}
      </ReportTable>
    </Frame>
  );
}

function MovementTab({ s, set }: TabProps) {
  const mov = useQuery({
    queryKey: analyticsKeys.movements(s.tf),
    queryFn: () => fetchAllMovements(sinceFor(s.tf)),
  });
  const filtered = useMemo(
    () =>
      filterMovements(mov.data?.rows ?? [], {
        q: s.q,
        city: s.city,
        shop: s.shop,
        type: (MOVEMENT_TYPES as string[]).includes(s.kind)
          ? (s.kind as MovementType)
          : "",
      }),
    [mov.data, s.q, s.city, s.shop, s.kind],
  );
  const sum = summarizeMovements(filtered);
  const pg = paginate(filtered, s.page, PAGE_SIZE);
  const head = [
    "Transaction",
    "Time",
    "Shop",
    "Type",
    "SKU",
    "Signed quantity",
    "Balance impact",
    "Reference",
    "Actor",
  ];
  const exportCsv = () =>
    download(
      toCsv(
        head,
        filtered.map((r) => [
          r.txn_no,
          r.created_at,
          `${r.shop_number} ${r.shop_name}`,
          r.movement_type ? MOVEMENT_LABELS[r.movement_type] : "",
          r.sku,
          r.delta,
          `${r.balance_before} -> ${r.balance_after}`,
          r.reference,
          r.actor_name,
        ]),
      ),
      csvFilename("movement"),
    );
  const slices: Slice[] = MOVEMENT_TYPES.map((t) => ({
    key: t,
    label: MOVEMENT_LABELS[t],
    value: sum.byType[t] ?? 0,
    color: TYPE_COLORS[t],
  }));
  return (
    <Frame loading={mov.isPending} error={mov.error} capped={mov.data?.capped}>
      <ReportSummary
        label="Movement summary"
        items={[
          {
            label: "Transactions",
            value: fmt(sum.count),
            icon: <ArrowLeftRight />,
          },
          {
            label: "Inward units",
            value: fmt(sum.inward),
            hint: "Receipts",
            icon: <ArrowDownToLine />,
          },
          {
            label: "Issued units",
            value: fmt(sum.issued),
            hint: "Counter issues",
            icon: <ArrowUpFromLine />,
          },
          {
            label: "Net balance change",
            icon: <Sigma />,
            value: `${sum.net > 0 ? "+" : ""}${fmt(sum.net)}`,
            hint: "Sum of signed quantities, all types",
          },
        ]}
      />
      <ComparisonPanel
        title="Units by movement type"
        unit="units"
        slices={slices}
        emptyText="No movements match the current filters."
      />
      <ReportTable
        title="Movement audit"
        count={filtered.length}
        head={head}
        numeric={["Signed quantity", "Balance impact"]}
        centered={[
          "Transaction",
          "Time",
          "Type",
          "SKU",
          "Signed quantity",
          "Balance impact",
          "Actor",
        ]}
        tableClassName="tasmac-movement-table"
        action={<ExportBtn onClick={exportCsv} disabled={!filtered.length} />}
        empty={<NoRows />}
        footer={
          <ReportPager
            page={pg.page}
            pages={pg.pages}
            size={PAGE_SIZE}
            total={filtered.length}
            onPage={(p) => set({ page: p }, false)}
          />
        }
      >
        {pg.rows.map((r) => (
          <tr key={r.id}>
            <td className="text-center font-mono text-xs">#{r.txn_no}</td>
            <td className="text-center whitespace-nowrap font-medium text-muted-foreground">
              {fmtTime(r.created_at)}
            </td>
            <td className="whitespace-nowrap">
              <span className="font-mono text-xs">{r.shop_number}</span> ·{" "}
              {r.shop_name}
            </td>
            <td className="text-center whitespace-nowrap">
              <MovementTypeCell type={r.movement_type} />
            </td>
            <td className="text-center font-mono text-xs">{r.sku}</td>
            <td
              className={`text-center font-medium ${(r.delta ?? 0) < 0 ? "text-destructive" : "text-success"}`}
            >
              {(r.delta ?? 0) > 0 ? "+" : ""}
              {fmt(r.delta ?? 0)}
            </td>
            <td className="text-center">
              {fmt(r.balance_before ?? 0)} → {fmt(r.balance_after ?? 0)}
            </td>
            <td className="max-w-56 truncate" title={r.reference ?? ""}>
              {r.reference}
            </td>
            <td className="text-center whitespace-nowrap">{r.actor_name ?? "—"}</td>
          </tr>
        ))}
      </ReportTable>
    </Frame>
  );
}

function TransferTab({ s, set }: TabProps) {
  const xf = useQuery({
    queryKey: analyticsKeys.transfers(s.tf),
    queryFn: () => fetchAllTransfers(sinceFor(s.tf)),
  });
  const filtered = useMemo(
    () =>
      filterTransfers(xf.data?.rows ?? [], {
        q: s.q,
        city: s.city,
        shop: s.shop,
        status: (TRANSFER_STATUSES as readonly string[]).includes(s.kind)
          ? (s.kind as TransferStatus)
          : "",
      }),
    [xf.data, s.q, s.city, s.shop, s.kind],
  );
  const sum = summarizeTransfers(filtered);
  const pg = paginate(filtered, s.page, PAGE_SIZE);
  const head = [
    "Transfer",
    "Requested",
    "Source",
    "Destination",
    "SKU",
    "Quantity",
    "Status",
    "Requester",
    "Purpose",
  ];
  const exportCsv = () =>
    download(
      toCsv(
        head,
        filtered.map((r) => [
          r.txn_no,
          r.requested_at,
          r.source_label,
          r.dest_label,
          r.sku,
          r.quantity,
          r.status ? STATUS_LABELS[r.status] : "",
          r.requester_name,
          r.reason,
        ]),
      ),
      csvFilename("transfer"),
    );
  const slices: Slice[] = TRANSFER_STATUSES.map((t) => ({
    key: t,
    label: STATUS_LABELS[t],
    value: sum.byStatus[t],
    color: STATUS_COLORS[t],
  }));
  return (
    <Frame loading={xf.isPending} error={xf.error} capped={xf.data?.capped}>
      <ReportSummary
        label="Transfer summary"
        items={[
          {
            label: "Transfers",
            value: fmt(sum.count),
            icon: <ArrowLeftRight />,
          },
          {
            label: "Units requested",
            value: fmt(sum.units),
            icon: <Package />,
          },
          {
            label: "In transit",
            value: fmt(sum.inTransit),
            hint: "Dispatched, awaiting receipt",
            icon: <Truck />,
          },
          {
            label: "Received",
            value: fmt(sum.byStatus.received),
            hint: "Completed transfers",
            icon: <CheckCircle2 />,
          },
        ]}
      />
      <ComparisonPanel
        title="Transfers by status"
        unit="transfers"
        slices={slices}
        emptyText="No transfers match the current filters."
      />
      <ReportTable
        title="Consignment transfers"
        count={filtered.length}
        head={head}
        numeric={["Quantity"]}
        centered={[
          "Transfer",
          "Requested",
          "SKU",
          "Quantity",
          "Status",
          "Requester",
        ]}
        action={<ExportBtn onClick={exportCsv} disabled={!filtered.length} />}
        empty={<NoRows />}
        footer={
          <ReportPager
            page={pg.page}
            pages={pg.pages}
            size={PAGE_SIZE}
            total={filtered.length}
            onPage={(p) => set({ page: p }, false)}
          />
        }
      >
        {pg.rows.map((r) => (
          <tr key={r.id}>
            <td className="text-center font-mono text-xs">#{r.txn_no}</td>
            <td className="text-center whitespace-nowrap font-medium text-muted-foreground">
              {fmtTime(r.requested_at)}
            </td>
            <td className="whitespace-nowrap">{r.source_label}</td>
            <td className="whitespace-nowrap">{r.dest_label}</td>
            <td className="text-center font-mono text-xs">{r.sku}</td>
            <td className="text-center font-medium">{fmt(r.quantity ?? 0)}</td>
            <td className="text-center">
              {r.status ? <StatusBadge status={r.status} /> : "—"}
            </td>
            <td className="text-center whitespace-nowrap">
              {r.requester_name ?? "—"}
            </td>
            <td className="max-w-64 truncate" title={r.reason ?? ""}>
              {r.reason}
            </td>
          </tr>
        ))}
      </ReportTable>
    </Frame>
  );
}
