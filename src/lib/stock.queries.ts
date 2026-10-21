import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { MovementType } from "./stock";

export type MovementRow =
  Database["public"]["Views"]["stock_movement_log"]["Row"];

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  volume_ml: number;
}

export async function fetchActiveProducts(): Promise<ProductOption[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, sku, name, volume_ml")
    .eq("is_active", true)
    .order("name")
    .limit(2000);
  if (error) throw new Error("Products could not be loaded.");
  return data;
}

/** Current balance read from the authoritative table (RLS-scoped). 0 when no row exists yet. */
export async function fetchBalance(shopId: string, productId: string) {
  const { data, error } = await supabase
    .from("inventory_status")
    .select("quantity_on_hand, safety_minimum, health")
    .eq("shop_id", shopId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new Error("Current stock could not be loaded.");
  return {
    quantity: data?.quantity_on_hand ?? 0,
    safetyMinimum: data?.safety_minimum ?? 0,
    health: data?.health ?? null,
    exists: Boolean(data),
  };
}

export async function fetchRecentMovements(
  types: readonly MovementType[],
): Promise<MovementRow[]> {
  const { data, error } = await supabase
    .from("stock_movement_log")
    .select("*")
    .in("movement_type", types as MovementType[])
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error("Recent movements could not be loaded.");
  return data ?? [];
}
