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

revoke all on function public.create_notification(uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;


