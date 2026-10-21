import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { fmtTime } from "@/lib/ops-format";
import { userMessage } from "@/lib/app-error";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  PageHeading,
  SectionGuard,
  useAccess,
} from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Search as SearchIcon,
  X,
} from "lucide-react";
import {
  FilterSelect,
  MovementTypeCell,
  RetryButton,
} from "@/components/stock/ops-bits";
import {
  MovementSheet,
  StatusBadge,
  TransferSheet,
} from "@/components/tracking/sheets";
import { PAGE_SIZE } from "@/lib/catalog";
import { fetchCities, fetchShops } from "@/lib/master-data.queries";
import { shopsWithinAccess } from "@/lib/rbac";
import { MOVEMENT_LABELS, type MovementType } from "@/lib/stock";
import {
  STATUS_LABELS,
  TRANSFER_STATUSES,
  type TransferStatus,
} from "@/lib/transfers";
import { fetchMovements, fetchTransfers } from "@/lib/transfers.queries";
import { Button, Input, Label, Skeleton } from "@4rged-ai/platform";

const TABS = ["transfers", "movements"] as const;
const MOVEMENT_TYPES = Object.keys(MOVEMENT_LABELS) as MovementType[];

interface Search {
  tab: (typeof TABS)[number];
  q: string;
  city: string;
  shop: string;
  status: TransferStatus | "";
  type: MovementType | "";
  page: number;
  open: string;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : d;
const uuidOr = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : "";

export const Route = createFileRoute("/_authenticated/tracking")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const s = raw as Partial<Record<keyof Search, unknown>>;
    return {
      tab: pick(s.tab, TABS, "transfers"),
      q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
      city: uuidOr(s.city),
      shop: uuidOr(s.shop),
      status: pick(s.status, ["", ...TRANSFER_STATUSES] as const, ""),
      type: pick(s.type, ["", ...MOVEMENT_TYPES] as const, ""),
      page: Math.max(1, Math.min(10000, Math.floor(Number(s.page)) || 1)),
      open: uuidOr(s.open),
    };
  },
  head: () => ({
    meta: [
      { title: "Tracking · TASMAC Inventory" },
      {
        name: "description",
        content:
          "Transfer progression and stock movement history within your scope.",
      },
      { property: "og:title", content: "Tracking · TASMAC Inventory" },
      {
        property: "og:description",
        content:
          "Transfer progression and stock movement history within your scope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="tracking">
      <TrackingPage />
    </SectionGuard>
  ),
});

function useSet() {
  const navigate = useNavigate({ from: "/tracking" });
  return (patch: Partial<Search>, resetPage = true) =>
    navigate({
      search: (prev) => ({
        ...prev,
        ...(resetPage ? { page: 1 } : {}),
        ...patch,
      }),
      replace: true,
    });
}

function TrackingPage() {
  const s = Route.useSearch();
  const set = useSet();
  const [transferId, setTransferId] = useState<string | null>(
    s.tab === "transfers" && s.open ? s.open : null,
  );
  const [movementId, setMovementId] = useState<string | null>(
    s.tab === "movements" && s.open ? s.open : null,
  );
  const tabLabel = (t: (typeof TABS)[number]) =>
    t === "transfers" ? "Transfers" : "Movement history";
  const go = (t: (typeof TABS)[number]) =>
    set({ tab: t, q: "", status: "", type: "" });
  return (
    <div className="tasmac-ws tasmac-ws-tracking flex flex-col gap-4">
      <PageHeading
        title="Tracking"
        description="Transfer progression and stock movement history within your scope."
      />
      <div role="tablist" aria-label="Tracking views" className="tasmac-tabs">
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
              const next = TABS[(TABS.indexOf(t) + 1) % TABS.length]!;
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
            {tabLabel(t)}
          </button>
        ))}
      </div>
      <Filters key={s.tab} />
      {s.tab === "transfers" ? (
        <TransfersTable onOpen={setTransferId} />
      ) : (
        <MovementsTable onOpen={setMovementId} />
      )}
      <TransferSheet id={transferId} onClose={() => setTransferId(null)} />
      <MovementSheet id={movementId} onClose={() => setMovementId(null)} />
    </div>
  );
}

function Filters() {
  const s = Route.useSearch();
  const set = useSet();
  const access = useAccess();
  const cities = useQuery({ queryKey: ["cities"], queryFn: fetchCities });
  const shops = useQuery({ queryKey: ["shops"], queryFn: fetchShops });
  const [q, setQ] = useState(s.q);
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
  const shopOpts = visibleShops.filter(
    (x) => !s.city || x.city_id === s.city,
  );
  const dirty = filtered(s);
  return (
    <form
      className="tasmac-toolbar"
      role="search"
      aria-label="Filter records"
      onSubmit={(e) => {
        e.preventDefault();
        set({ q: q.trim() });
      }}
    >
      <div className="flex min-w-60 flex-1 flex-col gap-1.5">
        <Label htmlFor="tk-q">Search</Label>
        <Input
          id="tk-q"
          value={q}
          maxLength={80}
          placeholder={
            s.tab === "transfers"
              ? "Product, SKU, shop or waybill"
              : "Product, SKU, shop or reference"
          }
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="flex w-full flex-col gap-1.5 sm:w-40">
        <Label htmlFor="tk-city">City</Label>
        <FilterSelect
          id="tk-city"
          value={s.city}
          allLabel="All cities"
          options={visibleCities.map((c) => ({
            value: c.id,
            label: c.name,
          }))}
          onChange={(v) => set({ city: v, shop: "" })}
        />
      </div>
      <div className="flex w-full flex-col gap-1.5 sm:w-44">
        <Label htmlFor="tk-shop">Shop</Label>
        <FilterSelect
          id="tk-shop"
          value={s.shop}
          allLabel="All shops"
          options={shopOpts.map((x) => ({
            value: x.id,
            label: `${x.shop_number} · ${x.name}`,
          }))}
          onChange={(v) => set({ shop: v })}
        />
      </div>
      {s.tab === "transfers" ? (
        <div className="flex w-full flex-col gap-1.5 sm:w-40">
          <Label htmlFor="tk-status">Status</Label>
          <FilterSelect
            id="tk-status"
            value={s.status}
            allLabel="All statuses"
            options={TRANSFER_STATUSES.map((x) => ({
              value: x,
              label: STATUS_LABELS[x],
            }))}
            onChange={(v) => set({ status: v as TransferStatus | "" })}
          />
        </div>
      ) : (
        <div className="flex w-full flex-col gap-1.5 sm:w-40">
          <Label htmlFor="tk-type">Type</Label>
          <FilterSelect
            id="tk-type"
            value={s.type}
            allLabel="All types"
            options={MOVEMENT_TYPES.map((x) => ({
              value: x,
              label: MOVEMENT_LABELS[x],
            }))}
            onChange={(v) => set({ type: v as MovementType | "" })}
          />
        </div>
      )}
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
              set({ q: "", city: "", shop: "", status: "", type: "" });
            }}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </div>
    </form>
  );
}

const filtered = (s: Search) =>
  Boolean(s.q || s.city || s.shop || s.status || s.type);

function ViewBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="tasmac-btn tasmac-btn-row"
      aria-label={label}
      onClick={onClick}
    >
      <Eye aria-hidden />
      View
    </Button>
  );
}

function TransfersTable({ onOpen }: { onOpen: (id: string) => void }) {
  const s = Route.useSearch();
  const f = {
    q: s.q,
    city: s.city,
    shop: s.shop,
    status: s.status,
    page: s.page,
  };
  const q = useQuery({
    queryKey: ["transfers", "list", f],
    queryFn: () => fetchTransfers(f),
    placeholderData: keepPreviousData,
  });
  if (q.isError)
    return (
      <StatePanel
        tone="error"
        title="Transfers unavailable"
        description={userMessage(q.error)}
        action={<RetryButton onClick={() => q.refetch()} />}
      />
    );
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.data.total === 0)
    return (
      <StatePanel
        title={filtered(s) ? "No matching transfers" : "No transfers yet"}
        description={
          filtered(s)
            ? "No transfers in your scope match these filters."
            : "Transfers involving shops in your scope will appear here."
        }
      />
    );
  return (
    <div className="tasmac-table-surface">
      <div className="tasmac-table-scroll overflow-x-auto">
        <table className="tasmac-inv-table">
          <thead className="text-left">
            <tr>
              <th className="text-center">Txn</th>
              <th className="text-center">Requested</th>
              <th className="text-center">From</th>
              <th className="text-center">To</th>
              <th className="text-center">Product</th>
              <th className="text-center">Qty</th>
              <th className="text-center">Waybill</th>
              <th className="text-center">Status</th>
              <th className="text-center">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {q.data.rows.map((t) => (
              <tr key={t.id}>
                <td className="text-center">
                  <button
                    className="tasmac-txn-link"
                    onClick={() => t.id && onOpen(t.id)}
                  >
                    #{t.txn_no}
                  </button>
                </td>
                <td className="text-center whitespace-nowrap text-muted-foreground">
                  {fmtTime(t.requested_at)}
                </td>
                <td className="text-center whitespace-nowrap">{t.source_label}</td>
                <td className="text-center whitespace-nowrap">{t.dest_label}</td>
                <td className="text-center whitespace-nowrap">
                  <span className="font-mono text-xs text-muted-foreground">
                    {t.sku}
                  </span>{" "}
                  {t.product_name}
                </td>
                <td className="text-center font-medium">
                  {t.quantity?.toLocaleString("en-IN")}
                </td>
                <td className="text-center font-mono text-xs text-muted-foreground">
                  {t.waybill_no ?? "—"}
                </td>
                <td className="text-center">
                  <StatusBadge status={t.status} />
                </td>
                <td className="text-center">
                  <ViewBtn
                    label={`View transfer #${t.txn_no}`}
                    onClick={() => t.id && onOpen(t.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager total={q.data.total} />
    </div>
  );
}

function MovementsTable({ onOpen }: { onOpen: (id: string) => void }) {
  const s = Route.useSearch();
  const f = { q: s.q, city: s.city, shop: s.shop, type: s.type, page: s.page };
  const q = useQuery({
    queryKey: ["stock_movements", "list", f],
    queryFn: () => fetchMovements(f),
    placeholderData: keepPreviousData,
  });
  if (q.isError)
    return (
      <StatePanel
        tone="error"
        title="Movements unavailable"
        description={userMessage(q.error)}
        action={<RetryButton onClick={() => q.refetch()} />}
      />
    );
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.data.total === 0)
    return (
      <StatePanel
        title={filtered(s) ? "No matching movements" : "No movements yet"}
        description={
          filtered(s)
            ? "No movements in your scope match these filters."
            : "Receipts, issues, adjustments and transfers in your scope will appear here."
        }
      />
    );
  return (
    <div className="tasmac-table-surface">
      <div className="tasmac-table-scroll overflow-x-auto">
        <table className="tasmac-inv-table">
          <thead className="text-left">
            <tr>
              <th className="text-center">Txn</th>
              <th className="text-center">Date &amp; time</th>
              <th className="text-center">Type</th>
              <th className="text-center">Shop / City</th>
              <th className="text-center">Product</th>
              <th className="text-center">Change</th>
              <th className="text-center">Balance</th>
              <th>Reference</th>
              <th className="text-center">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {q.data.rows.map((m) => (
              <tr key={m.id}>
                <td className="text-center">
                  <button
                    className="tasmac-txn-link"
                    onClick={() => m.id && onOpen(m.id)}
                  >
                    #{m.txn_no}
                  </button>
                </td>
                <td className="text-center whitespace-nowrap text-muted-foreground">
                  {fmtTime(m.created_at)}
                </td>
                <td className="text-center">
                  <MovementTypeCell type={m.movement_type} />
                </td>
                <td className="text-center whitespace-nowrap">
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.shop_number}
                  </span>{" "}
                  {m.shop_name}
                  <span className="text-muted-foreground">
                    {" "}
                    · {m.city_name}
                  </span>
                </td>
                <td className="text-center whitespace-nowrap">
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.sku}
                  </span>{" "}
                  {m.product_name}
                </td>
                <td
                  className={
                    "text-center font-medium " +
                    ((m.delta ?? 0) < 0 ? "text-destructive" : "text-success")
                  }
                >
                  {(m.delta ?? 0) > 0 ? "+" : ""}
                  {m.delta?.toLocaleString("en-IN")}
                </td>
                <td className="text-center">
                  {m.balance_after?.toLocaleString("en-IN")}
                </td>
                <td className="font-mono text-xs">{m.reference}</td>
                <td className="text-center">
                  <ViewBtn
                    label={`View movement #${m.txn_no}`}
                    onClick={() => m.id && onOpen(m.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager total={q.data.total} />
    </div>
  );
}

function Pager({ total }: { total: number }) {
  const s = Route.useSearch();
  const set = useSet();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(s.page, pages);
  const from = (page - 1) * PAGE_SIZE + 1;
  return (
    <nav aria-label="Pagination" className="tasmac-table-footer">
      <span className="tabular-nums">
        {from}–{Math.min(from + PAGE_SIZE - 1, total)} of{" "}
        {total.toLocaleString("en-IN")}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="outline"
          className="tasmac-btn tasmac-btn-pager"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => set({ page: page - 1 }, false)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          className="tasmac-btn tasmac-btn-pager"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => set({ page: page + 1 }, false)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
