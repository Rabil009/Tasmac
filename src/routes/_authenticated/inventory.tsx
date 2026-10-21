import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { userMessage } from "@/lib/app-error";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeading,
  SectionGuard,
  useAccess,
} from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import {
  ConfirmDelete,
  Field,
  StatusText,
  errProps,
} from "@/components/shell/form-bits";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  HEALTH,
  HEALTH_LABELS,
  PACKAGING,
  PACKAGING_LABELS,
  PAGE_SIZE,
  friendlyProductError,
  productSchema,
  type Category,
  type Health,
  type ProductInput,
} from "@/lib/catalog";
import { fieldErrors } from "@/lib/master-data";
import {
  fetchAlertMetrics,
  fetchDistribution,
  fetchInventory,
  fetchProduct,
  fetchProducts,
  fetchThresholds,
  type InventoryRow,
  type InventorySort,
  type Product,
} from "@/lib/inventory.queries";
import { canWriteCatalog, canReadStatewide } from "@/lib/rbac";
import {
  toast,
  Button,
  Input,
  Label,
  Switch,
  Skeleton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@4rged-ai/platform";

/** Radix Select forbids empty item values; maps the "all" option to "". */
const ALL = "__all__";
import {
  AlertOctagon,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  TrendingDown,
  X,
} from "lucide-react";

const TABS = ["inventory", "low-stock", "catalog"] as const;
type Tab = (typeof TABS)[number];
const SORTS = ["name", "sku", "quantity", "category"] as const;

interface Search {
  tab: Tab;
  q: string;
  category: Category | "";
  health: Health | "";
  sort: InventorySort;
  dir: "asc" | "desc";
  page: number;
  product?: string | undefined;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : d;

export const Route = createFileRoute("/_authenticated/inventory")({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const s = raw as Partial<Record<keyof Search, unknown>>;
    return {
      tab: pick(s.tab, TABS, "inventory"),
      q: typeof s.q === "string" ? s.q.slice(0, 80) : "",
      category: pick(s.category, ["", ...CATEGORIES] as const, ""),
      health: pick(s.health, ["", ...HEALTH] as const, ""),
      sort: pick(s.sort, SORTS, "name"),
      dir: s.dir === "desc" ? "desc" : "asc",
      page: Math.max(1, Math.min(10000, Math.floor(Number(s.page)) || 1)),
      ...(typeof s.product === "string" && /^[0-9a-f-]{36}$/.test(s.product)
        ? { product: s.product }
        : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Inventory · TASMAC Inventory" },
      {
        name: "description",
        content:
          "Product catalog, stock on hand and low-stock alerts within your scope.",
      },
      { property: "og:title", content: "Inventory · TASMAC Inventory" },
      {
        property: "og:description",
        content:
          "Product catalog, stock on hand and low-stock alerts within your scope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="inventory">
      <InventoryPage />
    </SectionGuard>
  ),
});

function useSetSearch() {
  const navigate = useNavigate({ from: "/inventory" });
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

function InventoryPage() {
  const search = Route.useSearch();
  const set = useSetSearch();
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Inventory"
        description="Stock on hand, low-stock alerts and the product catalog within your scope."
      />
      <div role="tablist" aria-label="Inventory views" className="tasmac-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={search.tab === t}
            tabIndex={search.tab === t ? 0 : -1}
            onClick={() => set({ tab: t, health: "", q: "", category: "" })}
            onKeyDown={(e) => {
              const i = TABS.indexOf(t);
              const next =
                e.key === "ArrowRight"
                  ? TABS[(i + 1) % TABS.length]
                  : e.key === "ArrowLeft"
                    ? TABS[(i + TABS.length - 1) % TABS.length]
                    : null;
              if (!next) return;
              e.preventDefault();
              set({ tab: next, health: "", q: "", category: "" });
              const list = e.currentTarget.parentElement;
              requestAnimationFrame(() =>
                (
                  list?.querySelector(
                    `[data-tab="${next}"]`,
                  ) as HTMLElement | null
                )?.focus(),
              );
            }}
            data-tab={t}
            className="tasmac-tab"
          >
            {t === "inventory"
              ? "Inventory"
              : t === "low-stock"
                ? "Low stock"
                : "Catalog"}
          </button>
        ))}
      </div>
      {search.tab === "catalog" ? (
        <CatalogTab />
      ) : (
        <InventoryTab alerts={search.tab === "low-stock"} />
      )}
      <InspectSheet
        id={search.product}
        onClose={() => set({ product: undefined }, false)}
      />
    </div>
  );
}

/* ---------------- Inventory + Low stock ---------------- */

function InventoryTab({ alerts }: { alerts: boolean }) {
  const s = Route.useSearch();
  const set = useSetSearch();
  const thresholds = useQuery({
    queryKey: ["app_settings", "thresholds"],
    queryFn: fetchThresholds,
  });
  const metrics = useQuery({
    queryKey: ["inventory", "metrics"],
    queryFn: fetchAlertMetrics,
  });
  const params = {
    q: s.q,
    category: s.category,
    health: alerts ? s.health || "alerts" : s.health,
    sort: s.sort,
    dir: s.dir,
    page: s.page,
  } as const;
  const inv = useQuery({
    queryKey: ["inventory", params],
    queryFn: () => fetchInventory(params),
    placeholderData: keepPreviousData,
  });

  return (
    <section
      className="flex flex-col gap-4"
      aria-label={alerts ? "Low stock" : "Stock on hand"}
    >
      <SummaryStrip alerts={alerts} thresholds={thresholds} metrics={metrics} />
      <Toolbar
        healthOptions={alerts ? (["critical", "low"] as const) : HEALTH}
        placeholder="Search product, SKU or shop"
        count={inv.data?.total}
      />
      {alerts && thresholds.data === null ? null : inv.isError ? (
        <StatePanel
          tone="error"
          title="Inventory unavailable"
          description={userMessage(inv.error)}
          action={
            <Button
              variant="outline"
              className="tasmac-btn tasmac-btn-retry"
              onClick={() => inv.refetch()}
            >
              <RotateCcw aria-hidden />
              Retry
            </Button>
          }
        />
      ) : inv.isPending ? (
        <TableSkeleton />
      ) : inv.data.total === 0 ? (
        <StatePanel
          title={
            s.q || s.category || s.health
              ? "No matching stock"
              : alerts
                ? "No low-stock alerts"
                : "No inventory records"
          }
          description={
            s.q || s.category || s.health
              ? "No stock records in your scope match these filters."
              : alerts
                ? "No stock record in your scope is at or below the configured thresholds."
                : "Stock on hand will appear here once stock is received into shops in your scope."
          }
        />
      ) : (
        <div className="tasmac-table-surface">
          <div className="overflow-x-auto">
            <table className="tasmac-inv-table">
              <thead className="text-left">
                <tr>
                  <SortTh col="name">Product</SortTh>
                  <SortTh col="sku" center>
                    SKU
                  </SortTh>
                  <SortTh col="category" center>
                    Category
                  </SortTh>
                  <th>Shop / City</th>
                  <SortTh col="quantity" center>
                    Available
                  </SortTh>
                  <th className="text-center">Safety min.</th>
                  <th className="text-center">Stock health</th>
                  <th className="text-center">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {inv.data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="min-w-[180px] font-medium text-foreground">
                        {r.product_name}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {r.volume_ml} ml
                      </div>
                    </td>
                    <td className="text-center font-mono text-xs text-muted-foreground">
                      {r.sku}
                    </td>
                    <td className="text-center">
                      {r.category ? CATEGORY_LABELS[r.category] : "—"}
                    </td>
                    <td>
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.shop_number}
                        </span>{" "}
                        {r.shop_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.city_name}
                      </div>
                    </td>
                    <td className="text-center font-medium tabular-nums">
                      {r.quantity_on_hand?.toLocaleString("en-IN")}
                    </td>
                    <td className="text-center tabular-nums text-muted-foreground">
                      {r.safety_minimum?.toLocaleString("en-IN")}
                    </td>
                    <td className="text-center">
                      <HealthBadge health={r.health} />
                    </td>
                    <td className="text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="tasmac-btn tasmac-btn-row"
                        aria-label={`View ${r.product_name ?? "product"} (${r.sku ?? ""})`}
                        onClick={() =>
                          set({ product: r.product_id ?? undefined }, false)
                        }
                      >
                        <Eye aria-hidden />
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={inv.data.total} />
        </div>
      )}
    </section>
  );
}

function SummaryStrip(props: {
  alerts: boolean;
  thresholds: ReturnType<
    typeof useQuery<{ low: number; critical: number } | null>
  >;
  metrics: ReturnType<
    typeof useQuery<{ total: number; low: number; critical: number }>
  >;
}) {
  const { alerts, thresholds, metrics } = props;
  if (thresholds.isPending || metrics.isPending)
    return <Skeleton className="h-[76px] w-full" />;
  if (thresholds.isError || metrics.isError)
    return (
      <StatePanel
        tone="error"
        title="Alerts unavailable"
        description="Stock thresholds or alert counts could not be loaded."
        action={
          <Button
            variant="outline"
            className="tasmac-btn tasmac-btn-retry"
            onClick={() => {
              thresholds.refetch();
              metrics.refetch();
            }}
          >
            <RotateCcw aria-hidden />
            Retry
          </Button>
        }
      />
    );
  if (alerts && thresholds.data === null)
    return (
      <StatePanel
        title="Stock thresholds not configured"
        description="Low-stock alerts need low and critical thresholds. A State Administrator can set them in Management → Settings."
      />
    );
  const t = thresholds.data;
  return (
    <dl className="tasmac-summary-strip" aria-label="Stock summary">
      <SummaryItem
        icon={<Layers aria-hidden />}
        label="Stock records in scope"
        value={metrics.data.total}
      />
      <SummaryItem
        icon={<AlertOctagon aria-hidden />}
        label={t ? `Critical (≤ ${t.critical})` : "Critical"}
        value={metrics.data.critical}
        tone="critical"
      />
      <SummaryItem
        icon={<TrendingDown aria-hidden />}
        label={t ? `Low (≤ ${t.low})` : "Low stock"}
        value={metrics.data.low}
        tone="low"
      />
    </dl>
  );
}

function SummaryItem({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: "critical" | "low";
}) {
  return (
    <div className="tasmac-summary-item">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <span className="tasmac-summary-icon">{icon}</span>
        <span className="tasmac-metric-label">{label}</span>
      </dt>
      <dd
        className="tasmac-metric-value"
        data-tone={value > 0 ? tone : undefined}
      >
        {value.toLocaleString("en-IN")}
      </dd>
    </div>
  );
}

function HealthBadge({ health }: { health: string | null }) {
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

function SortTh({
  col,
  right,
  center,
  children,
}: {
  col: InventorySort;
  right?: boolean;
  center?: boolean;
  children: ReactNode;
}) {
  const s = Route.useSearch();
  const set = useSetSearch();
  const active = s.sort === col;
  return (
    <th
      className={right ? "text-right" : center ? "text-center" : ""}
      aria-sort={
        active ? (s.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        className="tasmac-sort-btn"
        data-active={active || undefined}
        onClick={() =>
          set({ sort: col, dir: active && s.dir === "asc" ? "desc" : "asc" })
        }
      >
        {children}
        <span aria-hidden className="tasmac-sort-icon">
          {active ? (s.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Toolbar({
  healthOptions,
  placeholder,
  count,
  action,
}: {
  healthOptions?: readonly Health[];
  placeholder: string;
  count?: number | undefined;
  action?: ReactNode;
}) {
  const s = Route.useSearch();
  const set = useSetSearch();
  const [q, setQ] = useState(s.q);
  const dirty = Boolean(s.q || s.category || s.health);
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
        <Label htmlFor="inv-q">Search</Label>
        <Input
          id="inv-q"
          value={q}
          maxLength={80}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="flex w-full flex-col gap-1.5 sm:w-40">
        <Label htmlFor="inv-cat">Category</Label>
        <Select
          value={s.category || ALL}
          onValueChange={(v) =>
            set({ category: (v === ALL ? "" : v) as Category | "" })
          }
        >
          <SelectTrigger id="inv-cat" className="tasmac-select-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="tasmac-select-content">
            <SelectItem value={ALL}>All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {healthOptions ? (
        <div className="flex w-full flex-col gap-1.5 sm:w-40">
          <Label htmlFor="inv-health">Stock level</Label>
          <Select
            value={s.health || ALL}
            onValueChange={(v) =>
              set({ health: (v === ALL ? "" : v) as Health | "" })
            }
          >
            <SelectTrigger id="inv-health" className="tasmac-select-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="tasmac-select-content">
              <SelectItem value={ALL}>All levels</SelectItem>
              {healthOptions.map((h) => (
                <SelectItem key={h} value={h}>
                  {HEALTH_LABELS[h]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          size="lg"
          type="submit"
          variant="outline"
          className="tasmac-btn tasmac-btn-toolbar"
        >
          <Search aria-hidden />
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
              set({ q: "", category: "", health: "" });
            }}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </div>
      {action ? <div className="ml-auto flex items-center">{action}</div> : null}
    </form>
  );
}

function Pager({ total }: { total: number }) {
  const s = Route.useSearch();
  const set = useSetSearch();
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

function TableSkeleton() {
  return (
    <div
      className="tasmac-table-surface flex flex-col gap-2 p-4"
      aria-busy
      aria-label="Loading"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

/* ---------------- Catalog ---------------- */

function CatalogTab() {
  const s = Route.useSearch();
  const set = useSetSearch();
  const access = useAccess();
  const canWrite = canWriteCatalog(access.role);
  const qc = useQueryClient();
  const params = { q: s.q, category: s.category, page: s.page };
  const products = useQuery({
    queryKey: ["products", params],
    queryFn: () => fetchProducts(params),
    placeholderData: keepPreviousData,
  });
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const remove = useMutation({
    mutationFn: async (p: Product) => {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw new Error(friendlyProductError(error));
    },
    onSuccess: (_d, p) => {
      toast.success(`${p.name} deleted`);
      qc.invalidateQueries({ queryKey: ["products"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(userMessage(e)),
  });

  return (
    <section className="flex flex-col gap-4" aria-label="Product catalog">
      <Toolbar
        placeholder="Search name, SKU or brand"
        count={products.data?.total}
        action={
          canWrite ? (
            <Button
              size="lg"
              className="tasmac-btn tasmac-btn-primary"
              onClick={() => setEditing("new")}
            >
              <Plus aria-hidden />
              Add product
            </Button>
          ) : null
        }
      />
      {products.isError ? (
        <StatePanel
          tone="error"
          title="Catalog unavailable"
          description={userMessage(products.error)}
          action={
            <Button
              variant="outline"
              className="tasmac-btn tasmac-btn-retry"
              onClick={() => products.refetch()}
            >
              <RotateCcw aria-hidden />
              Retry
            </Button>
          }
        />
      ) : products.isPending ? (
        <TableSkeleton />
      ) : products.data.total === 0 ? (
        <StatePanel
          title={
            s.q || s.category
              ? "No matching products"
              : "No products in the catalog"
          }
          description={
            s.q || s.category
              ? "No products match these filters."
              : canWrite
                ? "Add the first IMFL, Beer, Wine or RTD product to start the catalog."
                : "Products will appear once a State Administrator adds them."
          }
        />
      ) : (
        <div className="tasmac-table-surface">
          <div className="overflow-x-auto">
            <table className="tasmac-inv-table tasmac-actions-sticky">
              <thead className="text-left">
                <tr>
                  <th>Product</th>
                  <th className="text-center">SKU</th>
                  <th className="text-center">Category</th>
                  <th className="text-center">Pack</th>
                  <th className="text-center">ABV</th>
                  <th className="text-center">MRP (₹)</th>
                  <th className="text-center">Excise reg.</th>
                  <th className="text-center">Status</th>
                  <th className="text-center">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.data.rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="min-w-[200px] font-medium text-foreground">
                        {p.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.brand}
                      </div>
                    </td>
                    <td className="text-center font-mono text-xs text-muted-foreground">
                      {p.sku}
                    </td>
                    <td className="text-center">{CATEGORY_LABELS[p.category]}</td>
                    <td className="text-center whitespace-nowrap">
                      {p.volume_ml} ml {PACKAGING_LABELS[p.packaging]} ×{" "}
                      {p.units_per_case}
                    </td>
                    <td className="text-center tabular-nums">
                      {Number(p.abv_percent).toFixed(2)}%
                    </td>
                    <td className="text-center tabular-nums">
                      {Number(p.mrp).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="text-center font-mono text-xs">
                      {p.excise_registration_no}
                    </td>
                    <td className="text-center">
                      <StatusText active={p.is_active} />
                    </td>
                    <td className="text-center">
                      <div className="flex justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="tasmac-btn tasmac-btn-row"
                          aria-label={`View ${p.name} (${p.sku})`}
                          onClick={() => set({ product: p.id }, false)}
                        >
                          <Eye aria-hidden />
                          View
                        </Button>
                        {canWrite ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="tasmac-btn tasmac-btn-row"
                              aria-label={`Edit ${p.name} (${p.sku})`}
                              onClick={() => setEditing(p)}
                            >
                              <Pencil aria-hidden />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="tasmac-btn tasmac-btn-row tasmac-btn-row-danger"
                              aria-label={`Delete ${p.name} (${p.sku})`}
                              onClick={() => setDeleting(p)}
                            >
                              <Trash2 aria-hidden />
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={products.data.total} />
        </div>
      )}
      {canWrite && editing ? (
        <ProductDialog
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDelete
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? "product"}?`}
        description="The product is removed from the catalog. Products stocked in any shop cannot be deleted — deactivate them instead."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}

const emptyForm: ProductInput = {
  sku: "",
  name: "",
  category: "imfl",
  brand: "",
  manufacturer: "",
  volumeMl: 750,
  packaging: "glass_bottle",
  unitsPerCase: 12,
  abvPercent: 0,
  mrp: 0,
  hsnCode: "",
  barcode: "",
  exciseRegistrationNo: "",
  labelApprovalNo: "",
  isActive: true,
};

function toForm(p: Product): ProductInput {
  return {
    sku: p.sku,
    name: p.name,
    category: p.category,
    brand: p.brand,
    manufacturer: p.manufacturer,
    volumeMl: p.volume_ml,
    packaging: p.packaging,
    unitsPerCase: p.units_per_case,
    abvPercent: Number(p.abv_percent),
    mrp: Number(p.mrp),
    hsnCode: p.hsn_code ?? "",
    barcode: p.barcode ?? "",
    exciseRegistrationNo: p.excise_registration_no,
    labelApprovalNo: p.label_approval_no ?? "",
    isActive: p.is_active,
  };
}

function ProductDialog({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ProductInput>(
    product ? toForm(product) : emptyForm,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const upd = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const parsed = productSchema.safeParse(form);
      if (!parsed.success) {
        setErrors(fieldErrors(parsed.error));
        throw new Error("Fix the highlighted fields.");
      }
      setErrors({});
      const v = parsed.data;
      const row = {
        sku: v.sku,
        name: v.name,
        category: v.category,
        brand: v.brand,
        manufacturer: v.manufacturer,
        volume_ml: v.volumeMl,
        packaging: v.packaging,
        units_per_case: v.unitsPerCase,
        abv_percent: v.abvPercent,
        mrp: v.mrp,
        hsn_code: v.hsnCode,
        barcode: v.barcode,
        excise_registration_no: v.exciseRegistrationNo,
        label_approval_no: v.labelApprovalNo,
        is_active: v.isActive,
      };
      const { error } = product
        ? await supabase
            .from("products")
            .update(row)
            .eq("id", product.id)
            .select("id")
            .single()
        : await supabase.from("products").insert(row).select("id").single();
      if (error) throw new Error(friendlyProductError(error));
      return v.name;
    },
    onSuccess: (name) => {
      toast.success(product ? `${name} updated` : `${name} added`);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
    onError: (e) => toast.error(userMessage(e)),
  });

  const text = (
    k: keyof ProductInput,
    label: string,
    extra?: { hint?: string; type?: string; step?: string },
  ) => (
    <Field
      id={`p-${k}`}
      label={label}
      error={errors[k]}
      {...(extra?.hint ? { hint: extra.hint } : {})}
    >
      <Input
        {...errProps(`p-${k}`, errors[k])}
        type={extra?.type ?? "text"}
        step={extra?.step}
        value={String(form[k] ?? "")}
        onChange={(e) => upd(k, e.target.value as never)}
      />
    </Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {product ? `Edit ${product.name}` : "Add product"}
          </DialogTitle>
          <DialogDescription>
            SKU specification, packaging and registration details.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-3 gap-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!save.isPending) save.mutate();
          }}
        >
          {text("sku", "SKU", { hint: "Stored in upper case" })}
          <div className="col-span-2">{text("name", "Product name")}</div>
          <Field id="p-category" label="Category" error={errors["category"]}>
            <Select
              name="category"
              value={form.category}
              onValueChange={(v) => upd("category", v as Category)}
            >
              <SelectTrigger
                {...errProps("p-category", errors["category"])}
                className="tasmac-select-trigger w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="tasmac-select-content"
              >
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {text("brand", "Brand")}
          {text("manufacturer", "Manufacturer")}
          {text("volumeMl", "Volume (ml)", { type: "number" })}
          <Field id="p-packaging" label="Packaging" error={errors["packaging"]}>
            <Select
              name="packaging"
              value={form.packaging}
              onValueChange={(v) =>
                upd("packaging", v as ProductInput["packaging"])
              }
            >
              <SelectTrigger
                {...errProps("p-packaging", errors["packaging"])}
                className="tasmac-select-trigger w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                className="tasmac-select-content"
              >
                {PACKAGING.map((c) => (
                  <SelectItem key={c} value={c}>
                    {PACKAGING_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {text("unitsPerCase", "Units per case", { type: "number" })}
          {text("abvPercent", "ABV (%)", { type: "number", step: "0.01" })}
          {text("mrp", "MRP (₹)", { type: "number", step: "0.01" })}
          {text("hsnCode", "HSN code", { hint: "Optional, 4–8 digits" })}
          {text("barcode", "Barcode (EAN/GTIN)", {
            hint: "Optional, 8–14 digits",
          })}
          {text("exciseRegistrationNo", "Excise registration no.")}
          {text("labelApprovalNo", "Label approval no.", { hint: "Optional" })}
          <div className="col-span-3 flex items-center gap-2">
            <Switch
              id="p-active"
              checked={form.isActive}
              onCheckedChange={(v) => upd("isActive", v)}
            />
            <Label htmlFor="p-active">Active</Label>
          </div>
          <DialogFooter className="col-span-3">
            <Button
              size="lg"
              type="button"
              variant="outline"
              className="tasmac-btn tasmac-btn-dialog"
              disabled={save.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              type="submit"
              className="tasmac-btn tasmac-btn-primary tasmac-btn-dialog min-w-[8.5rem]"
              disabled={save.isPending}
              aria-busy={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Inspection sheet ---------------- */

function InspectSheet({
  id,
  onClose,
}: {
  id: string | undefined;
  onClose: () => void;
}) {
  const access = useAccess();
  const product = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id!),
    enabled: Boolean(id),
  });
  const dist = useQuery({
    queryKey: ["inventory", "distribution", id],
    queryFn: () => fetchDistribution(id!),
    enabled: Boolean(id),
  });
  const p = product.data;
  const statewide = canReadStatewide(access.role);
  const total =
    dist.data?.reduce((n, r) => n + (r.quantity_on_hand ?? 0), 0) ?? 0;

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{p ? p.name : "Product details"}</SheetTitle>
          <SheetDescription>
            {p ? (
              <>
                <span className="font-mono">{p.sku}</span> ·{" "}
                {CATEGORY_LABELS[p.category]} ·{" "}
                {p.is_active ? "Active" : "Inactive"}
              </>
            ) : (
              "SKU specification and stock distribution"
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          {product.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : product.isError ? (
            <StatePanel
              tone="error"
              title="Product unavailable"
              description={userMessage(product.error)}
            />
          ) : !p ? (
            <StatePanel
              title="Product not found"
              description="This product does not exist or is not visible to your role."
            />
          ) : (
            <>
              <SheetGroup title="Specification">
                <Meta k="Brand" v={p.brand} />
                <Meta k="Manufacturer" v={p.manufacturer} />
                <Meta k="Volume" v={`${p.volume_ml} ml`} />
                <Meta k="Packaging" v={PACKAGING_LABELS[p.packaging]} />
                <Meta k="Units per case" v={String(p.units_per_case)} />
                <Meta k="ABV" v={`${Number(p.abv_percent).toFixed(2)}%`} />
                <Meta
                  k="MRP"
                  v={`₹${Number(p.mrp).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                />
              </SheetGroup>
              <SheetGroup title="Registration">
                <Meta k="HSN code" v={p.hsn_code ?? "—"} mono />
                <Meta k="Barcode" v={p.barcode ?? "—"} mono />
                <Meta
                  k="Excise registration"
                  v={p.excise_registration_no}
                  mono
                />
                <Meta k="Label approval" v={p.label_approval_no ?? "—"} mono />
                <Meta k="Status" v={p.is_active ? "Active" : "Inactive"} />
                <Meta
                  k="Last updated"
                  v={new Date(p.updated_at).toLocaleString("en-IN")}
                />
              </SheetGroup>
            </>
          )}
          <section
            className="flex flex-col gap-2"
            aria-label="Stock distribution"
          >
            <h3 className="tasmac-metric-label text-muted-foreground">
              {statewide
                ? "Statewide distribution"
                : "Distribution in your scope"}
            </h3>
            {dist.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : dist.isError ? (
              <StatePanel
                tone="error"
                title="Distribution unavailable"
                description={userMessage(dist.error)}
              />
            ) : dist.data.length === 0 ? (
              <StatePanel
                title="Not stocked"
                description="No shop in your scope holds this product."
              />
            ) : (
              <div className="tasmac-table-surface overflow-x-auto">
                <table className="tasmac-inv-table">
                  <thead className="text-left">
                    <tr>
                      <th>City</th>
                      <th>Shop</th>
                      <th className="text-center">Available</th>
                      <th className="text-center">Stock health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dist.data.map((r: InventoryRow) => (
                      <tr key={r.id}>
                        <td>{r.city_name}</td>
                        <td>
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.shop_number}
                          </span>{" "}
                          {r.shop_name}
                        </td>
                        <td className="text-center tabular-nums">
                          {r.quantity_on_hand?.toLocaleString("en-IN")}
                        </td>
                        <td className="text-center">
                          <HealthBadge health={r.health} />
                        </td>
                      </tr>
                    ))}
                    <tr className="tasmac-total-row">
                      <td className="font-semibold" colSpan={2}>
                        Total
                      </td>
                      <td className="text-center font-semibold tabular-nums">
                        {total.toLocaleString("en-IN")}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="tasmac-dl-row">
      <dt className="text-muted-foreground">{k}</dt>
      <dd
        className={
          "text-right font-medium text-foreground " +
          (mono ? "font-mono text-xs" : "")
        }
      >
        {v}
      </dd>
    </div>
  );
}

function SheetGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="tasmac-metric-label text-muted-foreground">{title}</h3>
      <dl className="tasmac-dl">{children}</dl>
    </section>
  );
}
