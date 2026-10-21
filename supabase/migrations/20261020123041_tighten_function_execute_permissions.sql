-- Helper and trigger functions are never public endpoints. Operational RPCs
-- remain available to signed-in users and verify their own role and scope.
revoke all on function public.current_scope_city_id() from public, anon;
revoke all on function public.current_scope_shop_id() from public, anon;
revoke all on function public.guard_profile_update() from public, anon;
revoke all on function public.guard_role_write() from public, anon;
revoke all on function public.has_operational_access() from public, anon;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_state_admin() from public, anon;
revoke all on function public.write_access_audit() from public, anon;

grant execute on function public.current_scope_city_id() to authenticated, service_role;
grant execute on function public.current_scope_shop_id() to authenticated, service_role;
grant execute on function public.has_operational_access() to authenticated, service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_state_admin() to authenticated, service_role;


