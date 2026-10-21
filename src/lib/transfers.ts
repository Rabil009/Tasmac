import { z } from "zod";
import type { AppRole } from "./rbac";

/** Client mirrors of request_transfer / transition_transfer. PostgreSQL is the authority. */

export const TRANSFER_STATUSES = [
  "requested",
  "approved",
  "dispatched",
  "received",
  "rejected",
  "cancelled",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export const STATUS_LABELS: Record<TransferStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  dispatched: "Dispatched",
  received: "Received",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export type TransferAction =
  "approve" | "reject" | "cancel" | "dispatch" | "receive";

/** The only legal transitions; everything else must fail. */
export const TRANSITIONS: Record<
  TransferAction,
  { from: TransferStatus; to: TransferStatus }
> = {
  approve: { from: "requested", to: "approved" },
  reject: { from: "requested", to: "rejected" },
  cancel: { from: "requested", to: "cancelled" },
  dispatch: { from: "approved", to: "dispatched" },
  receive: { from: "dispatched", to: "received" },
};

export function nextStatus(
  status: TransferStatus,
  action: TransferAction,
): TransferStatus | null {
  return TRANSITIONS[action].from === status ? TRANSITIONS[action].to : null;
}

export interface ActionContext {
  role: AppRole | null;
  userId: string;
  requestedBy: string;
  status: TransferStatus;
  canOperateSource: boolean;
  canOperateDest: boolean;
}

/** UI mirror of who may perform each action; the RPC re-checks everything. */
export function availableActions(c: ActionContext): TransferAction[] {
  if (!c.role) return [];
  const out: TransferAction[] = [];
  if (c.status === "requested") {
    if (c.role === "state_admin") out.push("approve", "reject");
    if (c.requestedBy === c.userId) out.push("cancel");
  }
  if (c.status === "approved" && c.canOperateSource) out.push("dispatch");
  if (c.status === "dispatched" && c.canOperateDest) out.push("receive");
  return out;
}

export const transferRequestSchema = z
  .object({
    sourceShopId: z.string().uuid("Select the source shop"),
    destShopId: z.string().uuid("Select the destination shop"),
    productId: z.string().uuid("Select a product"),
    quantity: z.coerce
      .number({ invalid_type_error: "Enter a whole number" })
      .int("Enter a whole number")
      .min(1, "Quantity must be at least 1")
      .max(1_000_000, "Quantity is too large"),
    reason: z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, " "))
      .pipe(
        z
          .string()
          .min(5, "Reason must be at least 5 characters")
          .max(500, "Reason is too long"),
      ),
  })
  .refine((v) => v.sourceShopId !== v.destShopId, {
    message: "Source and destination must be different shops",
    path: ["destShopId"],
  });

export const waybillSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9][A-Z0-9/-]{2,39}$/,
        "Waybill must be 3–40 letters, digits, / or -",
      ),
  );

export const rejectNoteSchema = z
  .string()
  .trim()
  .min(5, "A rejection note of at least 5 characters is required")
  .max(500);

export function friendlyTransferError(
  e: { code?: string; message?: string } | null | undefined,
): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "42501")
    return msg && msg.length < 160
      ? msg
      : "You are not authorized to perform this action.";
  if (code === "P0001" && msg && msg.length < 200) return msg;
  if (code === "23514") return "One or more values are invalid.";
  return "The transfer could not be updated. Try again.";
}
