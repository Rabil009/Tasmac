import { createFileRoute } from "@tanstack/react-router";
import { userMessage } from "@/lib/app-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeading,
  SectionGuard,
  useAccess,
} from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import { Field, errProps } from "@/components/shell/form-bits";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import {
  ContextHint,
  OpSelect,
  OpSurface,
  OperationFlow,
  RetryButton,
  ReviewLine,
  Row,
} from "@/components/stock/ops-bits";
import { StatusBadge, TransferSheet } from "@/components/tracking/sheets";
import { fieldErrors } from "@/lib/master-data";
import { fetchShops } from "@/lib/master-data.queries";
import { shopsWithinAccess } from "@/lib/rbac";
import { fetchActiveProducts, fetchBalance } from "@/lib/stock.queries";
import { friendlyTransferError, transferRequestSchema } from "@/lib/transfers";
import {
  fetchDestinations,
  fetchRecentTransfers,
} from "@/lib/transfers.queries";
import { toast, Button, Input, Textarea, Skeleton } from "@4rged-ai/platform";

export const Route = createFileRoute("/_authenticated/stock/transfer")({
  head: () => ({
    meta: [
      { title: "Transfer Stock · TASMAC Inventory" },
      {
        name: "description",
        content:
          "Request, approve, dispatch and receive stock transfers between shops.",
      },
      { property: "og:title", content: "Transfer Stock · TASMAC Inventory" },
      {
        property: "og:description",
        content:
          "Request, approve, dispatch and receive stock transfers between shops.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="stock">
      <TransferPage />
    </SectionGuard>
  ),
});

const initial = {
  sourceShopId: "",
  destShopId: "",
  productId: "",
  quantity: "",
  reason: "",
};

function TransferPage() {
  const access = useAccess();
  const qc = useQueryClient();
  const shops = useQuery({ queryKey: ["shops"], queryFn: fetchShops });
  const dests = useQuery({
    queryKey: ["transfer-destinations"],
    queryFn: fetchDestinations,
  });
  const products = useQuery({
    queryKey: ["products", "active-options"],
    queryFn: fetchActiveProducts,
  });
  const recent = useQuery({
    queryKey: ["transfers", "recent"],
    queryFn: fetchRecentTransfers,
  });
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState<string | null>(null);
  const set = (k: keyof typeof initial, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };

  const sources = useMemo(
    () =>
      shopsWithinAccess(
        access.role,
        access.scopeCode,
        shops.data?.filter((s) => s.is_active) ?? [],
      ),
    [access.role, access.scopeCode, shops.data],
  );
  // The assigned source is selected and fixed for Shop Managers, while State
  // Administrators retain the normal source selector.
  const assignedSource =
    access.role === "shop_manager" ? (sources[0] ?? null) : null;
  useEffect(() => {
    if (!assignedSource || form.sourceShopId === assignedSource.id) return;
    setForm((current) => ({ ...current, sourceShopId: assignedSource.id }));
  }, [assignedSource, form.sourceShopId]);
  const balance = useQuery({
    queryKey: ["inventory", "balance", form.sourceShopId, form.productId],
    queryFn: () => fetchBalance(form.sourceShopId, form.productId),
    enabled: Boolean(form.sourceShopId && form.productId),
  });
  const qty = Number(form.quantity);
  const short =
    balance.data && Number.isInteger(qty) && qty > balance.data.quantity;

  const submit = useMutation({
    mutationFn: async () => {
      const p = transferRequestSchema.safeParse(form);
      if (!p.success) {
        setErrors(fieldErrors(p.error));
        throw new Error("Fix the highlighted fields.");
      }
      setErrors({});
      const { data, error } = await supabase.rpc("request_transfer", {
        _source_shop_id: p.data.sourceShopId,
        _dest_shop_id: p.data.destShopId,
        _product_id: p.data.productId,
        _quantity: p.data.quantity,
        _reason: p.data.reason,
        _idempotency_key: idemKey,
      });
      if (error) throw new Error(friendlyTransferError(error));
      const out = data as { id?: string; txn_no?: number } | null;
      if (!out?.id)
        throw new Error(
          "The request was not confirmed. Check recent transfers before retrying.",
        );
      return out as { id: string; txn_no: number };
    },
    onSuccess: (out) => {
      toast.success(`Transfer #${out.txn_no} requested`);
      setForm(() => ({
        ...initial,
        sourceShopId: assignedSource?.id ?? "",
      }));
      setIdemKey(crypto.randomUUID());
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["analytics", "transfers"] });
      setOpen(out.id);
    },
    onError: (e) => toast.error(userMessage(e)),
  });

  const loading = shops.isPending || dests.isPending || products.isPending;
  const failed = shops.isError || dests.isError || products.isError;
  const src = sources.find((x) => x.id === form.sourceShopId);
  const prod = products.data?.find((p) => p.id === form.productId);
  const dst = dests.data?.find((d) => d.id === form.destShopId);
  const contextDone = Boolean(
    form.sourceShopId && form.destShopId && form.productId,
  );
  const detailsValid = transferRequestSchema.safeParse(form).success;
  const stages = [
    { label: "Select context", done: contextDone },
    { label: "Enter details", done: contextDone && detailsValid && !short },
    { label: "Review & request", done: false },
  ];
  const reviewText =
    detailsValid && !short && src && dst && prod
      ? `Request ${qty.toLocaleString("en-IN")} units of ${prod.sku} from ${src.shop_number} to ${dst.label}.`
      : null;

  return (
    <div className="tasmac-ws tasmac-ws-stock flex flex-col gap-4">
      <PageHeading
        title="Transfer stock"
        description="Request stock moves between shops. State Administrators approve; the source dispatches and the destination receives."
      />
      {failed ? (
        <StatePanel
          tone="error"
          title="Transfers unavailable"
          description="Shops or products could not be loaded."
          action={
            <RetryButton
              onClick={() => {
                shops.refetch();
                dests.refetch();
                products.refetch();
              }}
            />
          }
        />
      ) : loading ? (
        <Skeleton className="h-64 w-full" />
      ) : sources.length === 0 || products.data.length === 0 ? (
        <StatePanel
          title={
            sources.length === 0
              ? "No shops in your scope"
              : "No active products"
          }
          description={
            sources.length === 0
              ? "Transfers can be requested once an active shop is assigned to your scope."
              : "Transfers can be requested once active products exist in the catalog."
          }
        />
      ) : (
        <>
          <div className="tasmac-flow-rail">
            <OperationFlow stages={stages} />
          </div>
          <div className="tasmac-op-grid">
            <OpSurface title="Transfer request">
              <form
                className="tasmac-op-form"
                aria-busy={submit.isPending}
                noValidate
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  if (!submit.isPending) submit.mutate();
                }}
              >
                <div className="tasmac-op-fields">
                  <div className="tasmac-op-route tasmac-op-span">
                    <Field
                      id="tf-src"
                      label="Source shop"
                      error={errors["sourceShopId"]}
                    >
                      <OpSelect
                        id="tf-src"
                        error={errors["sourceShopId"]}
                        value={form.sourceShopId}
                        placeholder={
                          assignedSource ? "Assigned source" : "Select source"
                        }
                        options={sources.map((x) => ({
                          value: x.id,
                          label: `${x.shop_number} · ${x.name}`,
                        }))}
                        disabled={Boolean(assignedSource)}
                        onChange={(v) => set("sourceShopId", v)}
                      />
                    </Field>
                    <span className="tasmac-op-route-arrow" aria-hidden>
                      <ArrowRight />
                    </span>
                    <Field
                      id="tf-dst"
                      label="Destination shop"
                      error={errors["destShopId"]}
                    >
                      <OpSelect
                        id="tf-dst"
                        error={errors["destShopId"]}
                        value={form.destShopId}
                        placeholder="Select destination"
                        options={dests.data
                          .filter((d) => d.id !== form.sourceShopId)
                          .map((d) => ({ value: d.id, label: d.label }))}
                        onChange={(v) => set("destShopId", v)}
                      />
                    </Field>
                  </div>
                  <Field
                    id="tf-prod"
                    label="Product"
                    error={errors["productId"]}
                  >
                    <OpSelect
                      id="tf-prod"
                      error={errors["productId"]}
                      value={form.productId}
                      placeholder="Select product"
                      options={products.data.map((p) => ({
                        value: p.id,
                        label: `${p.sku} · ${p.name} ${p.volume_ml} ml`,
                      }))}
                      onChange={(v) => set("productId", v)}
                    />
                  </Field>
                  <Field
                    id="tf-qty"
                    label="Quantity (units)"
                    error={
                      errors["quantity"] ??
                      (short
                        ? `Insufficient stock: ${balance.data?.quantity ?? 0} available`
                        : undefined)
                    }
                  >
                    <Input
                      {...errProps("tf-qty", errors["quantity"])}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={form.quantity}
                      onChange={(e) => set("quantity", e.target.value)}
                    />
                  </Field>
                  <div className="tasmac-op-span">
                    <Field
                      id="tf-reason"
                      label="Reason"
                      error={errors["reason"]}
                      hint="At least 5 characters"
                    >
                      <Textarea
                        {...errProps("tf-reason", errors["reason"])}
                        rows={2}
                        maxLength={500}
                        value={form.reason}
                        onChange={(e) => set("reason", e.target.value)}
                      />
                    </Field>
                  </div>
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
                        sourceShopId: assignedSource?.id ?? "",
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
                    disabled={
                      submit.isPending || Boolean(short) || !detailsValid
                    }
                  >
                    <ArrowLeftRight aria-hidden />
                    {submit.isPending ? "Requesting…" : "Request transfer"}
                  </Button>
                </div>
              </form>
            </OpSurface>

            <OpSurface title="Receipt preview" label="Transfer receipt preview">
              <div className="tasmac-op-context" aria-live="polite">
                {!form.sourceShopId || !form.productId ? (
                  <ContextHint>
                    Select source and product to see available stock.
                  </ContextHint>
                ) : balance.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : balance.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    Unavailable
                  </p>
                ) : (
                  <>
                    <div className="tasmac-op-identity">
                      <p className="truncate text-sm font-medium text-foreground">
                        {prod?.name ?? ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{prod?.sku}</span>
                        {src ? ` · ${src.shop_number} ${src.name}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="tasmac-metric-label text-muted-foreground">
                        Available at source
                      </p>
                      <p
                        className={
                          "tasmac-metric-value " +
                          (short ? "text-destructive" : "text-foreground")
                        }
                      >
                        {balance.data.quantity.toLocaleString("en-IN")}
                        <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                          units
                        </span>
                      </p>
                    </div>
                    <dl className="tasmac-dl">
                      <Row k="Destination">{dst ? dst.label : "—"}</Row>
                      <Row k="Requested">
                        {Number.isInteger(qty) && qty > 0
                          ? qty.toLocaleString("en-IN")
                          : "—"}
                      </Row>
                      <Row k="Remaining after dispatch">
                        <span className={short ? "text-destructive" : ""}>
                          {Number.isInteger(qty) && qty > 0
                            ? (balance.data.quantity - qty).toLocaleString(
                                "en-IN",
                              )
                            : "—"}
                        </span>
                      </Row>
                    </dl>
                    {short ? (
                      <p role="alert" className="text-xs text-destructive">
                        Insufficient stock at source for this quantity.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </OpSurface>
          </div>
        </>
      )}

      <section className="flex flex-col gap-3" aria-label="Recent transfers">
        <h2 className="tasmac-section-title">Recent transfers</h2>
        {recent.isError ? (
          <StatePanel
            tone="error"
            title="Transfers unavailable"
            description={userMessage(recent.error)}
            action={<RetryButton onClick={() => recent.refetch()} />}
          />
        ) : recent.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : recent.data.length === 0 ? (
          <StatePanel
            title="No transfers yet"
            description="Transfers involving shops in your scope will appear here."
          />
        ) : (
          <div className="tasmac-table-surface">
            <div className="overflow-x-auto">
              <table className="tasmac-inv-table">
                <thead className="text-left">
                  <tr>
                    <th className="text-center">Txn</th>
                    <th className="text-center">From</th>
                    <th className="text-center">To</th>
                    <th className="text-center">Product</th>
                    <th className="text-center">Qty</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.map((t) => (
                    <tr key={t.id}>
                      <td className="text-center">
                        <button
                          className="tasmac-txn-link"
                          onClick={() => setOpen(t.id)}
                        >
                          #{t.txn_no}
                        </button>
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
                      <td className="text-center">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <TransferSheet id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
