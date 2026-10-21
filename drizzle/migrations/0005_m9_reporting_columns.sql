CREATE OR REPLACE VIEW public.inventory_status WITH (security_invoker = true) AS
SELECT i.id, i.shop_id, i.product_id, i.quantity_on_hand, i.safety_minimum, i.updated_at,
  p.sku, p.name AS product_name, p.category, p.volume_ml, p.packaging,
  s.shop_number, s.name AS shop_name, s.city_id, c.code AS city_code, c.name AS city_name,
  CASE WHEN st.id IS NULL THEN 'not_configured'::text
       WHEN i.quantity_on_hand <= st.critical_stock_threshold THEN 'critical'::text
       WHEN i.quantity_on_hand <= st.low_stock_threshold THEN 'low'::text
       ELSE 'healthy'::text END AS health,
  p.mrp,
  (SELECT max(m.created_at) FROM public.stock_movements m
    WHERE m.shop_id = i.shop_id AND m.product_id = i.product_id
      AND m.movement_type IN ('adjust_surplus','adjust_writeoff')) AS last_audit_at
FROM public.shop_inventory i
JOIN public.products p ON p.id = i.product_id
JOIN public.shops s ON s.id = i.shop_id
JOIN public.cities c ON c.id = s.city_id
LEFT JOIN public.app_settings st ON st.id;

CREATE OR REPLACE VIEW public.transfer_log WITH (security_invoker = true) AS
SELECT t.id, t.txn_no, t.status, t.source_shop_id, t.dest_shop_id, t.source_city_id, t.dest_city_id,
  t.source_label, t.dest_label, t.product_id, p.sku, p.name AS product_name, t.quantity, t.reason,
  t.waybill_no, t.requested_by, t.requested_at, t.updated_at,
  (SELECT e.actor_name FROM public.transfer_events e
    WHERE e.transfer_id = t.id AND e.from_status IS NULL ORDER BY e.id LIMIT 1) AS requester_name,
  p.category
FROM public.transfers t
JOIN public.products p ON p.id = t.product_id;

CREATE INDEX IF NOT EXISTS stock_movements_audit_lookup_idx
  ON public.stock_movements (shop_id, product_id, created_at DESC)
  WHERE movement_type IN ('adjust_surplus','adjust_writeoff');
