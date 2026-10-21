import { supabase } from "@/integrations/supabase/client";
import type { InventoryRow } from "./inventory.queries";
import type { MovementRow, TransferRow } from "./transfers.queries";

/** Upper bound on rows aggregated in the browser; exceeding it is reported, never silently truncated. */
export const ROW_CAP = 20000;
const CHUNK = 1000;

async function all<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  label: string,
) {
  const out: T[] = [];
  for (let from = 0; from < ROW_CAP; from += CHUNK) {
    const { data, error } = await build(from, from + CHUNK - 1);
    if (error) throw new Error(`${label} could not be loaded.`);
    out.push(...(data ?? []));
    if (!data || data.length < CHUNK) return { rows: out, capped: false };
  }
  return { rows: out, capped: true };
}

/** All RLS-scoped inventory lines (current state; not time-dependent). */
export const fetchAllInventory = () =>
  all<InventoryRow>(
    (a, b) =>
      supabase
        .from("inventory_status")
        .select("*")
        .order("sku")
        .order("id")
        .range(a, b),
    "Inventory",
  );

/** All RLS-scoped movements since an instant (newest first). */
export const fetchAllMovements = (since: Date | null) =>
  all<MovementRow>((a, b) => {
    let q = supabase.from("stock_movement_log").select("*");
    if (since) q = q.gte("created_at", since.toISOString());
    return q.order("created_at", { ascending: false }).order("id").range(a, b);
  }, "Movements");

/** All RLS-scoped transfers requested since an instant (newest first). */
export const fetchAllTransfers = (since: Date | null) =>
  all<TransferRow>((a, b) => {
    let q = supabase.from("transfer_log").select("*");
    if (since) q = q.gte("requested_at", since.toISOString());
    return q
      .order("requested_at", { ascending: false })
      .order("id")
      .range(a, b);
  }, "Transfers");

export const analyticsKeys = {
  inventory: ["analytics", "inventory"] as const,
  movements: (tf: string) => ["analytics", "movements", tf] as const,
  transfers: (tf: string) => ["analytics", "transfers", tf] as const,
};
