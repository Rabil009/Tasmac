ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'transfer_in';
CREATE TYPE public.transfer_status AS ENUM ('requested','approved','dispatched','received','rejected','cancelled');

ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_delta_sign;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_delta_sign CHECK (
  (movement_type::text IN ('receive','adjust_surplus','transfer_in') AND delta = quantity) OR
  (movement_type::text IN ('issue','adjust_writeoff','transfer_out') AND delta = -quantity));
ALTER TABLE public.stock_movements ADD COLUMN actor_name text;
ALTER TABLE public.stock_movements ADD COLUMN transfer_id uuid;
UPDATE public.stock_movements m SET actor_name = COALESCE(p.full_name, p.email) FROM public.profiles p WHERE p.id = m.actor_id AND m.actor_name IS NULL;

CREATE OR REPLACE FUNCTION public.actor_label(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(NULLIF(btrim(full_name), ''), email) FROM public.profiles WHERE id = _uid
$$;
REVOKE EXECUTE ON FUNCTION public.actor_label(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stamp_movement_actor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.actor_name := public.actor_label(NEW.actor_id);
  NEW.created_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.stamp_movement_actor() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stock_movements_actor BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.stamp_movement_actor();

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  source_shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  dest_shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  source_city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  dest_city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
  source_label text NOT NULL,
  dest_label text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  reason text NOT NULL,
  status public.transfer_status NOT NULL DEFAULT 'requested',
  waybill_no text,
  idempotency_key uuid NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfers_distinct_shops CHECK (source_shop_id <> dest_shop_id),
  CONSTRAINT transfers_qty CHECK (quantity BETWEEN 1 AND 1000000),
  CONSTRAINT transfers_reason CHECK (char_length(reason) BETWEEN 5 AND 500),
  CONSTRAINT transfers_waybill CHECK (
    (status IN ('dispatched','received')) = (waybill_no IS NOT NULL)
    AND (waybill_no IS NULL OR waybill_no ~ '^[A-Z0-9][A-Z0-9/-]{2,39}$'))
);
CREATE UNIQUE INDEX transfers_idem_key ON public.transfers (idempotency_key);
CREATE INDEX transfers_status_idx ON public.transfers (status, requested_at DESC);
CREATE INDEX transfers_source_idx ON public.transfers (source_shop_id);
CREATE INDEX transfers_dest_idx ON public.transfers (dest_shop_id);
CREATE INDEX transfers_cities_idx ON public.transfers (source_city_id, dest_city_id);
GRANT SELECT ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped transfer reads" ON public.transfers FOR SELECT TO authenticated
  USING (public.can_read_shop(source_shop_id) OR public.can_read_shop(dest_shop_id));

CREATE TABLE public.transfer_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE RESTRICT,
  from_status public.transfer_status,
  to_status public.transfer_status NOT NULL,
  note text,
  actor_id uuid NOT NULL,
  actor_name text,
  actor_role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfer_events_note CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500)
);
CREATE INDEX transfer_events_transfer_idx ON public.transfer_events (transfer_id, id);
GRANT SELECT ON public.transfer_events TO authenticated;
GRANT ALL ON public.transfer_events TO service_role;
ALTER TABLE public.transfer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scoped transfer event reads" ON public.transfer_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id));
CREATE TRIGGER transfer_events_immutable BEFORE UPDATE OR DELETE ON public.transfer_events
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_change();
REVOKE INSERT, UPDATE, DELETE ON public.transfers, public.transfer_events FROM authenticated, anon;

-- Shops a scoped user may name as a transfer destination (labels only).
CREATE OR REPLACE FUNCTION public.list_transfer_destinations()
RETURNS TABLE (id uuid, label text, city_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, c.code || ' / ' || s.shop_number || ' · ' || s.name, s.city_id
  FROM public.shops s JOIN public.cities c ON c.id = s.city_id
  WHERE s.is_active AND public.has_operational_access() AND NOT public.has_role(auth.uid(), 'auditor')
  ORDER BY c.code, s.shop_number
$$;
REVOKE EXECUTE ON FUNCTION public.list_transfer_destinations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_transfer_destinations() TO authenticated;

CREATE OR REPLACE FUNCTION public.log_transfer_event(_t uuid, _from public.transfer_status, _to public.transfer_status, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.transfer_events (transfer_id, from_status, to_status, note, actor_id, actor_name, actor_role)
  VALUES (_t, _from, _to, NULLIF(btrim(_note), ''), auth.uid(), public.actor_label(auth.uid()),
    (SELECT role FROM public.user_roles WHERE user_id = auth.uid()));
END $$;
REVOKE EXECUTE ON FUNCTION public.log_transfer_event(uuid, public.transfer_status, public.transfer_status, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_transfer(_source_shop_id uuid, _dest_shop_id uuid, _product_id uuid,
  _quantity integer, _reason text, _idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.transfers%ROWTYPE; v_on_hand integer; v_reason text := btrim(regexp_replace(coalesce(_reason,''), '\s+', ' ', 'g'));
  v_sc uuid; v_dc uuid; v_sl text; v_dl text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to request a transfer' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_t FROM public.transfers WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF v_t.requested_by <> auth.uid() THEN RAISE EXCEPTION 'Submission key already used' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('id', v_t.id, 'txn_no', v_t.txn_no, 'replayed', true);
  END IF;
  IF NOT public.can_operate_shop(_source_shop_id) THEN
    RAISE EXCEPTION 'You are not authorized to transfer stock from this shop' USING ERRCODE = '42501';
  END IF;
  IF _source_shop_id = _dest_shop_id THEN RAISE EXCEPTION 'Source and destination must be different shops'; END IF;
  SELECT s.city_id, c.code || ' / ' || s.shop_number || ' · ' || s.name INTO v_sc, v_sl
    FROM public.shops s JOIN public.cities c ON c.id = s.city_id WHERE s.id = _source_shop_id AND s.is_active;
  SELECT s.city_id, c.code || ' / ' || s.shop_number || ' · ' || s.name INTO v_dc, v_dl
    FROM public.shops s JOIN public.cities c ON c.id = s.city_id WHERE s.id = _dest_shop_id AND s.is_active;
  IF v_sc IS NULL OR v_dc IS NULL THEN RAISE EXCEPTION 'Both shops must exist and be active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND is_active) THEN RAISE EXCEPTION 'Product must exist and be active'; END IF;
  IF _quantity IS NULL OR _quantity < 1 OR _quantity > 1000000 THEN RAISE EXCEPTION 'Quantity must be a whole number between 1 and 1,000,000'; END IF;
  IF char_length(v_reason) < 5 OR char_length(v_reason) > 500 THEN RAISE EXCEPTION 'Reason must be 5–500 characters'; END IF;
  SELECT quantity_on_hand INTO v_on_hand FROM public.shop_inventory WHERE shop_id = _source_shop_id AND product_id = _product_id;
  IF coalesce(v_on_hand, 0) < _quantity THEN RAISE EXCEPTION 'Insufficient stock: % available', coalesce(v_on_hand, 0); END IF;
  INSERT INTO public.transfers (source_shop_id, dest_shop_id, source_city_id, dest_city_id, source_label, dest_label,
    product_id, quantity, reason, idempotency_key, requested_by)
  VALUES (_source_shop_id, _dest_shop_id, v_sc, v_dc, left(v_sl, 120), left(v_dl, 120), _product_id, _quantity, v_reason,
    _idempotency_key, auth.uid())
  RETURNING * INTO v_t;
  PERFORM public.log_transfer_event(v_t.id, NULL, 'requested', v_reason);
  RETURN jsonb_build_object('id', v_t.id, 'txn_no', v_t.txn_no, 'replayed', false);
END $$;

CREATE OR REPLACE FUNCTION public.transition_transfer(_transfer_id uuid, _action text, _note text, _waybill_no text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.transfers%ROWTYPE; v_inv public.shop_inventory%ROWTYPE; v_to public.transfer_status;
  v_note text := NULLIF(btrim(coalesce(_note, '')), ''); v_wb text := NULLIF(upper(btrim(coalesce(_waybill_no, ''))), '');
  v_role public.app_role;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_operational_access() THEN RAISE EXCEPTION 'Sign in to update transfers' USING ERRCODE = '42501'; END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN RAISE EXCEPTION 'Note must be at most 500 characters'; END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = auth.uid();
  SELECT * INTO v_t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND OR NOT (public.can_read_shop(v_t.source_shop_id) OR public.can_read_shop(v_t.dest_shop_id)) THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;

  IF _action = 'approve' OR _action = 'reject' THEN
    IF NOT public.is_state_admin() THEN RAISE EXCEPTION 'Only a State Administrator can approve or reject transfers' USING ERRCODE = '42501'; END IF;
    IF v_t.status <> 'requested' THEN RAISE EXCEPTION 'Only requested transfers can be approved or rejected (currently %)', v_t.status; END IF;
    IF _action = 'reject' AND (v_note IS NULL OR char_length(v_note) < 5) THEN RAISE EXCEPTION 'A rejection note of at least 5 characters is required'; END IF;
    v_to := CASE WHEN _action = 'approve' THEN 'approved'::public.transfer_status ELSE 'rejected'::public.transfer_status END;
  ELSIF _action = 'cancel' THEN
    IF v_t.requested_by <> auth.uid() THEN RAISE EXCEPTION 'Only the requester can cancel this transfer' USING ERRCODE = '42501'; END IF;
    IF v_t.status <> 'requested' THEN RAISE EXCEPTION 'Only requested transfers can be cancelled (currently %)', v_t.status; END IF;
    v_to := 'cancelled';
  ELSIF _action = 'dispatch' THEN
    IF NOT public.can_operate_shop(v_t.source_shop_id) THEN RAISE EXCEPTION 'You are not authorized to dispatch from the source shop' USING ERRCODE = '42501'; END IF;
    IF v_t.status <> 'approved' THEN RAISE EXCEPTION 'Only approved transfers can be dispatched (currently %)', v_t.status; END IF;
    IF v_wb IS NULL OR v_wb !~ '^[A-Z0-9][A-Z0-9/-]{2,39}$' THEN RAISE EXCEPTION 'Waybill number must be 3–40 letters, digits, / or -'; END IF;
    SELECT * INTO v_inv FROM public.shop_inventory WHERE shop_id = v_t.source_shop_id AND product_id = v_t.product_id FOR UPDATE;
    IF NOT FOUND OR v_inv.quantity_on_hand < v_t.quantity THEN
      RAISE EXCEPTION 'Insufficient stock at source: % available', coalesce(v_inv.quantity_on_hand, 0);
    END IF;
    UPDATE public.shop_inventory SET quantity_on_hand = quantity_on_hand - v_t.quantity WHERE id = v_inv.id;
    INSERT INTO public.stock_movements (movement_type, shop_id, city_id, product_id, quantity, delta, balance_before, balance_after,
      reference, counterparty, idempotency_key, actor_id, actor_role, transfer_id)
    VALUES ('transfer_out', v_t.source_shop_id, v_t.source_city_id, v_t.product_id, v_t.quantity, -v_t.quantity,
      v_inv.quantity_on_hand, v_inv.quantity_on_hand - v_t.quantity, 'TRF-' || v_t.txn_no, v_t.dest_label, gen_random_uuid(),
      auth.uid(), v_role, v_t.id);
    v_to := 'dispatched';
  ELSIF _action = 'receive' THEN
    IF NOT public.can_operate_shop(v_t.dest_shop_id) THEN RAISE EXCEPTION 'You are not authorized to receive at the destination shop' USING ERRCODE = '42501'; END IF;
    IF v_t.status <> 'dispatched' THEN RAISE EXCEPTION 'Only dispatched transfers can be received (currently %)', v_t.status; END IF;
    INSERT INTO public.shop_inventory (shop_id, product_id) VALUES (v_t.dest_shop_id, v_t.product_id) ON CONFLICT (shop_id, product_id) DO NOTHING;
    SELECT * INTO v_inv FROM public.shop_inventory WHERE shop_id = v_t.dest_shop_id AND product_id = v_t.product_id FOR UPDATE;
    UPDATE public.shop_inventory SET quantity_on_hand = quantity_on_hand + v_t.quantity WHERE id = v_inv.id;
    INSERT INTO public.stock_movements (movement_type, shop_id, city_id, product_id, quantity, delta, balance_before, balance_after,
      reference, counterparty, idempotency_key, actor_id, actor_role, transfer_id)
    VALUES ('transfer_in', v_t.dest_shop_id, v_t.dest_city_id, v_t.product_id, v_t.quantity, v_t.quantity,
      v_inv.quantity_on_hand, v_inv.quantity_on_hand + v_t.quantity, 'TRF-' || v_t.txn_no, v_t.source_label, gen_random_uuid(),
      auth.uid(), v_role, v_t.id);
    v_to := 'received';
  ELSE
    RAISE EXCEPTION 'Unknown transfer action';
  END IF;

  UPDATE public.transfers SET status = v_to, updated_at = now(),
    waybill_no = CASE WHEN v_to = 'dispatched' THEN v_wb ELSE waybill_no END
  WHERE id = v_t.id;
  PERFORM public.log_transfer_event(v_t.id, v_t.status, v_to,
    CASE WHEN v_to = 'dispatched' THEN concat_ws(' · ', 'Waybill ' || v_wb, v_note) ELSE v_note END);
  RETURN jsonb_build_object('id', v_t.id, 'txn_no', v_t.txn_no, 'status', v_to);
END $$;
REVOKE EXECUTE ON FUNCTION public.request_transfer(uuid, uuid, uuid, integer, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_transfer(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_transfer(uuid, uuid, uuid, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_transfer(uuid, text, text, text) TO authenticated;

CREATE VIEW public.transfer_log WITH (security_invoker = true) AS
SELECT t.id, t.txn_no, t.status, t.source_shop_id, t.dest_shop_id, t.source_city_id, t.dest_city_id,
  t.source_label, t.dest_label, t.product_id, p.sku, p.name AS product_name, t.quantity, t.reason, t.waybill_no,
  t.requested_by, t.requested_at, t.updated_at
FROM public.transfers t JOIN public.products p ON p.id = t.product_id;
GRANT SELECT ON public.transfer_log TO authenticated;
GRANT ALL ON public.transfer_log TO service_role;

CREATE OR REPLACE VIEW public.stock_movement_log WITH (security_invoker = true) AS
SELECT m.id, m.txn_no, m.movement_type, m.shop_id, m.city_id, m.product_id, m.quantity, m.delta,
  m.balance_before, m.balance_after, m.reference, m.counterparty, m.adjust_reason, m.justification,
  m.actor_id, m.actor_role, m.created_at,
  p.sku, p.name AS product_name, s.shop_number, s.name AS shop_name, c.name AS city_name,
  m.actor_name, m.transfer_id
FROM public.stock_movements m
JOIN public.products p ON p.id = m.product_id
JOIN public.shops s ON s.id = m.shop_id
JOIN public.cities c ON c.id = m.city_id;
