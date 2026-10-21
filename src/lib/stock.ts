import { z } from "zod";

/** Client mirrors of apply_stock_movement validation. PostgreSQL stays the authority. */

export const ADJUST_REASONS = [
  "audit_reconciliation",
  "breakage",
  "damage",
  "expiry",
  "other",
] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];
export const ADJUST_REASON_LABELS: Record<AdjustReason, string> = {
  audit_reconciliation: "Audit reconciliation",
  breakage: "Breakage",
  damage: "Damage",
  expiry: "Expiry",
  other: "Other write-off",
};

export const MOVEMENT_LABELS = {
  receive: "Receipt",
  issue: "Issue",
  adjust_surplus: "Surplus",
  adjust_writeoff: "Write-off",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
} as const;
export type MovementType = keyof typeof MOVEMENT_LABELS;

const quantity = z.coerce
  .number({ invalid_type_error: "Enter a whole number" })
  .int("Enter a whole number")
  .min(1, "Quantity must be at least 1")
  .max(1_000_000, "Quantity is too large");
const reference = (label: string) =>
  z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9][A-Z0-9/-]{2,39}$/,
          `${label} must be 3–40 letters, digits, / or -`,
        ),
    );
const counterparty = (label: string) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z.string().min(2, `Enter the ${label}`).max(120, `${label} is too long`),
    );
const ids = {
  shopId: z.string().uuid("Select a shop"),
  productId: z.string().uuid("Select a product"),
};

export const receiveSchema = z.object({
  ...ids,
  quantity,
  reference: reference("Delivery challan number"),
  counterparty: counterparty("source depot"),
});
export const issueSchema = z.object({
  ...ids,
  quantity,
  reference: reference("Sales register reference"),
  counterparty: counterparty("destination counter"),
});
export const adjustSchema = z
  .object({
    ...ids,
    quantity,
    direction: z.enum(["surplus", "writeoff"]),
    reason: z.enum(ADJUST_REASONS, {
      errorMap: () => ({ message: "Select a reason" }),
    }),
    reference: reference("Audit memo number"),
    justification: z
      .string()
      .trim()
      .min(20, "Justification must be at least 20 characters")
      .max(1000, "Justification is too long"),
  })
  .refine(
    (v) => v.direction === "writeoff" || v.reason === "audit_reconciliation",
    {
      message: "Surplus adjustments must be audit reconciliations",
      path: ["reason"],
    },
  );

export type StockKind = "receive" | "issue" | "adjust";

/** Signed change in stock for an operation. */
export function stockDelta(
  kind: StockKind,
  qty: number,
  direction?: "surplus" | "writeoff",
): number {
  if (kind === "receive") return qty;
  if (kind === "issue") return -qty;
  return direction === "surplus" ? qty : -qty;
}

/** Projected balance, or null when the quantity is invalid. Never shown as success. */
export function projectBalance(current: number, delta: number): number | null {
  if (!Number.isFinite(delta) || delta === 0) return null;
  return current + delta;
}

export function friendlyStockError(
  e: { code?: string; message?: string } | null | undefined,
): string {
  const code = e?.code ?? "";
  const msg = e?.message ?? "";
  if (code === "23505" && msg.includes("stock_movements_reference_key"))
    return "This reference has already been recorded for this shop and product.";
  if (code === "42501")
    return "You are not authorized to record stock for this shop.";
  if (code === "P0001" && msg && msg.length < 200) return msg;
  if (code === "23514") return "One or more values are invalid.";
  return "The stock movement was not recorded. Try again.";
}
