import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PAGE_SIZE } from "./catalog";
import { safeTerm } from "./inventory.queries";
import type { TransferStatus } from "./transfers";

export type TransferRow = Database["public"]["Views"]["transfer_log"]["Row"];
export type TransferEvent =
  Database["public"]["Tables"]["transfer_events"]["Row"];
export type MovementRow =
  Database["public"]["Views"]["stock_movement_log"]["Row"];
type MovementType = Database["public"]["Enums"]["movement_type"];

export async function fetchDestinations() {
  const { data, error } = await supabase.rpc("list_transfer_destinations");
  if (error) throw new Error("Destination shops could not be loaded.");
  return data ?? [];
}

export interface TransferFilters {
  q: string;
  city: string;
  shop: string;
  status: TransferStatus | "";
  page: number;
}

const uuidRe = /^[0-9a-f-]{36}$/;

export async function fetchTransfers(f: TransferFilters) {
  let req = supabase.from("transfer_log").select("*", { count: "exact" });
  const term = safeTerm(f.q);
  if (term)
    req = req.or(
      `sku.ilike.*${term}*,product_name.ilike.*${term}*,source_label.ilike.*${term}*,dest_label.ilike.*${term}*,waybill_no.ilike.*${term}*`,
    );
  if (uuidRe.test(f.city))
    req = req.or(`source_city_id.eq.${f.city},dest_city_id.eq.${f.city}`);
  if (uuidRe.test(f.shop))
    req = req.or(`source_shop_id.eq.${f.shop},dest_shop_id.eq.${f.shop}`);
  if (f.status) req = req.eq("status", f.status);
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, error, count } = await req
    .order("requested_at", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Transfers could not be loaded.");
  return { rows: data ?? [], total: count ?? 0 };
}

export interface MovementFilters {
  q: string;
  city: string;
  shop: string;
  type: MovementType | "";
  page: number;
}

export async function fetchMovements(f: MovementFilters) {
  let req = supabase.from("stock_movement_log").select("*", { count: "exact" });
  const term = safeTerm(f.q);
  if (term)
    req = req.or(
      `sku.ilike.*${term}*,product_name.ilike.*${term}*,reference.ilike.*${term}*,shop_name.ilike.*${term}*`,
    );
  if (uuidRe.test(f.city)) req = req.eq("city_id", f.city);
  if (uuidRe.test(f.shop)) req = req.eq("shop_id", f.shop);
  if (f.type) req = req.eq("movement_type", f.type);
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, error, count } = await req
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error("Movements could not be loaded.");
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchTransfer(id: string) {
  const [t, ev] = await Promise.all([
    supabase.from("transfer_log").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("transfer_events")
      .select("*")
      .eq("transfer_id", id)
      .order("id"),
  ]);
  if (t.error || ev.error) throw new Error("Transfer could not be loaded.");
  return { transfer: t.data, events: ev.data ?? [] };
}

export async function fetchMovement(id: string) {
  const { data, error } = await supabase
    .from("stock_movement_log")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Movement could not be loaded.");
  return data;
}

export async function fetchRecentTransfers() {
  const { data, error } = await supabase
    .from("transfer_log")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(10);
  if (error) throw new Error("Recent transfers could not be loaded.");
  return data ?? [];
}
