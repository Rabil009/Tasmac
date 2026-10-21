import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { userMessage } from "@/lib/app-error";
import { useQuery } from "@tanstack/react-query";
import {
  InventoryByShop,
  DASH_COLORS,
  InventoryDistribution,
  OperationalAttention,
  StockFlowBalance,
} from "@/components/dashboard/dashboard-analytics";
import { SectionGuard, useAccess } from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import {
  Empty,
  TimeframePicker,
  fmt,
  fmtTime,
} from "@/components/analytics/bits";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/catalog";
import { MOVEMENT_LABELS } from "@/lib/stock";
import { canReadStatewide, ROLE_LABELS } from "@/lib/rbac";
import {
  TIMEFRAMES,
  TIMEFRAME_LABELS,
  sinceFor,
  summarizeInventory,
  summarizeMovements,
  summarizeTransfers,
  unitsByShop,
  type Timeframe,
} from "@/lib/analytics";
import {
  analyticsKeys,
  fetchAllInventory,
  fetchAllMovements,
  fetchAllTransfers,
} from "@/lib/analytics.queries";
import { Badge, Button, Card, Skeleton } from "@4rged-ai/platform";
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Package,
  TriangleAlert,
  Truck,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (raw: Record<string, unknown>): { tf?: Timeframe } => {
    const v = raw["tf"];
    return typeof v === "string" &&
      v !== "all" &&
      (TIMEFRAMES as readonly string[]).includes(v)
      ? { tf: v as Timeframe }
      : {};
  },
  head: () => ({
    meta: [
      { title: "Dashboard · TASMAC Inventory" },
      {
        name: "description",
        content:
          "Stock position, alerts, throughput and transfers within your authorized scope.",
      },
      { property: "og:title", content: "Dashboard · TASMAC Inventory" },
      {
        property: "og:description",
        content:
          "Stock position, alerts, throughput and transfers within your authorized scope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="dashboard">
      <DashboardPage />
    </SectionGuard>
  ),
});

const TRACKING_BASE = {
  q: "",
  city: "",
  shop: "",
  status: "" as const,
  type: "" as const,
  page: 1,
  open: "",
};
const INVENTORY_BASE = {
  tab: "inventory" as const,
  q: "",
  category: "" as const,
  sort: "name" as const,
  dir: "asc" as const,
  page: 1,
};

function indiaDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function activityToday(rows: Awaited<ReturnType<typeof fetchAllMovements>>["rows"]) {
  const today = indiaDateKey(new Date().toISOString());
  const activity = rows.filter(
    (row) => row.created_at && indiaDateKey(row.created_at) === today,
  );
  const latest = activity[0] ?? null;
  return {
    todayTransactions: activity.length,
    receipts: activity.filter((row) => row.movement_type === "receive").length,
    issues: activity.filter((row) => row.movement_type === "issue").length,
    latestAt: latest?.created_at ?? null,
    latestLabel: latest?.movement_type
      ? MOVEMENT_LABELS[latest.movement_type]
      : null,
  };
}

function DashboardPage() {
  const tf: Timeframe = Route.useSearch().tf ?? "all";
  const navigate = useNavigate({ from: "/dashboard" });
  const access = useAccess();
  const inv = useQuery({
    queryKey: analyticsKeys.inventory,
    queryFn: fetchAllInventory,
  });
  const mov = useQuery({
    queryKey: analyticsKeys.movements(tf),
    queryFn: () => fetchAllMovements(sinceFor(tf)),
  });
  const xfer = useQuery({
    queryKey: analyticsKeys.transfers("all"),
    queryFn: () => fetchAllTransfers(null),
  });

  const scope = canReadStatewide(access.role)
    ? "Statewide"
    : access.role === "shop_manager"
      ? `Assigned shop ${access.scopeCode ?? ""}`
      : `City ${access.scopeCode ?? ""}`;
  const err = inv.error ?? mov.error ?? xfer.error;
  const loading = inv.isPending || mov.isPending || xfer.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[28px] leading-8 font-bold tracking-[-0.015em] text-foreground">
          Dashboard
        </h1>
        <p className="text-sm leading-5 text-muted-foreground">
          Stock position, alerts, throughput and transfers within your
          authorized scope.
        </p>
      </div>
      <div
        className="flex h-12 items-center justify-between gap-3 rounded-[10px] border border-border bg-card pl-4 pr-1"
        role="status"
      >
        <span className="flex min-w-0 items-center gap-2 text-[13px] leading-[18px] font-medium">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
          />
          <span className="font-semibold text-foreground">
            {access.role ? ROLE_LABELS[access.role] : "No role"}
          </span>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span className="truncate text-muted-foreground">{scope.trim()}</span>
        </span>
        <TimeframePicker
          value={tf}
          onChange={(t) =>
            navigate({ search: t === "all" ? {} : { tf: t }, replace: true })
          }
        />
      </div>
      {err ? (
        <StatePanel
          tone="error"
          title="Dashboard unavailable"
          description={userMessage(err)}
        />
      ) : loading ? (
        <div
          className="flex flex-col gap-6"
          aria-busy="true"
          aria-label="Loading dashboard"
        >
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[124px] rounded-[10px]" />
            ))}
          </div>
          <div className="grid grid-cols-12 gap-4">
            <Skeleton className="col-span-12 h-[320px] rounded-[10px] min-[1200px]:col-span-7" />
            <Skeleton className="col-span-12 h-[320px] rounded-[10px] min-[1200px]:col-span-5" />
            <Skeleton className="col-span-12 h-[352px] rounded-[10px] min-[1200px]:col-span-7" />
            <Skeleton className="col-span-12 h-[352px] rounded-[10px] min-[1200px]:col-span-5" />
          </div>
          <Skeleton className="h-[340px] rounded-[10px]" />
        </div>
      ) : (
        <Body
          tf={tf}
          inv={inv.data!}
          mov={mov.data!}
          xfer={xfer.data!}
          shopScoped={!canReadStatewide(access.role)}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  icon: Icon,
  children,
  foot,
}: {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      className="tasmac-dashboard-kpi flex h-[126px] min-w-0 flex-col gap-0 rounded-[10px] border-border bg-card p-5 shadow-none"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="tasmac-metric-label truncate text-muted-foreground">
          {label}
        </p>
        <Icon
          aria-hidden
          data-kpi-icon
          strokeWidth={1.75}
          className="size-5 shrink-0 text-muted-foreground"
        />
      </div>
      <div className="mt-1.5 min-w-0 flex-1">{children}</div>
      {foot ? (
        <div className="truncate text-xs leading-[18px] text-muted-foreground">
          {foot}
        </div>
      ) : null}
    </Card>
  );
}

function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      variant="outlined"
      className={`flex flex-col gap-0 rounded-[10px] border-border bg-card py-0 shadow-none ${className}`}
    >
      <section aria-label={title} className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-5">
          <h2 className="text-base leading-[22px] font-semibold text-foreground">
            {title}
          </h2>
          {action}
        </header>
        <div className="flex-1 p-5">{children}</div>
      </section>
    </Card>
  );
}

function Body({
  tf,
  inv,
  mov,
  xfer,
  shopScoped,
}: {
  tf: Timeframe;
  inv: Awaited<ReturnType<typeof fetchAllInventory>>;
  mov: Awaited<ReturnType<typeof fetchAllMovements>>;
  xfer: Awaited<ReturnType<typeof fetchAllTransfers>>;
  shopScoped: boolean;
}) {
  const i = summarizeInventory(inv.rows);
  const m = summarizeMovements(mov.rows);
  const t = summarizeTransfers(xfer.rows);
  const capped = inv.capped || mov.capped || xfer.capped;
  const recent = mov.rows.slice(0, 6);
  const period = TIMEFRAME_LABELS[tf];
  const unconfigured = i.configured === false;
  const net = m.inward - m.issued;
  const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;

  const attention: {
    count: number;
    label: string;
    desc: string;
    to: ReactNode;
    tone?: "critical" | "low";
  }[] = [
    ...(unconfigured
      ? []
      : [
          {
            count: i.critical,
            tone: "critical" as const,
            label: "Critical stock lines",
            desc: "At or below the critical threshold",
            to: (
              <Link
                to="/inventory"
                search={{ ...INVENTORY_BASE, health: "critical" }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Inventory
              </Link>
            ),
          },
          {
            count: i.low,
            tone: "low" as const,
            label: "Low stock lines",
            desc: "Below the low-stock threshold",
            to: (
              <Link
                to="/inventory"
                search={{ ...INVENTORY_BASE, health: "low" }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Inventory
              </Link>
            ),
          },
        ]),
    {
      count: t.inTransit,
      label: "Transfers in transit",
      desc: "Dispatched, awaiting receipt",
      to: (
        <Link
          to="/tracking"
          search={{ ...TRACKING_BASE, tab: "transfers", status: "dispatched" }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Tracking
        </Link>
      ),
    },
  ];

  return (
    <>
      {capped ? (
        <StatePanel
          tone="error"
          title="Result limit reached"
          description="More rows exist than the dashboard aggregates; figures are incomplete. Narrow the timeframe."
        />
      ) : null}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi
          icon={Package}
          label="On-hand inventory"
          foot={`${fmt(i.lines)} shop-product lines · current`}
        >
          <p className="text-[30px] leading-[34px] font-bold tabular-nums text-foreground">
            {fmt(i.units)}{" "}
            <span className="text-sm leading-5 font-medium text-muted-foreground">
              units
            </span>
          </p>
        </Kpi>
        <Kpi
          icon={TriangleAlert}
          label="Attention required"
          foot={unconfigured ? "Set thresholds in Management → Settings" : null}
        >
          {unconfigured ? (
            <p className="text-base font-semibold text-muted-foreground">
              Thresholds not configured
            </p>
          ) : (
            <>
              <p
                className="text-[30px] leading-[34px] font-bold tabular-nums text-foreground"
                style={
                  i.critical > 0 ? { color: DASH_COLORS.negative } : undefined
                }
              >
                {fmt(i.critical + i.low)}
              </p>
              <div className="mt-1 flex gap-2">
                <Badge variant="outline" size="sm" className="tabular-nums">
                  {fmt(i.critical)} critical
                </Badge>
                <Badge variant="outline" size="sm" className="tabular-nums">
                  {fmt(i.low)} low
                </Badge>
              </div>
            </>
          )}
        </Kpi>
        <Kpi icon={ArrowLeftRight} label="Stock flow" foot={period}>
          <dl className="grid grid-cols-3 gap-2">
            {[
              ["Inward", fmt(m.inward), "text-foreground"],
              ["Issued", fmt(m.issued), "text-foreground"],
              ["Net", signed(net), "text-foreground"],
            ].map(([l, v, c]) => (
              <div key={l} className="min-w-0">
                <dt className="text-[11px] leading-4 text-muted-foreground">
                  {l}
                </dt>
                <dd
                  className={`text-xl leading-7 font-semibold tabular-nums ${c}`}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </Kpi>
        <Kpi
          icon={Truck}
          label="In transit"
          foot="Dispatched and awaiting receipt · current"
        >
          <p className="text-[30px] leading-[34px] font-bold tabular-nums text-foreground">
            {fmt(t.inTransit)}{" "}
            <span className="text-sm leading-5 font-medium text-muted-foreground">
              {t.inTransit === 1 ? "transfer" : "transfers"}
            </span>
          </p>
        </Kpi>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 h-[320px] min-w-0 min-[1200px]:col-span-7 [&>*]:h-full">
          <InventoryDistribution
            entries={CATEGORIES.map((c) => ({
              key: c,
              label: CATEGORY_LABELS[c],
              units: i.category[c],
            }))}
          />
        </div>
        <div className="col-span-12 h-[320px] min-w-0 min-[1200px]:col-span-5 [&>*]:h-full">
          <StockFlowBalance
            inward={m.inward}
            issued={m.issued}
            period={period}
          />
        </div>
        <div className="col-span-12 h-[352px] min-w-0 min-[1200px]:col-span-7 [&>*]:h-full">
          <InventoryByShop
            shops={unitsByShop(inv.rows)}
            scopedToOneShop={shopScoped}
            shopActivity={activityToday(mov.rows)}
          />
        </div>
        <div className="col-span-12 h-[352px] min-w-0 min-[1200px]:col-span-5 [&>*]:h-full">
          <OperationalAttention
            rows={attention}
            health={i.health}
            guidance={
              unconfigured ? (
                <p className="mb-3 rounded-[8px] border border-border px-3 py-2.5 text-sm text-muted-foreground">
                  Stock thresholds are not configured. Set them in Management →
                  Settings to flag critical and low lines.
                </p>
              ) : null
            }
          />
        </div>
      </div>

      <Section
        title="Recent stock transactions"
        action={
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="tasmac-btn tasmac-btn-panel"
          >
            <Link
              to="/tracking"
              search={{ ...TRACKING_BASE, tab: "movements" }}
            >
              View all transactions
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      >
        {recent.length === 0 ? (
          <Empty>No stock transactions recorded in this period.</Empty>
        ) : (
          <div className="relative -mx-5 -my-5 overflow-x-auto">
            <table className="tasmac-dash-table min-w-[1120px] table-fixed">
              <colgroup>
                <col className="w-[7%]" />
                <col className="w-[16%]" />
                <col className="w-[11%]" />
                <col className="w-[25%]" />
                <col className="w-[21%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="text-left">
                <tr className="[&_th]:px-4">
                  <th scope="col" className="text-center">Txn</th>
                  <th scope="col" className="text-center">Date &amp; time</th>
                  <th scope="col" className="text-center">Type</th>
                  <th scope="col" className="text-center">Shop</th>
                  <th scope="col" className="text-center">SKU</th>
                  <th scope="col" className="text-center">
                    Qty
                  </th>
                  <th scope="col" className="text-center">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const d = r.delta ?? 0;
                  return (
                    <tr
                      key={r.id}
                      className="h-12 border-t border-border [&_td]:px-4"
                    >
                      <td className="text-center whitespace-nowrap tabular-nums text-muted-foreground">
                        #{r.txn_no}
                      </td>
                      <td className="text-center whitespace-nowrap tabular-nums">
                        {fmtTime(r.created_at)}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        {r.movement_type
                          ? MOVEMENT_LABELS[r.movement_type]
                          : "—"}
                      </td>
                      <td
                        className="text-center truncate"
                        title={`${r.shop_number} · ${r.shop_name}`}
                      >
                        {r.shop_number} · {r.shop_name}
                      </td>
                      <td
                        className="text-center truncate font-mono text-xs"
                        title={r.sku ?? ""}
                      >
                        {r.sku}
                      </td>
                      <td
                        className={`text-center whitespace-nowrap text-sm font-semibold tabular-nums ${d > 0 ? "text-primary" : "text-foreground"}`}
                      >
                        {signed(d)}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="tasmac-btn tasmac-btn-row"
                        >
                          <Link
                            to="/tracking"
                            search={{
                              ...TRACKING_BASE,
                              tab: "movements",
                              open: r.id ?? "",
                            }}
                          >
                            Open
                            <ArrowUpRight aria-hidden />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
