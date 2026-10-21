import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { userMessage } from "@/lib/app-error";
import { useState } from "react";
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
import { StatePanel } from "@/components/shell/states";
import { Field, errProps } from "@/components/shell/form-bits";
import { useAccess } from "@/components/shell/feature-page";
import { Row } from "@/components/stock/ops-bits";
import type { ReactNode } from "react";
import { ROLE_LABELS, type AppRole } from "@/lib/rbac";
import { fetchShops } from "@/lib/master-data.queries";
import {
  ADJUST_REASON_LABELS,
  MOVEMENT_LABELS,
  type AdjustReason,
  type MovementType,
} from "@/lib/stock";
import {
  STATUS_LABELS,
  availableActions,
  friendlyTransferError,
  rejectNoteSchema,
  waybillSchema,
  type TransferAction,
  type TransferStatus,
} from "@/lib/transfers";
import { fetchMovement, fetchTransfer } from "@/lib/transfers.queries";
import {
  toast,
  Button,
  Input,
  Textarea,
  Skeleton,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@4rged-ai/platform";

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN") : "—";
const roleLabel = (r: string | null | undefined) =>
  r ? (ROLE_LABELS[r as AppRole] ?? r) : "—";

export function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "requested") as TransferStatus;
  return (
    <span className="tasmac-health" data-status={s}>
      <span className="tasmac-health-dot" aria-hidden />
      {STATUS_LABELS[s] ?? s}
    </span>
  );
}

const ACTION_COPY: Record<
  TransferAction,
  { label: string; confirm: string; destructive?: boolean }
> = {
  approve: { label: "Approve", confirm: "Approve this transfer for dispatch?" },
  reject: {
    label: "Reject",
    confirm:
      "Reject this transfer? A note is required and this cannot be undone.",
    destructive: true,
  },
  cancel: {
    label: "Cancel request",
    confirm: "Cancel this transfer request? This cannot be undone.",
    destructive: true,
  },
  dispatch: {
    label: "Dispatch",
    confirm:
      "Dispatch now? Stock is deducted from the source shop immediately.",
  },
  receive: {
    label: "Confirm receipt",
    confirm:
      "Confirm receipt? Stock is added to the destination shop immediately.",
  },
};

export function TransferSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const access = useAccess();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["transfers", "detail", id],
    queryFn: () => fetchTransfer(id!),
    enabled: Boolean(id),
  });
  const shops = useQuery({
    queryKey: ["shops"],
    queryFn: fetchShops,
    enabled: Boolean(id),
  });
  const [action, setAction] = useState<TransferAction | null>(null);
  const [note, setNote] = useState("");
  const [waybill, setWaybill] = useState("");
  const [err, setErr] = useState<string | undefined>();

  const t = q.data?.transfer;
  const operable = (shopId: string | null) =>
    Boolean(shopId && shops.data?.some((s) => s.id === shopId));
  const actions = t
    ? availableActions({
        role: access.role,
        userId: access.userId,
        requestedBy: t.requested_by ?? "",
        status: (t.status ?? "requested") as TransferStatus,
        canOperateSource: operable(t.source_shop_id),
        canOperateDest: operable(t.dest_shop_id),
      })
    : [];

  const run = useMutation({
    mutationFn: async (a: TransferAction) => {
      let wb: string | null = null;
      if (a === "dispatch") {
        const p = waybillSchema.safeParse(waybill);
        if (!p.success) {
          setErr(p.error.issues[0]?.message);
          throw new Error("Enter a valid waybill number.");
        }
        wb = p.data;
      }
      if (a === "reject") {
        const p = rejectNoteSchema.safeParse(note);
        if (!p.success) {
          setErr(p.error.issues[0]?.message);
          throw new Error("Enter a rejection note.");
        }
      }
      setErr(undefined);
      const { data, error } = await supabase.rpc("transition_transfer", {
        _transfer_id: id!,
        _action: a,
        _note: note.trim(),
        _waybill_no: wb ?? "",
      });
      if (error) throw new Error(friendlyTransferError(error));
      const out = data as { status?: string } | null;
      if (!out?.status)
        throw new Error(
          "The update was not confirmed. Refresh before retrying.",
        );
      return out.status;
    },
    onSuccess: (status) => {
      toast.success(
        `Transfer ${STATUS_LABELS[status as TransferStatus]?.toLowerCase() ?? "updated"}`,
      );
      setAction(null);
      setNote("");
      setWaybill("");
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (e) => toast.error(userMessage(e)),
  });

  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{t ? `Transfer #${t.txn_no}` : "Transfer"}</SheetTitle>
          <SheetDescription>
            {t
              ? `${t.sku} · ${t.product_name}`
              : "Transfer details and timeline"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 p-4">
          {q.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : q.isError ? (
            <StatePanel
              tone="error"
              title="Transfer unavailable"
              description={userMessage(q.error)}
            />
          ) : !t ? (
            <StatePanel
              title="Transfer not found"
              description="This transfer does not exist or is outside your scope."
            />
          ) : (
            <>
              <ol className="tasmac-route-spine" aria-label="Transfer route">
                <li data-node="source">
                  <span className="tasmac-spine-dot" aria-hidden />
                  <span className="tasmac-spine-k">Source</span>
                  <span className="tasmac-spine-v">{t.source_label}</span>
                </li>
                <li
                  data-node="status"
                  data-active={t.status !== "received" ? "true" : undefined}
                >
                  <span className="tasmac-spine-dot" aria-hidden />
                  <span className="tasmac-spine-k">Current status</span>
                  <span className="tasmac-spine-v">
                    <StatusBadge status={t.status} />
                  </span>
                </li>
                <li
                  data-node="dest"
                  data-reached={t.status === "received" ? "true" : undefined}
                >
                  <span className="tasmac-spine-dot" aria-hidden />
                  <span className="tasmac-spine-k">Destination</span>
                  <span className="tasmac-spine-v">{t.dest_label}</span>
                </li>
              </ol>
              <Group title="Product and quantity">
                <Row k="Product">{t.product_name}</Row>
                <Row k="SKU" mono>
                  {t.sku}
                </Row>
                <Row k="Quantity">
                  {t.quantity?.toLocaleString("en-IN")} units
                </Row>
                <Row k="Waybill" mono>
                  {t.waybill_no ?? "—"}
                </Row>
              </Group>
              <Group title="Reason" text>
                <div className="px-3.5 py-2.5 text-sm text-foreground">
                  {t.reason}
                </div>
              </Group>

              {actions.length > 0 ? (
                <section
                  className="tasmac-op-surface order-last flex flex-col gap-3 p-4"
                  aria-label="Actions"
                >
                  {actions.includes("dispatch") ? (
                    <Field id="tr-wb" label="Waybill number" error={err}>
                      <Input
                        {...errProps("tr-wb", err)}
                        maxLength={40}
                        value={waybill}
                        onChange={(e) => setWaybill(e.target.value)}
                      />
                    </Field>
                  ) : null}
                  <Field
                    id="tr-note"
                    label={
                      actions.includes("reject")
                        ? "Note (required to reject)"
                        : "Note"
                    }
                    optional={!actions.includes("reject")}
                    error={actions.includes("dispatch") ? undefined : err}
                  >
                    <Textarea
                      {...errProps("tr-note", err)}
                      rows={2}
                      maxLength={500}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <Button
                        size="lg"
                        key={a}
                        variant={
                          ACTION_COPY[a].destructive ? "outline" : "default"
                        }
                        className={
                          "tasmac-btn tasmac-btn-dialog " +
                          (ACTION_COPY[a].destructive
                            ? "text-destructive"
                            : "tasmac-btn-primary")
                        }
                        disabled={run.isPending}
                        onClick={() => setAction(a)}
                      >
                        {ACTION_COPY[a].label}
                      </Button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section aria-label="Timeline" className="flex flex-col gap-2">
                <h3 className="tasmac-section-title">Timeline</h3>
                {q.data.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No recorded events.
                  </p>
                ) : (
                  <ol className="relative ml-2 border-l border-border">
                    {q.data.events.map((e) => (
                      <li key={e.id} className="mb-4 ml-4 last:mb-0">
                        <span
                          aria-hidden
                          className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-muted-foreground"
                        />
                        <div className="flex items-center gap-2">
                          <StatusBadge status={e.to_status} />
                          <time className="text-xs text-muted-foreground">
                            {fmt(e.created_at)}
                          </time>
                        </div>
                        <p className="mt-1 text-sm">
                          {e.actor_name ?? "Unknown user"}{" "}
                          <span className="text-muted-foreground">
                            · {roleLabel(e.actor_role)}
                          </span>
                        </p>
                        {e.note ? (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {e.note}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
        <AlertDialog
          open={Boolean(action)}
          onOpenChange={(o) => !o && !run.isPending && setAction(null)}
        >
          <AlertDialogContent hideClose>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {action ? ACTION_COPY[action].label : ""}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {action ? ACTION_COPY[action].confirm : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <DialogClose asChild>
                <Button
                  size="lg"
                  variant="outline"
                  className="tasmac-btn tasmac-btn-dialog"
                  disabled={run.isPending}
                >
                  Back
                </Button>
              </DialogClose>
              <Button
                size="lg"
                disabled={run.isPending}
                variant={
                  action && ACTION_COPY[action].destructive
                    ? "destructive"
                    : "default"
                }
                className={
                  "tasmac-btn tasmac-btn-dialog min-w-[7rem] " +
                  (action && ACTION_COPY[action].destructive
                    ? ""
                    : "tasmac-btn-primary")
                }
                onClick={(e) => {
                  e.preventDefault();
                  if (action) run.mutate(action);
                }}
              >
                {run.isPending ? "Working…" : "Confirm"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

export function MovementSheet({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["stock_movements", "detail", id],
    queryFn: () => fetchMovement(id!),
    enabled: Boolean(id),
  });
  const m = q.data;
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{m ? `Movement #${m.txn_no}` : "Movement"}</SheetTitle>
          <SheetDescription>
            {m?.movement_type
              ? MOVEMENT_LABELS[m.movement_type as MovementType]
              : "Stock movement details"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 p-4">
          {q.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : q.isError ? (
            <StatePanel
              tone="error"
              title="Movement unavailable"
              description={userMessage(q.error)}
            />
          ) : !m ? (
            <StatePanel
              title="Movement not found"
              description="This movement does not exist or is outside your scope."
            />
          ) : (
            <>
              <Group title="Balance change">
                <Row k="Previous">
                  {m.balance_before?.toLocaleString("en-IN")}
                </Row>
                <Row k="Transacted">
                  <span
                    className={
                      (m.delta ?? 0) < 0 ? "text-destructive" : "text-success"
                    }
                  >
                    {(m.delta ?? 0) > 0 ? "+" : ""}
                    {m.delta?.toLocaleString("en-IN")}
                  </span>
                </Row>
                <Row k="Resulting">
                  <span className="font-semibold">
                    {m.balance_after?.toLocaleString("en-IN")}
                  </span>
                </Row>
              </Group>
              <Group title="Document">
                <Row k="Reference document" mono>
                  {m.reference}
                </Row>
                <Row k={(m.delta ?? 0) < 0 ? "Destination" : "Source"}>
                  {m.counterparty ?? "—"}
                </Row>
                {m.adjust_reason ? (
                  <Row k="Reason">
                    {ADJUST_REASON_LABELS[m.adjust_reason as AdjustReason]}
                  </Row>
                ) : null}
              </Group>
              {m.justification ? (
                <Group title="Justification" text>
                  <div className="px-3.5 py-2.5 text-sm text-foreground">
                    {m.justification}
                  </div>
                </Group>
              ) : null}
              <Group title="Location">
                <Row k="Shop">
                  {m.shop_number} {m.shop_name} · {m.city_name}
                </Row>
                <Row k="Product">
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.sku}
                  </span>{" "}
                  {m.product_name}
                </Row>
              </Group>
              <Group title="Audit">
                <Row k="Recorded by">{m.actor_name ?? "Unknown user"}</Row>
                <Row k="Role">{roleLabel(m.actor_role)}</Row>
                <Row k="Timestamp">{fmt(m.created_at)}</Row>
              </Group>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Group({
  title,
  text,
  children,
}: {
  title: string;
  text?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {text ? (
        <div className="tasmac-dl">{children}</div>
      ) : (
        <dl className="tasmac-dl">{children}</dl>
      )}
    </section>
  );
}
