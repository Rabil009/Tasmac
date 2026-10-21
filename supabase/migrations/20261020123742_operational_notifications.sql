-- Notifications are derived from the immutable operational audit records. This
-- keeps the user-facing feed aligned with the actual stock, transfer and access
-- changes that committed in the same transaction.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  category text not null check (category in ('stock', 'transfer', 'access', 'master_data')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 500),
  href text not null check (href like '/%'),
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key)
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
revoke insert, delete on public.notifications from authenticated, anon;

create policy "Users read their notifications"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy "Users mark their notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create or replace function public.guard_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $notification_guard$
begin
  if new.recipient_id is distinct from old.recipient_id
    or new.event_key is distinct from old.event_key
    or new.category is distinct from old.category
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.href is distinct from old.href
    or new.metadata is distinct from old.metadata
    or new.created_at is distinct from old.created_at then
    raise exception 'Notifications are immutable except for read status';
  end if;
  return new;
end;
$notification_guard$;

create trigger notifications_guard
before update on public.notifications
for each row execute function public.guard_notification_update();

create or replace function public.create_notification(
  _recipient_id uuid,
  _event_key text,
  _category text,
  _title text,
  _body text,
  _href text,
  _metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $create_notification$
begin
  if _recipient_id is null then
    return;
  end if;
  -- Historical imports can retain an actor/requester identifier after its
  -- auth account was removed. A missing recipient must never block the
  -- operational transaction that produced the event.
  if not exists (select 1 from auth.users where id = _recipient_id) then
    return;
  end if;

  insert into public.notifications (
    recipient_id, event_key, category, title, body, href, metadata
  ) values (
    _recipient_id, _event_key, _category, _title, _body, _href,
    coalesce(_metadata, '{}'::jsonb)
  ) on conflict (recipient_id, event_key) do nothing;
end;
$create_notification$;

create or replace function public.notify_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $stock_notification$
declare
  product_label text;
  shop_label text;
  action_label text;
begin
  -- Transfer status events carry the clearer notification for transfer stock.
  if new.transfer_id is not null then
    return null;
  end if;

  select p.sku || ' · ' || p.name, s.shop_number || ' · ' || s.name
    into product_label, shop_label
    from public.products p
    join public.shops s on s.id = new.shop_id
    where p.id = new.product_id;

  action_label := case new.movement_type::text
    when 'receive' then 'Stock received'
    when 'issue' then 'Stock issued'
    when 'adjust_surplus' then 'Stock adjusted up'
    when 'adjust_writeoff' then 'Stock written off'
    else 'Stock updated'
  end;

  perform public.create_notification(
    new.actor_id,
    'stock:' || new.id::text,
    'stock',
    action_label,
    coalesce(product_label, 'Stock item') || ' · ' || new.quantity::text || ' units at ' || coalesce(shop_label, 'shop'),
    '/tracking',
    jsonb_build_object('movement_id', new.id, 'txn_no', new.txn_no, 'shop_id', new.shop_id, 'product_id', new.product_id)
  );
  return null;
end;
$stock_notification$;

create trigger stock_movements_notify
after insert on public.stock_movements
for each row execute function public.notify_stock_movement();

create or replace function public.notify_transfer_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $transfer_notification$
declare
  t public.transfers%rowtype;
  uid uuid;
  title_text text;
  body_text text;
begin
  select * into t from public.transfers where id = new.transfer_id;
  if not found then
    return null;
  end if;

  title_text := 'Transfer #' || t.txn_no::text || ' ' || new.to_status::text;
  body_text := t.source_label || ' → ' || t.dest_label || ' · ' || t.quantity::text || ' units';

  -- The requester always receives the outcome, including a confirmation that
  -- their own request was recorded.
  perform public.create_notification(
    t.requested_by,
    'transfer:' || new.id::text,
    'transfer', title_text, body_text, '/tracking',
    jsonb_build_object('transfer_id', t.id, 'event_id', new.id, 'status', new.to_status)
  );

  if new.to_status = 'requested' then
    for uid in
      select r.user_id
      from public.user_roles r
      join public.profiles p on p.id = r.user_id
      where r.role = 'state_admin'::public.app_role and p.is_active
    loop
      perform public.create_notification(uid, 'transfer:' || new.id::text, 'transfer', title_text, body_text, '/tracking',
        jsonb_build_object('transfer_id', t.id, 'event_id', new.id, 'status', new.to_status));
    end loop;
  elsif new.to_status in ('approved', 'rejected', 'cancelled') then
    select manager_id into uid from public.shops where id = t.source_shop_id;
    perform public.create_notification(uid, 'transfer:' || new.id::text, 'transfer', title_text, body_text, '/tracking',
      jsonb_build_object('transfer_id', t.id, 'event_id', new.id, 'status', new.to_status));
  elsif new.to_status = 'dispatched' then
    select manager_id into uid from public.shops where id = t.dest_shop_id;
    perform public.create_notification(uid, 'transfer:' || new.id::text, 'transfer', title_text, body_text, '/tracking',
      jsonb_build_object('transfer_id', t.id, 'event_id', new.id, 'status', new.to_status));
  elsif new.to_status = 'received' then
    select manager_id into uid from public.shops where id = t.source_shop_id;
    perform public.create_notification(uid, 'transfer:' || new.id::text, 'transfer', title_text, body_text, '/tracking',
      jsonb_build_object('transfer_id', t.id, 'event_id', new.id, 'status', new.to_status));
  end if;
  return null;
end;
$transfer_notification$;

create trigger transfer_events_notify
after insert on public.transfer_events
for each row execute function public.notify_transfer_event();

create or replace function public.notify_access_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $access_notification$
declare
  title_text text;
begin
  title_text := case new.entity
    when 'user_roles' then 'Your access role was updated'
    when 'profiles' then 'Your account status was updated'
    else 'Your access was updated'
  end;
  perform public.create_notification(
    new.target_user_id,
    'access:' || new.id::text,
    'access', title_text,
    'A State Administrator changed your TASMAC account access.',
    '/dashboard',
    jsonb_build_object('audit_id', new.id, 'entity', new.entity, 'action', new.action)
  );
  return null;
end;
$access_notification$;

create trigger access_audit_notify
after insert on public.access_audit_log
for each row execute function public.notify_access_change();

create or replace function public.notify_master_data_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $master_notification$
declare
  uid uuid;
  href_text text;
begin
  href_text := case new.entity
    when 'cities' then '/management/cities'
    when 'shops' then '/management/shops'
    when 'app_settings' then '/management/settings'
    else '/inventory'
  end;
  for uid in
    select r.user_id
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.role = 'state_admin'::public.app_role and p.is_active
  loop
    perform public.create_notification(
      uid,
      'master:' || new.id::text,
      'master_data',
      initcap(replace(new.entity, '_', ' ')) || ' ' || new.action,
      'A ' || replace(new.entity, '_', ' ') || ' record was ' || new.action || '.',
      href_text,
      jsonb_build_object('audit_id', new.id, 'entity', new.entity, 'record_id', new.record_id, 'action', new.action)
    );
  end loop;
  return null;
end;
$master_notification$;

create trigger master_data_audit_notify
after insert on public.master_data_audit_log
for each row execute function public.notify_master_data_change();

-- Deliver notification inserts to connected browser clients. The application
-- also refreshes on focus as a fallback for an interrupted realtime channel.
alter publication supabase_realtime add table public.notifications;

revoke all on function public.guard_notification_update() from public, anon, authenticated;
revoke all on function public.create_notification(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.notify_stock_movement() from public, anon, authenticated;
revoke all on function public.notify_transfer_event() from public, anon, authenticated;
revoke all on function public.notify_access_change() from public, anon, authenticated;
revoke all on function public.notify_master_data_change() from public, anon, authenticated;


