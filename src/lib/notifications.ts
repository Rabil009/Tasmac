import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OperationalNotification =
  Database["public"]["Tables"]["notifications"]["Row"];

async function fetchNotifications(userId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error("Notifications could not be loaded.");
  return data;
}

/**
 * Keeps the notification bell and the operational pages in sync. A new
 * notification only reaches the user it belongs to; refreshing the query cache
 * then updates any page whose data changed as part of that same transaction.
 */
export function useOperationalNotifications(userId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["notifications", userId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => fetchNotifications(userId),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey });
          void queryClient.invalidateQueries();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  async function markRead(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) await queryClient.invalidateQueries({ queryKey });
  }

  async function markAllRead() {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (!error) await queryClient.invalidateQueries({ queryKey });
  }

  return {
    ...query,
    items: query.data ?? [],
    unread: (query.data ?? []).some((item) => item.read_at === null),
    markRead,
    markAllRead,
  };
}
