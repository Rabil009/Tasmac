CREATE INDEX IF NOT EXISTS stock_movements_city_id_idx ON public.stock_movements (city_id);
CREATE INDEX IF NOT EXISTS transfers_dest_city_id_idx ON public.transfers (dest_city_id);
CREATE INDEX IF NOT EXISTS transfers_product_id_idx ON public.transfers (product_id);
