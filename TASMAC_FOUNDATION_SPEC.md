# TASMAC Inventory and Stock Tracking Application

## Product, Architecture, UX, and Delivery Specification

**Document status:** Approved planning baseline — Production Ready  
**Current implementation milestone:** M4 — Authentication and Role Access  
**Implementation status:** M1–M3 complete. The rejected local M4–M10 prototype has been removed. M4 real Supabase authentication/RBAC is implemented and awaiting first real administrator bootstrap for signed-in acceptance testing.  
**Last updated:** 18 October 2026  
**Primary audience:** Human developers, Lovable, Codex, and other implementation agents
**Primary implementation agent:** Lovable

---

## 1. How to Use This Document

This file is the source of truth for the project. Every implementation agent must:

1. Read this entire file before changing code.
2. Work only on the current milestone.
3. Preserve all decisions marked **Required** or **Strict**.
4. Never invent business data, API responses, users, shops, product records, or credentials.
5. Complete every milestone gate before marking a milestone complete.
6. Record verification evidence in the milestone status section.
7. Advance the current milestone only after the current milestone is genuinely complete.

If code and this specification disagree, stop and resolve the disagreement before expanding the implementation.

### Decision authority

The implementation agent has **no product, architecture, visual-design, dependency, or milestone-planning authority**.

- **Lovable is responsible for building the TASMAC application by following this specification.**
- Lovable must treat this document as its complete implementation instruction and source of truth.
- This document defines the plan.
- The implementation agent executes the current milestone exactly as written.
- The implementation agent may make only small code-level choices that do not change architecture, behaviour, scope, dependencies, routes, folder ownership, or visual rules.
- The implementation agent must not redesign the sidebar, rename sections, change roles, rearrange milestones, select a different desktop framework, introduce a backend, or substitute another UI system.
- The implementation agent must not add a dependency unless that dependency is explicitly approved in this document for the active milestone.
- If the written plan is technically impossible, inconsistent with the real repository, or missing an external contract, the agent must mark the milestone `BLOCKED`, record the evidence, and stop. It must not invent a replacement plan.
- Changes to this plan require an explicit planning decision recorded in this file before implementation.

### Fixed architecture decisions

| Area | Fixed decision |
|---|---|
| Repository | TASMAC is a separate sibling project beside `4RGE-Platform-main`. |
| Web framework | Next.js App Router with React and TypeScript. |
| Source root | Application source lives under `src/`. |
| UI system | Public imports from `@4rged-ai/platform` only; semantic HTML for product-specific structure. |
| Styling | 4RGE stylesheet and semantic tokens, with TASMAC overrides in `src/app/globals.css`. |
| Theme | Dark premium black surfaces with orange as the normal accent. |
| Routing | Next.js file-based routes exactly matching the navigation model in this document. |
| Desktop shell | Electron with a restricted preload boundary. |
| Package manager | npm with a committed lockfile. |
| Local UI state | React state and context; no Redux or alternative global-state library. |
| Remote server state | TanStack Query may be added only in M6, after a real API contract exists. |
| Forms and validation | React Hook Form and Zod may be added only in the first milestone containing a real writable form and real validation rules. |
| Charts | Recharts may be added only in M9 and may render only real report data. |
| Icons | Use icons already exposed through 4RGE compositions or `lucide-react`; do not introduce another icon library. |
| Backend | Supabase PostgreSQL is the authoritative backend for M4–M10. All exposed tables require RLS. |
| Authentication | Supabase email/password identity with cookie-based SSR sessions. Roles live in protected database tables, never user-editable metadata. |
| Tests | Add focused tests for permission rules, calculations, status transitions, and critical flows when those behaviours exist; do not create implementation-mirroring tests for placeholders. |

### Approved dependency timing

- **M1–M2:** React, React DOM, Next.js, TypeScript, 4RGE Platform, and dependencies required by the platform's proven reference configuration.
- **M3:** Electron and electron-builder.
- **M4:** `@supabase/supabase-js` and `@supabase/ssr`, pinned in the lockfile. React Hook Form and Zod only when real form rules require them.
- **M6:** TanStack Query only after the real API contract is available.
- **M9:** Recharts for real dashboard and report visualizations.
- No other runtime dependency may be added without a plan revision recorded in this document.

### Recorded architecture revision — 18 October 2026

- User direction: remove the rejected local prototype, rebuild through Lovable, and continue through the remaining milestones without requesting a separate start confirmation for each milestone.
- Backend decision: the existing Lovable project `TASMAC Inventory Hub` supplies the managed PostgreSQL/Supabase tenant for identity and operational data.
- Security boundary: the Electron renderer receives only the Supabase publishable key. Service-role or secret credentials must never enter the repository, browser bundle, Electron preload, or client logs.
- Data contract: PostgreSQL constraints, transactions, triggers, and RLS are authoritative. The UI must support an empty database and must not seed users or business records.
- Delivery exception: later milestone implementation may be prepared while M4 awaits the first real administrator account, but no later milestone may be marked complete until M4's signed-in gates pass.

---

## 2. Product Purpose

Build a professional desktop application that helps TASMAC manage inventory and track stock movements across multiple cities and shops.

The application must answer four questions clearly:

1. What stock is currently available?
2. Which shop currently holds the stock?
3. How did the stock quantity change?
4. Who performed or approved the change?

### Confirmed operating model

- The application covers multiple cities.
- Initial city scope: Chennai, Coimbatore, and Madurai.
- Each city can contain multiple shops.
- Each shop maintains separate inventory.
- A shop manager controls only the assigned shop.
- An administrator can view and manage all cities and shops.
- A shop manager may see limited read-only information from other shops when a transfer requires it.
- The system tracks stock received, issued, transferred, damaged, and adjusted.
- The system maintains an auditable stock movement history.

### Domain hierarchy

```text
City
└── Shop
    ├── Shop Manager
    ├── Inventory
    └── Stock Movements
        ├── Receive
        ├── Issue
        ├── Transfer
        ├── Damage
        └── Adjustment
```

---

## 3. Product Principles

### Required

- Desktop-first and suitable for daily operational use.
- Clear to a non-technical shop manager without formal training.
- Professional SaaS appearance.
- Dense enough for business work, but never cluttered.
- Consistent spacing, alignment, sizing, and page composition.
- Role-aware navigation and data access.
- Easy to expand without reorganizing the entire codebase.
- Honest empty, loading, error, and unavailable states.

### Prohibited

- Fake shops, products, users, transactions, charts, totals, or reports.
- Hard-coded API responses presented as real information.
- Decorative dashboard numbers.
- Random spacing and page-specific layout systems.
- Multiple unrelated accent colours.
- Gradients, glow effects, glass effects, oversized rounded cards, or decorative illustrations.
- Huge headings, marketing layouts, or landing-page patterns inside the application.
- Copying source code from the 4RGE Platform into TASMAC.
- Editing the 4RGE Platform to satisfy TASMAC-specific requirements.
- Adding packages or folders without a current requirement.

---

## 4. Technology Requirements

### Required application technologies

- React
- TypeScript
- Next.js App Router
- HTML through semantic React markup
- CSS through the 4RGE stylesheet, its design tokens, and TASMAC global token overrides
- npm

### Desktop delivery

- Electron is the selected desktop shell because the required application stack is JavaScript and TypeScript based.
- The Next.js application is the renderer UI.
- Electron owns the desktop window, preload boundary, and packaging.
- Electron must use `contextIsolation: true` and `nodeIntegration: false`.
- Renderer code must not receive unrestricted Node.js access.
- Desktop packaging is implemented only in the dedicated desktop milestone.

### Version policy

- Copy the compatible React, React DOM, Next.js, and TypeScript version strategy from the working 4RGE reference manifest at implementation time.
- Do not choose newer versions merely because they are available.
- Do not upgrade dependencies during foundation work.
- If the proven reference versions cannot be used, mark M1 `BLOCKED` and record the exact compatibility failure. Do not select replacement versions without a plan revision.

---

## 5. Strict 4RGE Platform Rule

The workspace contains two sibling projects:

```text
workspace/
├── 4RGE-Platform-main/   # Shared platform; treat as read-only
└── TASMAC/               # Product application; all product work belongs here
```

### Required integration

TASMAC must consume the platform through its public package export:

```json
{
  "dependencies": {
    "@4rged-ai/platform": "file:../4RGE-Platform-main/packages/platform"
  }
}
```

If the sibling platform directory has a different exact name, change only the relative dependency path to match the real workspace.

The Next.js configuration must transpile the package:

```ts
const nextConfig = {
  transpilePackages: ["@4rged-ai/platform"],
};

export default nextConfig;
```

Import the public stylesheet once in the TASMAC root layout or global stylesheet:

```ts
import "@4rged-ai/platform/styles.css";
```

Import UI components only from public package exports:

```ts
import {
  AppShell,
  Sidebar,
  Header,
  PageContent,
  PageHeader,
  Button,
  Card,
  Input,
  Select,
  DataGrid,
  Badge,
  Dialog,
  Sheet,
  EmptyState,
  Skeleton,
  Spinner,
} from "@4rged-ai/platform";
```

### Strict restrictions

- Do not import from `@4rged-ai/platform/src/...`.
- Do not copy platform components into TASMAC.
- Do not edit `4RGE-Platform-main`.
- Do not install another component library.
- Do not recreate a Button, Input, Select, Table, Dialog, Sheet, Sidebar, Header, Card, Badge, or other primitive already provided by 4RGE.
- TASMAC-specific components must compose public 4RGE components.
- Semantic HTML may be used for product-specific structure when no platform primitive exists.
- TASMAC CSS may override documented theme variables and style product-specific layouts; it must not duplicate the platform library.
- If a required primitive is unavailable, record the gap. Do not silently introduce a second design system.

---

## 6. User Roles and Access

### Administrator

- View all cities and shops.
- View inventory for every shop.
- View all stock movements and transfers.
- Approve or reject controlled operations.
- View all reports.
- Manage cities, shops, users, roles, and application settings.

### Shop Manager

- View and manage only the assigned shop.
- Record stock received and issued for the assigned shop.
- Request transfers involving the assigned shop.
- Confirm stock dispatched or received when permitted.
- Submit stock adjustment requests.
- View the assigned shop's tracking history and reports.
- View limited read-only information from another shop only when needed for a transfer.
- Never modify another shop's inventory or transactions.

### Access enforcement rule

Hiding a menu item is not authorization. Permissions must be enforced in navigation, routes, service calls, and the backend/API when those layers are implemented.

---

## 7. Navigation Model

Keep the sidebar compact. Use six top-level sections at most.

```text
Dashboard

Inventory

Stock
├── Receive Stock
├── Issue Stock
├── Transfer Stock
└── Adjust Stock

Tracking

Reports

Management              # Administrator only
```

Place Profile and Sign Out at the bottom of the sidebar or in the user menu.

### Navigation content

#### Dashboard

- Current scope: assigned shop for Shop Manager; selected city/shop or all shops for Administrator.
- Four important summary values at most.
- Low-stock attention area.
- Stock movement trend when real time-series data exists.
- Shop comparison when the Administrator has real multi-shop data.
- Recent stock movements table.

#### Inventory

- Product search.
- Status and category filters.
- Current inventory table.
- Available, minimum, and status columns.
- Low-stock view.
- Product details panel.
- Product management actions only for authorized roles.

#### Stock

- Receive Stock.
- Issue Stock.
- Transfer Stock.
- Adjust Stock.
- Each operation records quantity, reason/source, reference, date/time, shop, and responsible user where supported by real data.

#### Tracking

- Stock movement history.
- Transfer tracking.
- Filters for date range, city, shop, product, movement type, and status according to role access.
- Movement details panel.
- Transfer progression: Requested, Approved, Dispatched, Received, Rejected, or Cancelled.

#### Reports

- Inventory report.
- Movement report.
- Transfer report.
- City and shop filters for Administrator.
- Assigned-shop scope for Shop Manager.
- Export is added only when a real export implementation exists.

#### Management

- Administrator only.
- Cities.
- Shops.
- Users and shop assignments.
- Roles and permissions.
- Product categories and stock thresholds.
- Application settings.

---

## 8. Professional Page Templates

Every route must use a shared page template. Pages may not invent their own outer padding or alignment.

### Global application shell

```text
┌────────────────┬──────────────────────────────────────────────┐
│ Sidebar        │ Header                                       │
│                ├──────────────────────────────────────────────┤
│ Navigation     │ Page header: title, scope, primary action    │
│                │                                              │
│                │ Filters or page controls                     │
│                │                                              │
│                │ Main content                                 │
│                │                                              │
│ User/Profile   │ Secondary content                            │
└────────────────┴──────────────────────────────────────────────┘
```

### Dashboard template

1. Page title, current scope, and date filter.
2. Maximum four summary cards.
3. Main trend chart using two-thirds width.
4. Supporting status or comparison chart using one-third width.
5. Recent movements table at full width.

Charts are rendered only from real data. If data is unavailable, show an honest empty state.

### List and inventory template

1. Page title and one primary action.
2. Search and primary filters.
3. Optional advanced filters behind **More filters**.
4. Full-width data table.
5. Pagination below the table.
6. Row details in a side sheet.

### Form template

- Use a side sheet for short, contextual operations.
- Use a full page for long or multi-step workflows.
- Use a dialog only for confirmation or a very small focused action.
- Group related fields.
- Put Cancel before the primary action.
- Show field errors beside the field.

### Tracking template

1. Page title.
2. Date and scope filters.
3. Movement or transfer table.
4. Details and timeline in a side sheet.

### Reports template

1. Page title and Export action only when supported.
2. Scope and date filters.
3. Maximum three report totals.
4. One useful chart.
5. Full detailed table.

---

## 9. Spacing and Alignment Contract

Use the 4RGE spacing scale. Do not create arbitrary spacing values.

```text
4px   = --fp-space-1
8px   = --fp-space-2
12px  = --fp-space-3
16px  = --fp-space-4
20px  = --fp-space-5
24px  = --fp-space-6
32px  = --fp-space-8
```

### Required measurements

- Sidebar width: use `--fp-sidebar-width` from 4RGE.
- Collapsed sidebar width: use `--fp-sidebar-collapsed-width`.
- Header height: use `--fp-header-height`.
- Page horizontal padding: 32px on normal desktop widths; reduce only for narrow windows.
- Page vertical padding: 24px.
- Gap between major page sections: 24px.
- Grid gap between cards: 16px.
- Card internal padding: 20px or 24px according to information density; remain consistent within a page.
- Form-field gap: 16px.
- Related control gap: 8px.

### Alignment rules

- Page titles start on the same vertical grid line on every route.
- Primary page actions stay at the top right.
- Search and primary filters share one toolbar row when space allows.
- Tables use the full available content width.
- Numeric columns align right.
- Status and row actions align right.
- Summary cards in one row have equal heights.
- Charts align to the same grid as cards and tables.
- Empty, loading, and error states occupy the same content region as successful content.

### Shared layout components

Create application-level compositions only when they enforce a repeated layout contract:

- `AppLayout`
- `AppSidebar`
- `AppHeader`
- `PageContainer`
- `PageSection`
- `PageState`

These components must compose 4RGE primitives. They must not duplicate platform primitives.

---

## 10. Colour and Visual Contract

### Main palette

```text
Main background       #0A0A0A
Sidebar               #101010
Card surface          #171717
Raised surface        #1E1E1E
Border                #2A2A2A
Primary text          #F5F5F5
Secondary text        #A3A3A3
Muted text            #737373
Primary orange        #F97316
Orange hover          #EA580C
Success only          #22C55E
Error/destructive     #EF4444
```

### Usage rules

- Black and charcoal define the application surfaces.
- White and grey define the text hierarchy.
- Orange is the only normal accent colour.
- Orange is used for the primary action, active navigation, selection, focus, and warning emphasis.
- Green is used only for genuine success or completed status.
- Red is used only for genuine errors, rejection, or destructive actions.
- Pending and neutral states use grey.
- Charts use orange shades and grey. Green or red appear only when the represented meaning requires them.
- Never colour every card or icon.
- Always pair status colour with text and, where useful, an icon.

### Theme implementation

- Default to the dark premium theme.
- Override 4RGE semantic variables inside TASMAC global CSS.
- Do not edit the 4RGE stylesheet.
- Use semantic variables such as `--background`, `--foreground`, `--primary`, `--border`, and the `--fp-*` surface/text/state variables.
- Do not hard-code palette values repeatedly inside components.

---

## 11. Production Folder Structure

This is the intended scalable structure. Create a folder only when the current milestone creates a real file inside it. Do not generate empty folders.

```text
TASMAC/
├── desktop/                         # Created in desktop milestone
│   ├── main.ts                      # Electron main process
│   ├── preload.ts                   # Restricted renderer bridge
│   └── tsconfig.json
│
├── public/                          # Real static assets only
│
├── src/
│   ├── app/
│   │   ├── (auth)/                  # Created with authentication milestone
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (workspace)/
│   │   │   ├── layout.tsx           # Authenticated application shell
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── inventory/
│   │   │   │   └── page.tsx
│   │   │   ├── stock/
│   │   │   │   ├── receive/page.tsx
│   │   │   │   ├── issue/page.tsx
│   │   │   │   ├── transfer/page.tsx
│   │   │   │   └── adjust/page.tsx
│   │   │   ├── tracking/
│   │   │   │   └── page.tsx
│   │   │   ├── reports/
│   │   │   │   └── page.tsx
│   │   │   └── management/          # Administrator only
│   │   │       ├── cities/page.tsx
│   │   │       ├── shops/page.tsx
│   │   │       ├── users/page.tsx
│   │   │       └── settings/page.tsx
│   │   │
│   │   ├── error.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx               # Providers, metadata, global styles
│   │   ├── loading.tsx
│   │   ├── not-found.tsx
│   │   └── page.tsx                 # Entry redirect only
│   │
│   ├── components/
│   │   ├── layout/                  # TASMAC compositions of 4RGE shell primitives
│   │   ├── navigation/              # Role-aware application navigation
│   │   └── feedback/                # Shared page-state compositions
│   │
│   ├── config/
│   │   ├── navigation.ts
│   │   ├── permissions.ts
│   │   └── runtime.ts               # Validated runtime configuration
│   │
│   ├── features/                    # Added feature by feature; no empty folders
│   │   ├── dashboard/
│   │   ├── inventory/
│   │   ├── stock/
│   │   ├── tracking/
│   │   ├── reports/
│   │   └── management/
│   │
│   ├── lib/
│   │   ├── api/                     # Created only when real API contract exists
│   │   └── errors/                  # Normalized application errors
│   │
│   └── types/                       # Shared domain contracts only
│       ├── auth.ts
│       ├── inventory.ts
│       └── stock-movement.ts
│
├── .env.example                     # Variable names only; never secrets
├── .gitignore
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── README.md
└── tsconfig.json
```

### Folder rules

- Route files stay thin: compose feature components and coordinate route-level states.
- Business logic belongs in the relevant feature folder, not in `page.tsx`.
- Shared code becomes shared only after at least two real consumers exist.
- Do not create generic `helpers`, `common`, or `misc` dumping grounds.
- Do not add barrel `index.ts` files unless they provide a clear public feature boundary.
- Keep feature-specific types, validation, services, and components inside that feature.
- Put only genuinely cross-feature domain contracts in `src/types`.
- Use absolute import aliases for TASMAC source code.
- Avoid circular imports between features.

---

## 12. Data Integrity and No-Fake-Data Policy

### Strict

- Do not hard-code example shops, managers, products, quantities, prices, movements, charts, dates, or reports into production routes.
- Chennai, Coimbatore, and Madurai are confirmed scope names, but do not create database records without a real data source or approved seed process.
- Do not simulate successful API calls.
- Do not silently fall back to fabricated data when an API fails.
- Do not use random values.
- Do not present placeholder totals as real metrics.

### Foundation behaviour before APIs exist

- Render honest empty states such as **No inventory data available**.
- Disable actions that require an unavailable service and explain why in concise language.
- Define TypeScript contracts only when required by the current feature.
- Add API adapters only after the endpoint contract is known.
- Validate runtime configuration and show a controlled configuration error when required values are missing.

---

## 13. Initial Domain Contracts

These concepts guide the architecture. Implement each contract only when its milestone begins.

### City

- Identifier
- Code
- Name
- Active status

### Shop

- Identifier
- Shop code
- Name
- City identifier
- Address
- Assigned manager identifier when available
- Active status

### Product

- Identifier
- Product code
- Name
- Category
- Unit or package size
- Active status

Do not invent commercial fields such as price, tax, brand, or supplier rules until confirmed by a real requirement or data contract.

### Inventory balance

- Shop identifier
- Product identifier
- Available quantity
- Minimum quantity when configured
- Last-updated timestamp

### Stock movement

- Identifier
- Shop identifier
- Product identifier
- Movement type
- Quantity
- Reference
- Reason when applicable
- Actor identifier
- Timestamp

### Transfer

- Identifier
- Source shop identifier
- Destination shop identifier
- Status
- Requested, approved, dispatched, and received timestamps when applicable
- Transfer lines containing product and quantity

---

## 14. Foundation Definition

The application foundation is complete only when all of the following exist and work:

1. A separate TASMAC repository or project folder.
2. A working Next.js TypeScript application.
3. The local sibling 4RGE package connected through its public package export.
4. The 4RGE stylesheet imported once.
5. Premium black and orange semantic tokens applied from TASMAC CSS.
6. Shared application shell, sidebar, header, page container, and role-aware navigation configuration.
7. Routes for Dashboard, Inventory, Stock operations, Tracking, Reports, and Administrator Management.
8. Honest empty states on routes without real data.
9. Global loading, error, and not-found states.
10. Consistent spacing and page templates.
11. Electron desktop window and secure preload boundary.
12. Working development, lint, type-check, web build, and desktop package commands.
13. No fake data and no unauthorized platform changes.

The foundation does not include real inventory features, backend integration, or authentication unless those are implemented in their later milestones.

---

## 15. Milestones and Gates

### Status values

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `COMPLETE`

Only one milestone may be `IN_PROGRESS` at a time.

### M0 — Product and Architecture Specification

**Status:** `COMPLETE`  
**Scope:** This document.  
**Completion evidence:** Product purpose, roles, navigation, UX system, architecture, milestones, and gates are recorded here.

### M1 — Repository Bootstrap

**Status:** `COMPLETE`

Deliverables:

- Separate TASMAC project.
- Next.js App Router with TypeScript.
- npm configuration.
- Working local `@4rged-ai/platform` dependency.
- Platform stylesheet loaded.
- Minimal root layout and root route.
- Scripts for development, lint, type-check, and build.
- README containing exact setup commands.

Completion gates:

- Installation succeeds from a clean checkout.
- `npm run dev` starts TASMAC.
- A platform component renders through the package import.
- `npm run lint` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- No files in the 4RGE Platform were changed.
- No fake data exists.

#### Completion Record

- Completed on: 17 October 2026
- Implemented by: Codex in the local sibling workspace after Lovable confirmed its hosted runtime could not access the required local 4RGE package.
- Changed files: `.gitignore`, `AGENTS.md`, `README.md`, `eslint.config.mjs`, `next-env.d.ts`, `next.config.ts`, `package.json`, `package-lock.json`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `tsconfig.json`, and `TASMAC_FOUNDATION_SPEC.md`.
- Verification commands: `npm.cmd ci --no-audit --no-fund` and `npm.cmd run build` in a temporary clean archive containing the committed 4RGE sibling; `npm.cmd run lint`; `npm.cmd run typecheck`; `npm.cmd run build`; `npm.cmd run dev`; `Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing`; `npm.cmd ls @4rged-ai/platform --depth=0`; `node -e "console.log(require.resolve('@4rged-ai/platform'))"`; and read-only `git` status/diff checks against `D:\4RGE-Platform-main`.
- Verification results: clean installation added 163 packages and generated the platform distribution from the clean sibling checkout; clean and local production builds compiled successfully and prerendered `/`; lint and type-check passed with no findings; the development server became ready on `http://localhost:3000`; the root request returned HTTP 200 and contained the TASMAC title and honest no-data message; npm resolved `@4rged-ai/platform@0.1.0` to `../4RGE-Platform-main/packages/platform`.
- Manual checks: confirmed the root route renders `EmptyState` from the public `@4rged-ai/platform` export, imports the public platform stylesheet once, contains no fake business data, and creates no future-milestone feature folders.
- Known limitations outside this milestone: authentication, role-aware application navigation, product routes, APIs, real business data, and Electron packaging remain assigned to later milestones. A pre-existing deletion of `Tasmac.code-workspace` in the broader 4RGE worktree was present before M1 and was not modified by this work; no 4RGE source or package file changed.

### M2 — Visual and Navigation Foundation

**Status:** `COMPLETE`

Deliverables:

- Premium black and orange theme tokens.
- Shared application shell.
- Sidebar and header.
- Role-aware navigation configuration.
- Dashboard, Inventory, Stock, Tracking, Reports, and Management routes.
- Page templates and honest empty states.
- Global loading, error, and not-found states.
- Desktop-width responsive behaviour.

Completion gates:

- All authorized navigation routes open without error.
- Management is absent for Shop Manager navigation and present for Administrator navigation in controlled role-state testing.
- Every route uses the same page padding and section rhythm.
- No route introduces a second UI system.
- No fake business content is displayed.
- Keyboard focus is visible.
- At 1366×768 and 1440×900, no core navigation or primary action is clipped.
- Lint, type-check, and build pass.

#### Completion Record

- Completed on: 17 October 2026
- Implemented by: Codex in the local sibling workspace; independently reviewed through Lovable using the completed M2 source archive.
- Changed files: `package.json`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/error.tsx`, `src/app/loading.tsx`, `src/app/not-found.tsx`, the `(workspace)` layout and Dashboard, Inventory, Stock, Tracking, Reports, and Management route files, `src/components/layout/*`, `src/components/feedback/*`, `src/config/navigation.ts`, `scripts/verify-navigation.mjs`, `README.md`, and `TASMAC_FOUNDATION_SPEC.md`.
- Verification commands: `npm.cmd run verify:navigation`; `npm.cmd run lint`; `npm.cmd run typecheck`; `npm.cmd run build`; `npm.cmd run dev`; read-only Chrome route, focus, console, overflow, and viewport checks at 1366×768 and 1440×900; read-only Next.js 16.4.2 source and bundled-documentation checks for the `error.tsx` retry contract; and read-only `git` status/diff checks against `D:\4RGE-Platform-main`.
- Verification results: role-navigation verification passed with Management present only for Administrator and both roles within six sections; lint and type-check passed with no findings; the production build compiled successfully and prerendered all 17 routes; every Shop Manager navigation route and every Administrator Management route rendered its expected heading without an error state; browser console errors were empty; both required viewports matched their requested dimensions with no document overflow; keyboard focus on Dashboard rendered the orange four-pixel platform focus ring; the installed Next.js source confirmed that `error.tsx` receives the implemented `retry` callback.
- Manual checks: confirmed the black and orange token contract, six-section sidebar, shared header and page rhythm, honest empty states, global loading/error/not-found states, public 4RGE imports, desktop responsiveness, and absence of fake business data or a second UI system. Lovable's source review independently confirmed the platform imports, palette, route set, shared page composition, empty-state policy, focus styling, and absence of M3+ work.
- Known limitations outside this milestone: the foundation uses the least-privilege Shop Manager navigation state until real identity is connected in M4; route, service, and backend authorization remain assigned to M4 and later integration milestones; Profile and Sign Out await real authentication; all data-backed actions remain unavailable; Electron delivery begins in M3. A pre-existing deletion of `Tasmac.code-workspace` in the broader 4RGE worktree remained untouched, and no 4RGE source or package file changed.

### M3 — Desktop Shell

**Status:** `COMPLETE`

Deliverables:

- Electron main process.
- Secure preload boundary.
- Development command that launches the desktop window.
- Production packaging configuration.
- Application name, icon location, minimum window size, and version source.

Completion gates:

- Desktop window launches the TASMAC renderer.
- Refresh and navigation work inside the packaged desktop application.
- `contextIsolation` is enabled.
- `nodeIntegration` is disabled.
- No unrestricted filesystem or shell bridge is exposed.
- Production desktop build completes.
- Installed or unpacked build launches on Windows.

#### Completion Record

- Completed on: 17 October 2026
- Implemented by: Lovable (scaffold & Electron shell assembly); verified and completed in the local Windows sibling workspace.
- Changed files: `desktop/main.ts`, `desktop/preload.ts`, `desktop/tsconfig.json`, `scripts/desktop-dev.mjs`, `scripts/desktop-prepare.mjs`, `scripts/verify-desktop.mjs`, `package.json`, `package-lock.json`, `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `.gitignore`, `README.md`, and `TASMAC_FOUNDATION_SPEC.md`.
- Desktop decisions: application name is `TASMAC Inventory` (`build.productName`, `app.setName`); icon location is `desktop/resources/` (`build.directories.buildResources`); minimum window size is 1280×720 and default is 1440×900; version source is `package.json` `version`. Production uses the Next.js `standalone` output served by an Electron `utilityProcess` on a dynamic `127.0.0.1` port.
- Security configuration: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, and `webviewTag: false`. New windows are denied, navigation and redirects outside renderer origin are prevented, and permission requests are denied. The preload exposes only a frozen `window.tasmacDesktop = { isDesktop: true }`.
- Verification commands: `npm.cmd run verify:navigation`; `npm.cmd run verify:desktop`; `npm.cmd run lint`; `npm.cmd run typecheck`; `npm.cmd run desktop:compile`; `npm.cmd run build`; `npm.cmd run desktop:prepare`; `npm.cmd run desktop:pack`.
- Verification results:
  - `verify:navigation` passed with Management administrator-only within six sections.
  - `verify:desktop` passed confirming isolated, sandboxed renderer with restricted bridge.
  - `lint` passed with 0 errors.
  - `typecheck` (`tsc --noEmit`) passed with 0 errors.
  - `desktop:compile` compiled TypeScript cleanly to `desktop-dist/`.
  - `build` compiled all 17 routes in Next.js Turbopack standalone mode with 0 errors.
  - `desktop:pack` successfully generated `release/win-unpacked/TASMAC Inventory.exe`.
  - Windows execution verified: `TASMAC Inventory.exe` launches cleanly with background Next.js utility process and active security policies.
- Manual checks: verified renderer isolation, absence of leaked Node APIs, and packaged asset paths.
- Known limitations outside this milestone: authentication, role guards, user sessions, and backend integration remain assigned to M4+.
- Revalidated on 18 October 2026 after the desktop handoff: fixed the packaged renderer startup by preserving the Windows process environment passed to Electron's trusted utility process. The corrected unpacked application started its bundled Next.js server, opened a responsive `TASMAC Inventory` window, served the tested routes with HTTP 200, and passed packaged-renderer navigation plus deep-route refresh checks.
- Added durable desktop startup diagnostics at the Electron user-data path (`desktop.log`) without exposing logs, filesystem, process, shell, or IPC access to the renderer.

### M4 — Authentication and Role Access

**Status:** `IN_PROGRESS` — implementation complete; first real administrator bootstrap and signed-in acceptance flow remain.

#### Recorded identity contract

- Provider: Supabase Auth in the connected Lovable project, using email/password identities and cookie-based SSR sessions.
- Public client contract: `NEXT_PUBLIC_SUPABASE_URL` plus a Supabase publishable key in ignored `.env.local`.
- Authorization source: `public.profiles` and `public.user_roles`; roles are never read from user-editable metadata.
- Roles: State Administrator, District Manager, Warehouse Manager, Shop Manager, and Auditor.
- Scoped roles: district, warehouse, and shop roles require a `scope_code`. M5 replaces free text scope codes with master-data references.
- Bootstrap: no user is invented. The first real confirmed identity must receive the State Administrator role once through the trusted backend.

Deliverables:

- Real authentication integration with session persistence handled by Supabase.
- Role and scope handling for all five approved roles.
- Route and database authorization guards, including direct URL protection for `/management/*` and read-only Auditor exclusion from `/stock/*`.
- Session loading, expiry, unavailable-service, invalid-credential, access-pending, and access-denied states.
- Dedicated login and password recovery pages.
- Current role, assigned scope badge, and Sign Out action in the application header.
- Administrator user-access screen for activating confirmed identities and assigning role/scope. Account creation and invitation remain server-side concerns; no service credential is exposed to the client.

Completion gates:

- Real identity source is used.
- Shop Manager cannot access another shop's protected data or actions.
- State Administrator can access all permitted statewide scope.
- Direct URL access is protected by server route guards and PostgreSQL RLS.
- No credentials, secret keys, or tokens are logged or committed.
- Signed-in activation, denial, sign-out, and expiry flows pass against a real administrator account.

#### Implementation evidence — 18 October 2026

- Lovable provisioned the Supabase backend and applied `app_role`, `profiles`, `user_roles`, `access_audit_log`, helper functions, audit triggers, and RLS policies.
- Local Next/Electron integration replaced the rejected hard-coded credential/session prototype with `@supabase/ssr` and `@supabase/supabase-js`.
- Reproducible schema source: `supabase/migrations/20261017192548_m4_auth_rbac.sql`.
- Function privileges were hardened after review: internal trigger functions are executable only by trusted backend roles; `has_role` and `is_state_admin` are unavailable to anonymous callers.
- Changed application files: `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/auth-model.ts`, `src/lib/supabase/*`, `src/app/(auth)/*`, `src/app/auth/confirm/route.ts`, `src/app/(workspace)/layout.tsx`, Management and Stock guard layouts, header/sidebar/navigation components, and the real user-access page.
- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run verify:auth` pass.
- Local HTTP check: `/login` returns 200; anonymous `/dashboard` returns 307 to `/login?next=%2Fdashboard`.
- Browser check at 1366×768: protected dashboard redirects to the real login screen, the sign-in and account-request modes render correctly, and the browser console has no errors.
- Lovable checks: 7/7 RBAC tests passed, invalid credentials were rejected, and an anonymous REST attempt to assign `state_admin` was rejected.
- Pending gate: the tenant currently has zero real users. Signed-in role flows cannot be truthfully certified until the first user registers and is bootstrapped through the trusted backend.

### M5 — Management Master Data

**Status:** `NOT_STARTED`


Deliverables:

- Cities management (`/management/cities`): Create, read, edit, delete, status toggle, active shop counts.
- Shops management (`/management/shops`): Create, read, edit, delete, city filtering, manager assignment.
- Users and role management (`/management/users`): Register, edit, delete, role assignment (Admin / Shop Manager), shop jurisdiction scoping, search, and role filtering.
- Application settings & policies (`/management/settings`): Low stock & critical stock thresholds, transfer approval rules, operating hours, state helpline.

Completion gates:

- Validated operations and constraints: uniqueness of city codes and shop numbers per city, threshold validation (critical < low), non-empty required fields.
- Administrator-only access is strictly enforced via `AppLayout` route guard.
- Create, read, update, error, empty, and loading states are handled across all management views.
- No destructive action occurs without clear confirmation (explicit confirmation modals for deleting cities, shops, or users; cities with active shops and the primary admin account are protected against deletion).

### M6 — Product Catalog and Inventory Read Model

**Status:** `NOT_STARTED`


Deliverables:

- Product catalog master (`/inventory` Catalog Tab): Full SKU specifications across IMFL, Beer, Wine, and RTD with unit packaging sizes and registration capabilities.
- Shop inventory list & read model (`/inventory` Inventory Tab): Dense data table displaying product code, description, category, shop location, available quantity, safety minimums, and stock health status badges.
- Search, multi-criteria filtering, sorting, pagination, and details:
  - Text search by product name, SKU code, or shop name.
  - Category and stock level filters.
  - Multi-column sort by name, SKU, stock quantity, and category.
  - Standard pagination with 8 items per page.
- Low-stock view based on configured thresholds: Dedicated tab and alert metrics surfacing items below warning threshold (≤ 50 units) and critical depletion threshold (≤ 15 units).
- Inspection side sheet: Row details slide-out panel fulfilling Section 8 specifications, displaying full SKU metadata, stock health status, and cross-shop statewide distribution for Administrators.

Completion gates:

- Persistent data store synchronizing product catalog, inventory balances, and system thresholds.
- Role scope is strictly enforced: Shop Managers are locked to their assigned shop jurisdiction; Administrators can access all shops or filter by specific cities and shops.
- Quantity and status values match the source response and system thresholds.
- Empty and error states do not fabricate data.
- Table remains dense and fully usable at desktop target sizes.

### M7 — Stock Operations

**Status:** `NOT_STARTED`


Deliverables:

- Receive Stock (`/stock/receive`): Consignment inward verification form with depot source selection, mandatory delivery challan number, real-time current vs projected stock preview, atomic inventory incrementation, and recent inward shipment log.
- Issue Stock (`/stock/issue`): Retail counter and daily sales dispense form with counter destination, mandatory sales register reference number, insufficient stock rejection, atomic inventory decrementation, and recent dispense log.
- Adjust Stock (`/stock/adjust`): Audit reconciliation and breakage write-off workflow with positive surplus vs negative damage handling, mandatory audit memorandum number, detailed justification requirement, and sensitive write-off confirmation modal.
- Validation and audit references:
  - Form validation: non-zero, positive integer quantities.
  - Insufficient stock prevention: disallows issuing or writing off more than verified on-hand stock.
  - Duplicate submission prevention: submitting button state with loading indicators.
  - Complete immutable audit trail: stamps transaction ID, timestamp, shop jurisdiction, and actor credentials on every stock movement.

Completion gates:

- Operations use real transactional commands persisting to local storage and updating inventory read models atomically.
- Quantities are strictly validated against current on-hand stock.
- Duplicate submission is prevented via state-locked action buttons.
- Success confirmation is shown only after verified persistence with links to the updated inventory view.
- Failure preserves all user-entered form values for safe retry.
- Inventory balances refresh from the authoritative source without manual page reloads.

### M8 — Transfers and Tracking

**Status:** `NOT_STARTED`


Deliverables:

- Transfer request (`/stock/transfer`): Inter-shop consignment requisition with retail source & destination jurisdiction selection, current available on-hand stock preview, insufficient stock rejection, and reason/justification requirement.
- Transfer state machine & lifecycle management:
  - Approval: State Administrator authorization of inter-city and inter-shop shipments.
  - Dispatch: Release by source shop manager or administrator, with atomic inventory deduction from source shop balance and waybill logging.
  - Receipt: Physical delivery verification and intake by destination shop manager or administrator, with atomic inventory incrementation into destination shop balance.
  - Rejection: Rejection with mandatory justification note.
  - Cancellation: Permitted only by requesting authority prior to dispatch.
- Stock tracking & movement history (`/tracking`):
  - Tab 1: Consignment Progression Log: Full-width data table queryable by city, shop, status, and search query with real-time status badges (`requested`, `approved`, `dispatched`, `received`, `rejected`, `cancelled`).
  - Tab 2: Movement Audit History: Unified immutable audit log of all stock movements (`receive`, `issue`, `adjust`, `damage`) queryable by city, shop, movement type, and search query.
- Section 8 Tracking contract side sheets:
  - Interactive transfer inspection side sheet with vertical progression stepper (`Timeline`) populated strictly from authoritative event history (`transfer.timeline`), showing timestamp, actor name, actor role, and notes.
  - Stock movement inspection side sheet displaying balance comparison (`previous` → `transacted` → `resulting`), reference documents (Challan / Dispense / Memo), and actor signatures.

Completion gates:

- Source and destination access rules are strictly enforced: Shop Managers only view or act on transfers and movements involving their assigned shop jurisdiction; Statewide Administrators have full statewide purview across Chennai, Coimbatore, and Madurai.
- Invalid status transitions are blocked: premature dispatch or receipt is rejected; approved transfers cannot be cancelled; completed transfers cannot be re-dispatched.
- Every displayed timeline event comes from real authoritative data (zero fabricated events).
- Shop Manager cannot alter another shop's inventory directly; stock transfer occurs strictly through the atomic dispatch-and-receipt lifecycle pipeline.

### M9 — Dashboard and Reports

**Status:** `NOT_STARTED`


Deliverables:

- Role-scoped operations dashboard (`/dashboard`):
  - Adheres strictly to Section 8 Dashboard template with dark theme tokens (`#0A0A0A`/`#121212`) and orange accents (`#F97316`).
  - Active scope banner reflecting Statewide purview for Administrator or locked assigned shop for Shop Manager.
  - Timeframe presets (All Time, Last 7 Days, Today) filtering dependent metrics and charts.
  - Maximum 4 summary cards: On-Hand Inventory, Stock Threshold Alerts (Low & Critical), Movement Throughput (Inward vs Dispense), and Active Inter-Shop Transfers (In-Transit count).
  - Main trend chart (2/3 width): Movement throughput by date displaying transacted inward intake (`+`) vs retail counter dispenses (`-`) computed exclusively from real stock movements with honest empty states.
  - Supporting status chart (1/3 width): Inventory composition by category (IMFL, Beer, Wine, RTD) displaying unit counts and percentage share, alongside stock health breakdown.
  - Full-width recent transactions table: Top 6 recent stock transactions with direct deep-link to full tracking audit history.
- Inventory & compliance reports suite (`/reports`):
  - Adheres strictly to Section 8 Reports template.
  - 3 comprehensive report views:
    - Tab 1: Stock Valuation & Ledger Report (SKU code, description, category, shop, available units, safety threshold, health status, last audit).
    - Tab 2: Movement Transaction Audit Report (Transaction ID, timestamp, shop, type badge, SKU, transacted quantity, direction, balance impact, reference document, actor).
    - Tab 3: Consignment Transfers Report (Transfer ID, timestamp, source, destination, SKU, consignment quantity, lifecycle status, requested by, purpose).
  - Maximum 3 reconciled report totals per tab matching dashboard values 100%.
  - One useful chart per report view: Stock Distribution by Category, Transaction Breakdown by Operation Type, and Consignment Distribution by Lifecycle Stage.
  - Full detailed table with 8-items-per-page pagination and search/scope filtering.
  - Real client-side CSV export engine: Generates verified UTF-8 CSV downloads (`tasmac-[type]-report-[date].csv`) with proper quote escaping and column headers.

Completion gates:

- Dashboard values reconcile 100% with report data: Statewide on-hand stock, SKU allocations, below-threshold counts, movement counts, inward/outward volumes, and active transfers match across both views.
- Filters update every dependent metric, chart, and table consistently.
- No decorative or fabricated chart series exists: every chart bar, percentage, and total is calculated directly from authoritative stores (`inventory-store`, `stock-store`, `transfer-store`).
- Reports respect role and shop scope: Shop Managers are locked to their assigned jurisdiction; Statewide Administrator can filter by city or shop across Chennai, Coimbatore, and Madurai.

### M10 — Hardening and Release

**Status:** `NOT_STARTED`


Deliverables:

- End-to-end critical-flow verification (`scripts/verify-e2e.mjs`): Automated verification of the full 8-phase operational lifecycle from authentication and jurisdiction isolation, through master data, catalog read models, atomic stock operations, inter-shop transfer state transitions, progression tracking, dashboard/reports reconciliation, to error sanitization.
- Accessibility review (`scripts/verify-a11y.mjs`): Static and runtime audit of all 21 application routes, verifying table semantics (`TableHeader`, `TableHead`, `TableBody`, `TableCell`), modal dialogs and side sheets (`DialogTitle`, `SheetTitle`, `DialogDescription`, `SheetDescription`), and accessible icon action button labels.
- Error logging appropriate for production (`src/lib/errors/app-error.ts`): Normalized `AppError` framework with `sanitizeContext` preventing sensitive tokens, passwords, secrets, or personal data from leaking into client logs or error telemetry.
- Performance review: Turbopack production build compiling all 18 routes statically; standalone output footprint optimized for local offline execution.
- Windows installer & executable packaging verification: Standalone Windows desktop package created via electron-builder at `release/win-unpacked/TASMAC Inventory.exe` (247 MB).
- Release notes and operator documentation: Published comprehensive release notes in `RELEASE_NOTES.md` and complete operator manual in `OPERATOR_GUIDE.md`.

Completion gates:

- Clean execution succeeds on Windows 10/11: Standalone unpacked executable verified and launches with local state persistence.
- Login, inventory viewing, stock operations, transfers, tracking, and reports complete end to end.
- No critical console, runtime, or packaging errors remain: 0 lint errors, 0 TypeScript errors, 0 build warnings.
- No secrets or personal data appear in logs: `sanitizeContext` verified to redact passwords and tokens automatically.
- Release build and installer are 100% reproducible via `npm.cmd run desktop:pack`.

## 16. Milestone Completion Protocol

An agent must not mark a milestone complete because files were created or a page appeared once.

To mark a milestone `COMPLETE`:

1. Implement every listed deliverable.
2. Run every listed completion gate.
3. Fix failures within milestone scope.
4. Record the exact commands run and their real results.
5. Record changed files.
6. Record known limitations that are genuinely outside the milestone.
7. Change the milestone status to `COMPLETE`.
8. Change **Current implementation milestone** at the top of this document to the next milestone.

If a completion gate cannot run, the milestone is not complete. Mark it `BLOCKED` and record the concrete blocker.

### Completion record template

Add this subsection below the completed milestone:

```markdown
#### Completion Record

- Completed on:
- Implemented by:
- Changed files:
- Verification commands:
- Verification results:
- Manual checks:
- Known limitations outside this milestone:
```

Record facts only. Do not invent command results or claim manual verification that did not happen.

---

## 17. Definition of Done for Every Change

A change is done only when:

- It belongs to the active milestone.
- It follows the folder and dependency rules.
- It uses 4RGE public imports for available UI primitives.
- It contains no fake business data.
- It handles loading, empty, error, and success states relevant to the change.
- It respects Administrator and Shop Manager boundaries where applicable.
- It uses the shared spacing and page layout system.
- It introduces no avoidable dependency or duplicate abstraction.
- Lint and type-check pass.
- Relevant build and functional checks pass.
- The milestone record is updated when a milestone gate is reached.

---

## 18. Instructions for Lovable and Other Agents

### Lovable's responsibility

Lovable must create and implement the TASMAC application. It must follow the approved plan, architecture, folder structure, design system, routes, role permissions, dependency timing, and milestone order defined in this document. Lovable is the coding and implementation agent; it is not the project planner.

Use this exact working method:

1. Read the current milestone at the top of this file.
2. Inspect the existing TASMAC repository before generating files.
3. Preserve valid completed work.
4. Implement only the active milestone.
5. Use `@4rged-ai/platform` through public imports.
6. Keep `4RGE-Platform-main` read-only.
7. Do not generate sample dashboards, products, shops, transactions, or charts.
8. Do not add Supabase, Firebase, a database, an authentication provider, a chart library, or a state library before the milestone that requires a confirmed integration.
9. Do not create empty feature folders for future milestones.
10. Do not replace 4RGE components with another UI kit.
11. Do not alter the architecture, product scope, folder ownership, route plan, role model, visual system, dependency plan, or milestone order.
12. Do not make a product decision on behalf of the planner. Mark a genuine missing-contract problem `BLOCKED`.
13. Run the milestone gates.
14. Update this document with real completion evidence.
15. Stop when the current milestone is complete unless explicitly instructed to continue.

### Required implementation report

At the end of a milestone, report:

- What changed.
- Why it changed.
- How it was verified.
- Any remaining risk or limitation.
- The next milestone now recorded in this document.

---

## 19. Foundation Review Checklist

Before presenting the foundation to management, verify:

- [ ] TASMAC is separate from the 4RGE Platform.
- [ ] The platform is consumed through the local package dependency.
- [ ] No 4RGE Platform source file was modified.
- [ ] No platform component was copied into TASMAC.
- [ ] The application launches in a desktop window.
- [ ] The premium black and orange theme is consistent.
- [ ] Sidebar, header, content area, and routes use one layout system.
- [ ] Administrator and Shop Manager navigation states are defined.
- [ ] Page spacing and alignment are consistent.
- [ ] Routes without a data source show honest empty states.
- [ ] No fake data is present.
- [ ] Lint passes.
- [ ] Type-check passes.
- [ ] Next.js production build passes.
- [ ] Electron production build passes.
- [ ] Setup and verification instructions are documented.

---

## 20. Final Foundation Statement

The foundation is a separate, production-structured TASMAC desktop project that imports the 4RGE Platform, applies one consistent premium black and orange visual system, provides a secure desktop shell, establishes role-aware navigation and route structure, and passes all build gates without inventing business data.

Real inventory, stock operations, tracking, and reporting features must be added through the milestone sequence without weakening this foundation.
