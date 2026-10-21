import { Link } from "@tanstack/react-router";
import { fmtTime } from "@/lib/ops-format";
import { userMessage } from "@/lib/app-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog as AlertDialog,
  DialogClose,
  DialogContent as AlertDialogContent,
  DialogDescription as AlertDialogDescription,
  DialogFooter as AlertDialogFooter,
  DialogHeader as AlertDialogHeader,
  DialogTitle as AlertDialogTitle,
} from "@4rged-ai/platform";
import {
  PageHeading,
  SectionGuard,
  useAccess,
} from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import { Field, errProps } from "@/components/shell/form-bits";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
} from "lucide-react";
import {
  MovementTypeCell,
  OpSelect,
  ContextHint,
  OpSurface,
  OperationFlow,
  RetryButton,
  ReviewLine,
  Row,
} from "@/components/stock/ops-bits";
import { HEALTH, HEALTH_LABELS, type Health } from "@/lib/catalog";
import { fieldErrors } from "@/lib/master-data";
import { fetchShops } from "@/lib/master-data.queries";
import { shopsWithinAccess } from "@/lib/rbac";
import {
  ADJUST_REASONS,
  ADJUST_REASON_LABELS,
  adjustSchema,
  friendlyStockError,
  issueSchema,
  projectBalance,
  receiveSchema,
  stockDelta,
  type MovementType,
  type StockKind,
} from "@/lib/stock";
import {
  fetchActiveProducts,
  fetchBalance,
  fetchRecentMovements,
} from "@/lib/stock.queries";
import { toast, Button, Input, Textarea, Skeleton } from "@4rged-ai/platform";

const COPY: Record<
  StockKind,
  {
    title: string;
    description: string;
    formTitle: string;
    ref: string;
    cp?: string;
    cpHint?: string;
    submit: string;
    types: readonly MovementType[];
    log: string;
  }
> = {
  receive: {
    title: "Receive stock",
    formTitle: "Receipt details",
    description:
      "Record stock received into a shop from a depot against a delivery challan.",
    ref: "Delivery challan number",
    cp: "Source depot",
    cpHint: "Depot or supplier that dispatched the stock",
    submit: "Record receipt",
    types: ["receive"],
    log: "Recent inward log",
  },
  issue: {
    title: "Issue stock",
    formTitle: "Issue details",
    description:
      "Record retail counter and daily sales issues against the sales register.",
    ref: "Sales register reference",
    cp: "Destination / counter",
    cpHint: "Retail counter or sales point",
    submit: "Record issue",
    types: ["issue"],
    log: "Recent issue log",
  },
  adjust: {
    title: "Adjust stock",
    formTitle: "Adjustment details",
    description:
      "Reconcile audit counts or write off breakage and damage against an audit memo.",
    ref: "Audit memo number",
    submit: "Record adjustment",
    types: ["adjust_surplus", "adjust_writeoff"],
    log: "Recent adjustments",
  },
};

interface FormState {
  shopId: string;
  productId: string;
  quantity: string;
  reference: string;
  counterparty: string;
  direction: "surplus" | "writeoff";
  reason: string;
  justification: string;
}
const initial: FormState = {
  shopId: "",
  productId: "",
  quantity: "",
  reference: "",
  counterparty: "",
  direction: "writeoff",
  reason: "",
  justification: "",
};

interface Committed {
  txn: number;
  balance: number;
  sku: string;
}

export function StockOperationPage({ kind }: { kind: StockKind }) {
  return (
    <SectionGuard section="stock">
      <StockOperation kind={kind} />
    </SectionGuard>
  );
}

function StockOperation({ kind }: { kind: StockKind }) {
  const copy = COPY[kind];
  const access = useAccess();
  const qc = useQueryClient();
  const shops = useQuery({ queryKey: ["shops"], queryFn: fetchShops });
  const products = useQuery({
    queryKey: ["products", "active-options"],
    queryFn: fetchActiveProducts,
  });
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [committed, setCommitted] = useState<Committed | null>(null);
  // One key per logical submission; reused on retry so a lost response never double-posts.
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setCommitted(null);
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };

  const activeShops = useMemo(
    () =>
      shopsWithinAccess(
        access.role,
        access.scopeCode,
        shops.data?.filter((s) => s.is_active) ?? [],
      ),
    [access.role, access.scopeCode, shops.data],
  );
  // Preselect the assigned shop so operational work starts with the correct
  // context and cannot drift, even while the shop list is still loading.
  const assignedShop =
    access.role === "shop_manager" ? (activeShops[0] ?? null) : null;
  useEffect(() => {
    if (!assignedShop || form.shopId === assignedShop.id) return;
    setForm((current) => ({ ...current, shopId: assignedShop.id }));
  }, [assignedShop, form.shopId]);
  const pair =
    form.shopId && form.productId
      ? ([form.shopId, form.productId] as const)
      : null;
  const balance = useQuery({
    queryKey: ["inventory", "balance", form.shopId, form.productId],
    queryFn: () => fetchBalance(form.shopId, form.productId),
    enabled: Boolean(pair),
  });
  const recent = useQuery({
    queryKey: ["stock_movements", "recent", kind],
    queryFn: () => fetchRecentMovements(copy.types),
  });

  const qtyNum = Number(form.quantity);
  const delta =
    Number.isInteger(qtyNum) && qtyNum > 0
      ? stockDelta(kind, qtyNum, form.direction)
      : NaN;
  const projected = balance.data
    ? projectBalance(balance.data.quantity, delta)
    : null;
  const isNegative =
    kind === "issue" || (kind === "adjust" && form.direction === "writeoff");

  const submit = useMutation({
    mutationFn: async () => {
      const schema =
        kind === "receive"
          ? receiveSchema
          : kind === "issue"
            ? issueSchema
            : adjustSchema;
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        setErrors(fieldErrors(parsed.error));
        throw new Error("Fix the highlighted fields.");
      }
      setErrors({});
      const v = parsed.data as Record<string, string | number>;
      const base = {
        _shop_id: String(v["shopId"]),
        _product_id: String(v["productId"]),
        _quantity: Number(v["quantity"]),
        _idempotency_key: idemKey,
      };
      const res =
        kind === "receive"
          ? await supabase.rpc("receive_stock", {
              ...base,
              _challan_no: String(v["reference"]),
              _source: String(v["counterparty"]),
            })
          : kind === "issue"
            ? await supabase.rpc("issue_stock", {
                ...base,
                _register_ref: String(v["reference"]),
                _destination: String(v["counterparty"]),
              })
            : await supabase.rpc("adjust_stock", {
                ...base,
                _direction: String(v["direction"]),
                _reason: v["reason"] as (typeof ADJUST_REASONS)[number],
                _audit_memo: String(v["reference"]),
                _justification: String(v["justification"]),
              });
      if (res.error) throw new Error(friendlyStockError(res.error));
      const out = res.data as { txn_no: number; balance_after: number } | null;
      if (!out || typeof out.txn_no !== "number")
        throw new Error(
          "The stock movement was not confirmed. Check the log before retrying.",
        );
      return out;
    },
    onSuccess: (out) => {
      const sku =
        products.data?.find((p) => p.id === form.productId)?.sku ?? "";
      setCommitted({ txn: out.txn_no, balance: out.balance_after, sku });
      toast.success(`Transaction #${out.txn_no} recorded`);
      setForm((f) => ({ ...initial, shopId: f.shopId }));
      setIdemKey(crypto.randomUUID());
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (e) => {
      setConfirming(false);
      toast.error(userMessage(e));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submit.isPending) return;
    if (kind === "adjust" && form.direction === "writeoff") setConfirming(true);
    else submit.mutate();
  };

  const shopName = activeShops.find((s) => s.id === form.shopId);
  const prod = products.data?.find((p) => p.id === form.productId);
  const schema =
    kind === "receive"
      ? receiveSchema
      : kind === "issue"
        ? issueSchema
        : adjustSchema;
  const contextDone = Boolean(pair);
  const detailsValid = schema.safeParse(form).success;
  const insufficient = projected !== null && projected < 0;
  const reviewText =
    detailsValid && prod && shopName && Number.isFinite(delta)
      ? `${kind === "receive" ? "Receive" : kind === "issue" ? "Issue" : form.direction === "writeoff" ? "Write off" : "Add surplus of"} ${Math.abs(delta).toLocaleString("en-IN")} units of ${prod.sku} ${kind === "receive" ? "into" : kind === "issue" ? "from" : "at"} ${shopName.shop_number}${projected !== null ? ` · balance ${balance.data?.quantity.toLocaleString("en-IN")} → ${projected.toLocaleString("en-IN")}` : ""}.`
      : null;
  const stages = [
    { label: "Select context", done: contextDone },
    { label: "Enter details", done: contextDone && detailsValid },
    { label: "Review & record", done: committed !== null },
  ];
  const SubmitIcon =
    kind === "receive"
      ? ArrowDownToLine
      : kind === "issue"
        ? ArrowUpFromLine
        : SlidersHorizontal;

  if (shops.isError || products.isError)
    return (
      <Wrap copy={copy}>
        <StatePanel
          tone="error"
          title="Stock operations unavailable"
          description="Shops or products could not be loaded."
          action={
            <RetryButton
              onClick={() => {
                shops.refetch();
                products.refetch();
              }}
            />
          }
        />
      </Wrap>
    );
  if (shops.isPending || products.isPending)
    return (
      <Wrap copy={copy}>
        <Skeleton className="h-72 w-full" />
      </Wrap>
    );
  if (activeShops.length === 0 || products.data.length === 0)
    return (
      <Wrap copy={copy}>
        <StatePanel
          title={
            activeShops.length === 0
              ? "No shops in your scope"
              : "No active products"
          }
          description={
            activeShops.length === 0
              ? "Stock can be recorded once an active shop is assigned to your scope."
              : "Stock can be recorded once a State Administrator adds active products to the catalog."
          }
        />
      </Wrap>
    );

  return (
    <Wrap copy={copy}>
      <div className="tasmac-flow-rail">
        <OperationFlow stages={stages} />
      </div>
      <div className="tasmac-op-grid">
        <OpSurface title={copy.formTitle}>
          <form
            className="tasmac-op-form"
            onSubmit={onSubmit}
            aria-busy={submit.isPending}
            noValidate
          >
            <div className="tasmac-op-fields">
              <Field id="so-shop" label="Shop" error={errors["shopId"]}>
                <OpSelect
                  id="so-shop"
                  error={errors["shopId"]}
                  value={form.shopId}
                  placeholder={assignedShop ? "Assigned shop" : "Select a shop"}
                  options={activeShops.map((s) => ({
                    value: s.id,
                    label: `${s.shop_number} · ${s.name}`,
                  }))}
                  disabled={Boolean(assignedShop)}
                  onChange={(v) => set("shopId", v)}
                />
              </Field>
              <Field
                id="so-product"
                label="Product"
                error={errors["productId"]}
              >
                <OpSelect
                  id="so-product"
                  error={errors["productId"]}
                  value={form.productId}
                  placeholder="Select a product"
                  options={products.data.map((p) => ({
                    value: p.id,
                    label: `${p.sku} · ${p.name} ${p.volume_ml} ml`,
                  }))}
                  onChange={(v) => set("productId", v)}
                />
              </Field>

              {kind === "adjust" ? (
                <>
                  <fieldset className="tasmac-op-span flex flex-col gap-1.5">
                    <legend className="mb-1.5 text-xs font-semibold">
                      Adjustment type
                    </legend>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {(["writeoff", "surplus"] as const).map((d) => (
                        <label key={d} className="flex h-6 items-center gap-2">
                          <input
                            type="radio"
                            name="direction"
                            value={d}
                            checked={form.direction === d}
                            onChange={() => {
                              set("direction", d);
                              if (d === "surplus")
                                set("reason", "audit_reconciliation");
                            }}
                            className="tasmac-adjust-radio"
                          />
                          {d === "writeoff"
                            ? "Write-off / shortage (decrease)"
                            : "Audit surplus (increase)"}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field id="so-reason" label="Reason" error={errors["reason"]}>
                    <OpSelect
                      id="so-reason"
                      error={errors["reason"]}
                      value={form.reason}
                      placeholder="Select a reason"
                      options={ADJUST_REASONS.filter(
                        (r) =>
                          form.direction === "writeoff" ||
                          r === "audit_reconciliation",
                      ).map((r) => ({
                        value: r,
                        label: ADJUST_REASON_LABELS[r],
                      }))}
                      onChange={(v) => set("reason", v)}
                    />
                  </Field>
                </>
              ) : null}

              <Field
                id="so-qty"
                label="Quantity (units)"
                error={errors["quantity"]}
              >
                <Input
                  {...errProps("so-qty", errors["quantity"])}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.quantity}
                  onChange={(e) => set("quantity", e.target.value)}
                />
              </Field>
              <Field
                id="so-ref"
                label={copy.ref}
                error={errors["reference"]}
                hint="Unique per shop and product; stored in upper case"
              >
                <Input
                  {...errProps("so-ref", errors["reference"])}
                  maxLength={40}
                  value={form.reference}
                  onChange={(e) => set("reference", e.target.value)}
                />
              </Field>
              {copy.cp ? (
                <Field
                  id="so-cp"
                  label={copy.cp}
                  error={errors["counterparty"]}
                  {...(copy.cpHint ? { hint: copy.cpHint } : {})}
                >
                  <Input
                    {...errProps("so-cp", errors["counterparty"])}
                    maxLength={120}
                    value={form.counterparty}
                    onChange={(e) => set("counterparty", e.target.value)}
                  />
                </Field>
              ) : null}
              {kind === "adjust" ? (
                <div className="tasmac-op-span">
                  <Field
                    id="so-just"
                    label="Detailed justification"
                    error={errors["justification"]}
                    hint="At least 20 characters"
                  >
                    <Textarea
                      {...errProps("so-just", errors["justification"])}
                      rows={3}
                      maxLength={1000}
                      value={form.justification}
                      onChange={(e) => set("justification", e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <div className="tasmac-op-actions">
              <ReviewLine text={reviewText} />
              <Button
                size="lg"
                type="button"
                variant="ghost"
                className="tasmac-btn tasmac-btn-dialog tasmac-btn-ghost"
                disabled={submit.isPending}
                onClick={() => {
                  setForm(() => ({
                    ...initial,
                    shopId: assignedShop?.id ?? "",
                  }));
                  setErrors({});
                }}
              >
                Clear
              </Button>
              <Button
                size="lg"
                type="submit"
                className="tasmac-btn tasmac-btn-primary min-w-[10.5rem]"
                disabled={submit.isPending || !detailsValid || insufficient}
                title={
                  detailsValid && !insufficient
                    ? copy.submit
                    : "Complete the required fields to record this adjustment"
                }
              >
                <SubmitIcon aria-hidden />
                {submit.isPending ? "Recording…" : copy.submit}
              </Button>
            </div>
          </form>
        </OpSurface>

        <aside
          className="flex min-w-0 flex-col gap-4"
          aria-label="Operation receipt preview"
        >
          <OpSurface title="Receipt preview" label="Receipt preview">
            <div className="tasmac-op-context" aria-live="polite">
              {!pair ? (
                <ContextHint>
                  Select a shop and product to see current stock.
                </ContextHint>
              ) : balance.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : balance.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {userMessage(balance.error)}
                </p>
              ) : (
                <>
                  <div className="tasmac-op-identity">
                    <p className="truncate text-sm font-medium text-foreground">
                      {prod?.name ?? ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{prod?.sku}</span>
                      {shopName
                        ? ` · ${shopName.shop_number} ${shopName.name}`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <p className="tasmac-metric-label text-muted-foreground">
                      On hand
                    </p>
                    <p className="tasmac-metric-value text-foreground">
                      {balance.data.quantity.toLocaleString("en-IN")}
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        units
                      </span>
                    </p>
                  </div>
                  <dl className="tasmac-dl">
                    <Row k="Change">
                      <span
                        className={
                          Number.isFinite(delta)
                            ? isNegative
                              ? "text-destructive"
                              : "text-success"
                            : "text-muted-foreground"
                        }
                      >
                        {Number.isFinite(delta)
                          ? `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-IN")}`
                          : "—"}
                      </span>
                    </Row>
                    <Row k="Reference" mono>
                      {form.reference.trim()
                        ? form.reference.trim().toUpperCase()
                        : "—"}
                    </Row>
                    <Row k="Projected">
                      <span
                        className={
                          projected !== null && projected < 0
                            ? "text-destructive"
                            : ""
                        }
                      >
                        {projected === null
                          ? "—"
                          : projected.toLocaleString("en-IN")}
                      </span>
                    </Row>
                    {balance.data.exists ? (
                      <>
                        <Row k="Safety minimum">
                          {balance.data.safetyMinimum.toLocaleString("en-IN")}
                        </Row>
                        <Row k="Stock health">
                          <HealthLozenge health={balance.data.health} />
                        </Row>
                      </>
                    ) : null}
                  </dl>
                  {projected !== null && projected < 0 ? (
                    <p role="alert" className="text-xs text-destructive">
                      Insufficient stock: only {balance.data.quantity}{" "}
                      available.
                    </p>
                  ) : null}
                  {!balance.data.exists ? (
                    <p className="text-xs text-muted-foreground">
                      No stock recorded for this shop and product yet.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </OpSurface>
          {committed ? (
            <div role="status" className="tasmac-op-committed">
              <p className="text-sm font-semibold text-success">
                Transaction #{committed.txn} committed
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                New balance: {committed.balance.toLocaleString("en-IN")} units.
              </p>
              <div className="mt-3 flex gap-4 text-sm">
                <Link
                  to="/inventory"
                  search={{
                    tab: "inventory",
                    q: committed.sku,
                    category: "",
                    health: "",
                    sort: "name",
                    dir: "asc",
                    page: 1,
                  }}
                  className="text-primary hover:underline"
                >
                  View inventory
                </Link>
                <Link
                  to="/tracking"
                  search={{
                    tab: "movements",
                    q: committed.sku,
                    city: "",
                    shop: "",
                    status: "",
                    type: "",
                    page: 1,
                    open: "",
                  }}
                  className="text-primary hover:underline"
                >
                  Open tracking
                </Link>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {recent.isPending || recent.isError || recent.data.length > 0 ? (
      <section className="flex flex-col gap-3" aria-label={copy.log}>
        <h2 className="tasmac-section-title">{copy.log}</h2>
        {recent.isError ? (
          <StatePanel
            tone="error"
            title="Log unavailable"
            description={userMessage(recent.error)}
            action={<RetryButton onClick={() => recent.refetch()} />}
          />
        ) : recent.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="tasmac-table-surface">
            <div className="overflow-x-auto">
              <table className="tasmac-inv-table">
                <thead className="text-left">
                  <tr>
                    <th className="text-center">Txn</th>
                    <th className="text-center">Date &amp; time</th>
                    <th className="text-center">Type</th>
                    <th className="text-center">Shop</th>
                    <th className="text-center">Product</th>
                    <th className="text-center">Change</th>
                    <th className="text-center">Balance</th>
                    <th className="text-center">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.map((m) => (
                    <tr key={m.id}>
                      <td className="text-center font-mono text-xs text-muted-foreground">
                        #{m.txn_no}
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
                          ((m.delta ?? 0) < 0
                            ? "text-destructive"
                            : "text-success")
                        }
                      >
                        {(m.delta ?? 0) > 0 ? "+" : ""}
                        {m.delta?.toLocaleString("en-IN")}
                      </td>
                      <td className="text-center">
                        {m.balance_after?.toLocaleString("en-IN")}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        <span className="font-mono text-xs">{m.reference}</span>
                        {m.counterparty ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {m.counterparty}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      ) : null}

      <AlertDialog
        open={confirming}
        onOpenChange={(o) => !o && !submit.isPending && setConfirming(false)}
      >
        <AlertDialogContent hideClose>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm write-off</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently reduces stock by{" "}
              {Number.isFinite(delta)
                ? Math.abs(delta).toLocaleString("en-IN")
                : "—"}{" "}
              units
              {projected !== null
                ? ` to ${projected.toLocaleString("en-IN")}`
                : ""}
              . The movement is recorded in the immutable stock history and
              cannot be edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <DialogClose asChild>
              <Button
                size="lg"
                variant="outline"
                className="tasmac-btn tasmac-btn-dialog"
                disabled={submit.isPending}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="lg"
              disabled={submit.isPending}
              variant="destructive"
              className="tasmac-btn tasmac-btn-dialog min-w-[9rem]"
              onClick={(e) => {
                e.preventDefault();
                submit.mutate();
              }}
            >
              {submit.isPending ? "Recording…" : "Write off stock"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Wrap>
  );
}

function HealthLozenge({ health }: { health: string | null }) {
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

function Wrap({
  copy,
  children,
}: {
  copy: { title: string; description: string };
  children: React.ReactNode;
}) {
  return (
    <div className="tasmac-ws tasmac-ws-stock flex flex-col gap-4">
      <PageHeading title={copy.title} description={copy.description} />
      {children}
    </div>
  );
}
