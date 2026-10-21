import { createFileRoute } from "@tanstack/react-router";
import { Clock3, UserCheck, Users } from "lucide-react";
import { userMessage } from "@/lib/app-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeading,
  SectionGuard,
  useAccess,
} from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import {
  APP_ROLES,
  ROLE_LABELS,
  roleRequiresScope,
  type AppRole,
} from "@/lib/rbac";
import { fetchCities, fetchShops } from "@/lib/master-data.queries";
import { inviteUser, updateUserAccess } from "@/lib/users.functions";
import { ReportSummary, ReportTable } from "@/components/reports/report-kit";
import { FilterSelect, OpSelect } from "@/components/stock/ops-bits";
import {
  AddButton,
  RecordContext,
  EditAction,
  LoadError,
  MgmtToolbar,
  NoMatches,
  RowActions,
  StatusLozenge,
  TableLoading,
} from "@/components/management/mgmt-kit";
import { fmtChanged, matches } from "@/lib/mgmt-format";
import {
  toast,
  Button,
  Input,
  Label,
  Switch,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@4rged-ai/platform";

export const Route = createFileRoute("/_authenticated/management/users")({
  head: () => ({
    meta: [
      { title: "Users · TASMAC Inventory" },
      {
        name: "description",
        content: "Invite users and assign TASMAC roles and scope.",
      },
      { property: "og:title", content: "Users · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Invite users and assign TASMAC roles and scope.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="management">
      <UsersPage />
    </SectionGuard>
  ),
});

const UNASSIGNED = "__unassigned__";

interface UserRow {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  role: AppRole | null;
  scopeCode: string | null;
  scopeId: string | null;
  updatedAt: string;
}

async function fetchUsers(): Promise<UserRow[]> {
  const [p, r] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, is_active, updated_at")
      .order("email"),
    supabase
      .from("user_roles")
      .select(
        "user_id, role, scope_code, scope_shop_id, updated_at",
      ),
  ]);
  if (p.error || r.error) throw new Error("Users could not be loaded.");
  const roles = new Map(r.data.map((x) => [x.user_id, x]));
  return p.data.map((x) => {
    const role = roles.get(x.id);
    return {
      id: x.id,
      email: x.email,
      fullName: x.full_name,
      isActive: x.is_active,
      role: APP_ROLES.includes(role?.role as AppRole) ? (role?.role as AppRole) : null,
      scopeCode: role?.scope_code ?? null,
      scopeId: role?.scope_shop_id ?? null,
      updatedAt:
        role && role.updated_at > x.updated_at ? role.updated_at : x.updated_at,
    };
  });
}

function UsersPage() {
  const access = useAccess();
  const query = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [inviting, setInviting] = useState(false);

  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [roleF, setRoleF] = useState("");
  const [status, setStatus] = useState("");
  const all = query.data ?? [];
  const isActive = (u: UserRow) => u.isActive && Boolean(u.role);
  const rows = all.filter(
    (u) =>
      matches(applied, u.fullName, u.email, u.scopeCode) &&
      (!roleF || (roleF === UNASSIGNED ? !u.role : u.role === roleF)) &&
      (!status || (status === "active" ? isActive(u) : !isActive(u))),
  );
  const activeCount = all.filter(isActive).length;

  return (
    <div className="tasmac-ws tasmac-ws-mgmt flex flex-col gap-4">
      <PageHeading
        title="Users"
        description="Manage users, roles, and scope assignments for authorized administrators."
        actions={
          <AddButton label="Invite user" onClick={() => setInviting(true)} />
        }
      />
      {query.isPending ? (
        <TableLoading />
      ) : query.isError ? (
        <LoadError
          title="Users could not be loaded"
          onRetry={() => query.refetch()}
        />
      ) : all.length === 0 ? (
        <StatePanel
          title="No users"
          description="Invite the first user to get started."
        />
      ) : (
        <>
          <ReportSummary
            label="User summary"
            items={[
              {
                label: "Users",
                value: all.length.toLocaleString("en-IN"),
                icon: <Users />,
              },
              {
                label: "Active",
                value: activeCount.toLocaleString("en-IN"),
                icon: <UserCheck />,
              },
              {
                label: "Pending",
                value: (all.length - activeCount).toLocaleString("en-IN"),
                icon: <Clock3 />,
              },
            ]}
          />
          <MgmtToolbar
            q={q}
            onQ={setQ}
            onSearch={() => setApplied(q)}
            placeholder="Name, email or scope"
            dirty={Boolean(applied || roleF || status)}
            onClear={() => {
              setQ("");
              setApplied("");
              setRoleF("");
              setStatus("");
            }}
            filters={[
              {
                id: "m-role",
                label: "Role",
                value: roleF,
                allLabel: "All roles",
                options: [
                  ...APP_ROLES.map((r) => ({
                    value: r,
                    label: ROLE_LABELS[r],
                  })),
                  { value: UNASSIGNED, label: "Unassigned" },
                ],
                onChange: setRoleF,
              },
              {
                id: "m-status",
                label: "Status",
                value: status,
                allLabel: "All statuses",
                options: [
                  { value: "active", label: "Active" },
                  { value: "pending", label: "Pending" },
                ],
                onChange: setStatus,
              },
            ]}
          />
          <ReportTable
            title="User access"
            count={rows.length}
            head={[
              "User",
              "Role",
              "Scope",
              "Status",
              "Last changed",
              "Actions",
            ]}
            numeric={["Actions"]}
            centered={["Role", "Scope", "Status", "Last changed", "Actions"]}
            tableClassName="tasmac-actions-sticky"
            empty={<NoMatches what="users" />}
          >
            {rows.map((u) => {
              const self = u.id === access.userId;
              return (
                <tr key={u.id}>
                  <td className="min-w-56">
                    <p className="font-medium text-foreground">
                      {u.fullName ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="text-center">
                    {u.role ? (
                      <StatusLozenge
                        label={ROLE_LABELS[u.role]}
                        tone="neutral"
                      />
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  <td className="text-center font-mono text-xs whitespace-nowrap">
                    {u.scopeCode ?? "—"}
                  </td>
                  <td className="text-center">
                    <StatusLozenge
                      label={isActive(u) ? "Active" : "Pending"}
                      tone={isActive(u) ? "neutral" : "pending"}
                    />
                  </td>
                  <td className="text-center whitespace-nowrap font-medium text-muted-foreground">
                    {fmtChanged(u.updatedAt)}
                  </td>
                  <td className="text-center">
                    <RowActions>
                      <EditAction
                        text="Edit access"
                        label={
                          self
                            ? "Edit access — you cannot change your own access"
                            : `Edit access for ${u.fullName ?? u.email}`
                        }
                        disabled={self}
                        title={
                          self ? "You cannot change your own access" : undefined
                        }
                        onClick={() => setEditing(u)}
                      />
                    </RowActions>
                  </td>
                </tr>
              );
            })}
          </ReportTable>
        </>
      )}
      {editing ? (
        <EditAccessDialog user={editing} onClose={() => setEditing(null)} />
      ) : null}
      {inviting ? <InviteDialog onClose={() => setInviting(false)} /> : null}
    </div>
  );
}

function RoleScopeFields(props: {
  role: AppRole | "";
  scope: string;
  onRole: (r: AppRole | "") => void;
  onScope: (s: string) => void;
  error?: string | undefined;
}) {
  const needsShop = props.role === "shop_manager";
  const cities = useQuery({ queryKey: ["cities"], queryFn: fetchCities });
  const shops = useQuery({ queryKey: ["shops"], queryFn: fetchShops });
  const cityById = new Map((cities.data ?? []).map((c) => [c.id, c]));
  const options = (shops.data ?? [])
    .filter((s) => s.is_active)
    .map((s) => ({
      id: s.id,
      label: `${s.shop_number} · ${s.name} — ${cityById.get(s.city_id)?.name ?? ""}`,
    }));
  const failed = shops.isError || cities.isError;
  const loading = shops.isPending || cities.isPending;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <FilterSelect
          id="role"
          value={props.role}
          allLabel="Unassigned"
          options={APP_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          onChange={(v) => {
            props.onRole(v as AppRole | "");
            props.onScope("");
          }}
        />
      </div>
      {needsShop ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scope">Assigned shop (required)</Label>
          <OpSelect
            id="scope"
            value={props.scope}
            disabled={loading || failed}
            error={props.error}
            placeholder={
              loading
                ? "Loading…"
                : "Select a shop"
            }
            options={options.map((o) => ({ value: o.id, label: o.label }))}
            onChange={props.onScope}
          />
          {props.error ? (
            <p id="scope-error" className="text-xs text-destructive">
              {props.error}
            </p>
          ) : failed ? (
            <p className="text-xs text-destructive">
              Locations could not be loaded.
            </p>
          ) : !loading && options.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No active shops. Add one under Management first.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function EditAccessDialog({
  user,
  onClose,
}: {
  user: UserRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const updateAccess = useServerFn(updateUserAccess);
  const [role, setRole] = useState<AppRole | "">(user.role ?? "");
  const [scope, setScope] = useState(user.scopeId ?? "");
  const [active, setActive] = useState(user.isActive);
  const [error, setError] = useState<string>();

  const save = useMutation({
    mutationFn: async () => {
      await updateAccess({
        data: {
          userId: user.id,
          role: role || null,
          scopeId: role === "shop_manager" ? scope || null : null,
          isActive: active,
        },
      });
    },
    onSuccess: () => {
      toast.success("Access updated");
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e: Error) =>
      toast.error(`Access could not be updated: ${userMessage(e)}`),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (role && roleRequiresScope(role) && !scope.trim()) {
      setError("Select a shop");
      return;
    }
    setError(undefined);
    save.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tasmac-mgmt-dialog">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit access</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          <RecordContext entity="User access" id={user.email} />
          <RoleScopeFields
            role={role}
            scope={scope}
            onRole={setRole}
            onScope={setScope}
            error={error}
          />
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Switch id="active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="active">Account active</Label>
          </div>
          <DialogFooter>
            <Button
              size="lg"
              type="button"
              variant="outline"
              className="tasmac-btn tasmac-btn-dialog"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              type="submit"
              className="tasmac-btn tasmac-btn-dialog min-w-[9.5rem]"
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const invite = useServerFn(inviteUser);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole | "">("");
  const [scope, setScope] = useState("");
  const [error, setError] = useState<string>();

  const send = useMutation({
    mutationFn: () =>
      invite({
        data: {
          email,
          fullName,
          role: role as AppRole,
          scopeId: scope || null,
          redirectTo: window.location.origin,
        },
      }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${email}`);
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (e: Error) => setError(userMessage(e)),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      return setError("Enter a valid email address");
    if (fullName.trim().length < 2)
      return setError("Enter the user's full name");
    if (!role) return setError("Select a role");
    if (roleRequiresScope(role) && !scope.trim())
      return setError("Select a shop");
    setError(undefined);
    send.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tasmac-mgmt-dialog">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              The user receives an email link to set their password. Access is
              active immediately.
            </DialogDescription>
          </DialogHeader>
          <RecordContext entity="User invitation" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              value={fullName}
              maxLength={120}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <RoleScopeFields
            role={role}
            scope={scope}
            onRole={setRole}
            onScope={setScope}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              size="lg"
              type="button"
              variant="outline"
              className="tasmac-btn tasmac-btn-dialog"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              type="submit"
              className="tasmac-btn tasmac-btn-dialog min-w-[9.5rem]"
              disabled={send.isPending}
            >
              {send.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
