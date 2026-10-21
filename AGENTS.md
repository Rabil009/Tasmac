<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules
- Authorization lives in `public.user_roles` + `has_role`/`is_state_admin` RLS; UI checks use `src/lib/rbac.ts` (keeps backend and UI in one matrix).
- Protected pages live under `src/routes/_authenticated/` and wrap content in `SectionGuard`/`FeaturePage` (direct URLs show Access denied).
- Service-role access only inside server-function handlers after a `has_role` check (keeps the key off the browser).
- `deliverables/` is the archived Next.js M3 source; the hosted app is TanStack Start.
- Master data writes go through the browser client under State Administrator-only RLS; database constraints and triggers are the validation authority, `src/lib/master-data.ts` only mirrors them (single source of truth stays in PostgreSQL).
- Inventory health is derived only in the `inventory_status` view (security_invoker); UI reads it, never recomputes (one authoritative threshold rule).
- Stock balances change only through the receive/issue/adjust SECURITY DEFINER RPCs; clients have no write grants on shop_inventory/stock_movements (one locked, audited write path).
- Transfers change state only through request_transfer/transition_transfer RPCs; transfers store shop label snapshots so cross-scope parties can read them without widening shops RLS.
- Dashboard and Reports aggregate only through `src/lib/analytics.ts` over the RLS-scoped fetchers in `analytics.queries.ts` (keeps dashboard and report totals reconciled).
- User-facing error text goes through `userMessage()` and telemetry/logging context through `sanitizeContext()` in `src/lib/app-error.ts` (no raw DB text or personal data leaves the app).
- Public /showcase reads only the anonymous `showcase_*` SECURITY DEFINER functions, which enforce the DEMO predicate in PostgreSQL and return explicit non-identity columns (keeps the public preview outside RLS-protected data).
- UI components and the app shell come only from `@4rged-ai/platform` (installed from `vendor/4rged-ai-platform-0.1.0.tgz`); TASMAC only overrides its tokens and fixed dimensions in `src/styles.css` (one visual system, reproducible installs).
- Stock, Tracking, Management and Reports roots carry `tasmac-ws` (+ area class); their CSS is scoped under it and their Select menus use `tasmac-ws-menu`, so refinements never restyle Dashboard, Inventory, Login, Showcase or the shell.

