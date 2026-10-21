import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, CircleX, MapPinned } from "lucide-react";
import { userMessage } from "@/lib/app-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeading, SectionGuard } from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import { ConfirmDelete, Field, errProps } from "@/components/shell/form-bits";
import { ReportSummary, ReportTable } from "@/components/reports/report-kit";
import {
  AddButton,
  RecordContext,
  DeleteAction,
  EditAction,
  LoadError,
  MgmtToolbar,
  NoMatches,
  RowActions,
  StatusLozenge,
  TableLoading,
} from "@/components/management/mgmt-kit";
import { fmtChanged, matches } from "@/lib/mgmt-format";
import { citySchema, fieldErrors, friendlyDbError } from "@/lib/master-data";
import { fetchCities, fetchShops, type City } from "@/lib/master-data.queries";
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

const STATUS_OPTS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export const Route = createFileRoute("/_authenticated/management/cities")({
  head: () => ({
    meta: [
      { title: "Cities · TASMAC Inventory" },
      { name: "description", content: "Manage the cities TASMAC operates in." },
      { property: "og:title", content: "Cities · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Manage the cities TASMAC operates in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="management">
      <CitiesPage />
    </SectionGuard>
  ),
});

function CitiesPage() {
  const qc = useQueryClient();
  const cities = useQuery({ queryKey: ["cities"], queryFn: fetchCities });
  const shops = useQuery({ queryKey: ["shops"], queryFn: fetchShops });
  const [editing, setEditing] = useState<City | "new" | null>(null);
  const [deleting, setDeleting] = useState<City | null>(null);

  const shopCount = (id: string) =>
    shops.data?.filter((s) => s.city_id === id).length ?? 0;

  const remove = useMutation({
    mutationFn: async (c: City) => {
      const { error } = await supabase.from("cities").delete().eq("id", c.id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: (_d, c) => {
      toast.success(`${c.name} deleted`);
      qc.invalidateQueries({ queryKey: ["cities"] });
      setDeleting(null);
    },
    onError: (e: Error) => {
      toast.error(userMessage(e));
      setDeleting(null);
    },
  });

  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [status, setStatus] = useState("");
  const all = cities.data ?? [];
  const rows = all.filter(
    (c) =>
      matches(applied, c.code, c.name) &&
      (!status || (status === "active" ? c.is_active : !c.is_active)),
  );
  const active = all.filter((c) => c.is_active).length;

  return (
    <div className="tasmac-ws tasmac-ws-mgmt flex flex-col gap-4">
      <PageHeading
        title="Cities"
        description="Manage the cities TASMAC operates in."
        actions={
          <AddButton label="Add city" onClick={() => setEditing("new")} />
        }
      />
      {cities.isPending ? (
        <TableLoading />
      ) : cities.isError ? (
        <LoadError
          title="Cities could not be loaded"
          onRetry={() => cities.refetch()}
        />
      ) : all.length === 0 ? (
        <StatePanel
          title="No cities recorded"
          description="Add the first city to start registering shops."
        />
      ) : (
        <>
          <ReportSummary
            label="City summary"
            items={[
              {
                label: "Cities",
                value: all.length.toLocaleString("en-IN"),
                icon: <MapPinned />,
              },
              {
                label: "Active",
                value: active.toLocaleString("en-IN"),
                icon: <CircleCheck />,
              },
              {
                label: "Inactive",
                value: (all.length - active).toLocaleString("en-IN"),
                icon: <CircleX />,
              },
            ]}
          />
          <MgmtToolbar
            q={q}
            onQ={setQ}
            onSearch={() => setApplied(q)}
            placeholder="City code or name"
            dirty={Boolean(applied || status)}
            onClear={() => {
              setQ("");
              setApplied("");
              setStatus("");
            }}
            filters={[
              {
                id: "m-status",
                label: "Status",
                value: status,
                allLabel: "All statuses",
                options: STATUS_OPTS,
                onChange: setStatus,
              },
            ]}
          />
          <ReportTable
            title="City list"
            count={rows.length}
            head={[
              "Code",
              "Name",
              "Shops",
              "Status",
              "Last changed",
              "Actions",
            ]}
            numeric={["Shops", "Actions"]}
            centered={["Code", "Shops", "Status", "Last changed", "Actions"]}
            tableClassName="tasmac-actions-sticky"
            empty={<NoMatches what="cities" />}
          >
            {rows.map((c) => {
              const n = shopCount(c.id);
              const blocked = !shops.isSuccess || n > 0;
              const why =
                n > 0
                  ? `Cities with shops cannot be deleted (${n} shop${n === 1 ? "" : "s"})`
                  : !shops.isSuccess
                    ? "Shop count is still loading"
                    : undefined;
              return (
                <tr key={c.id}>
                  <td className="text-center font-mono text-xs">{c.code}</td>
                  <td className="whitespace-nowrap font-medium text-foreground">
                    {c.name}
                  </td>
                  <td className="text-center">{shops.isSuccess ? n : "—"}</td>
                  <td className="text-center">
                    <StatusLozenge
                      label={c.is_active ? "Active" : "Inactive"}
                      tone={c.is_active ? "active" : "inactive"}
                    />
                  </td>
                  <td className="text-center whitespace-nowrap font-medium text-muted-foreground">
                    {fmtChanged(c.updated_at)}
                  </td>
                  <td className="text-center">
                    <RowActions>
                      <EditAction
                        label={`Edit ${c.name}`}
                        onClick={() => setEditing(c)}
                      />
                      <DeleteAction
                        label={
                          why ? `Delete ${c.name} — ${why}` : `Delete ${c.name}`
                        }
                        title={why}
                        disabled={blocked}
                        onClick={() => setDeleting(c)}
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
        <CityDialog
          city={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDelete
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "city"}?`}
        description="This permanently removes the city. It is only allowed when no shops or users reference it."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function CityDialog({
  city,
  onClose,
}: {
  city: City | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState(city?.code ?? "");
  const [name, setName] = useState(city?.name ?? "");
  const [active, setActive] = useState(city?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async (v: {
      code: string;
      name: string;
      isActive: boolean;
    }) => {
      const row = { code: v.code, name: v.name, is_active: v.isActive };
      const { error } = city
        ? await supabase.from("cities").update(row).eq("id", city.id)
        : await supabase.from("cities").insert(row);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success(city ? "City updated" : "City added");
      qc.invalidateQueries({ queryKey: ["cities"] });
      onClose();
    },
    onError: (e: Error) => setErrors({ form: userMessage(e) }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = citySchema.safeParse({ code, name, isActive: active });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tasmac-mgmt-dialog">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{city ? "Edit city" : "Add city"}</DialogTitle>
            <DialogDescription>
              Codes are stored in upper case and must be unique.
            </DialogDescription>
          </DialogHeader>
          <RecordContext entity="City" id={city?.code} />
          <Field id="city-code" label="Code" error={errors["code"]}>
            <Input
              {...errProps("city-code", errors["code"])}
              value={code}
              maxLength={16}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field id="city-name" label="Name" error={errors["name"]}>
            <Input
              {...errProps("city-name", errors["name"])}
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Switch
              id="city-active"
              checked={active}
              onCheckedChange={setActive}
            />
            <Label htmlFor="city-active">City active</Label>
          </div>
          {errors["form"] ? (
            <p role="alert" className="text-sm text-destructive">
              {errors["form"]}
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
              className="tasmac-btn tasmac-btn-dialog min-w-[8.5rem]"
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save city"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
