import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, CircleX, Store, UserMinus } from "lucide-react";
import { userMessage } from "@/lib/app-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeading, SectionGuard } from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import { ConfirmDelete, Field, errProps } from "@/components/shell/form-bits";
import { ReportSummary, ReportTable } from "@/components/reports/report-kit";
import { FilterSelect, OpSelect } from "@/components/stock/ops-bits";
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
import { fieldErrors, friendlyDbError, shopSchema } from "@/lib/master-data";
import {
  fetchCities,
  fetchShopManagers,
  fetchShops,
  type City,
  type Shop,
} from "@/lib/master-data.queries";
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

export const Route = createFileRoute("/_authenticated/management/shops")({
  head: () => ({
    meta: [
      { title: "Shops · TASMAC Inventory" },
      {
        name: "description",
        content: "Manage TASMAC retail shops and their managers.",
      },
      { property: "og:title", content: "Shops · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Manage TASMAC retail shops and their managers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="management">
      <ShopsPage />
    </SectionGuard>
  ),
});

function ShopsPage() {
  const qc = useQueryClient();
  const shops = useQuery({ queryKey: ["shops"], queryFn: fetchShops });
  const cities = useQuery({ queryKey: ["cities"], queryFn: fetchCities });
  const managers = useQuery({
    queryKey: ["shop-managers"],
    queryFn: fetchShopManagers,
  });
  const [editing, setEditing] = useState<Shop | "new" | null>(null);
  const [deleting, setDeleting] = useState<Shop | null>(null);

  const cityById = new Map((cities.data ?? []).map((c) => [c.id, c]));
  const managerById = new Map(
    (managers.data ?? []).map((m) => [m.id, m.label]),
  );

  const remove = useMutation({
    mutationFn: async (s: Shop) => {
      const { error } = await supabase.from("shops").delete().eq("id", s.id);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: (_d, s) => {
      toast.success(`${s.name} deleted`);
      qc.invalidateQueries({ queryKey: ["shops"] });
      setDeleting(null);
    },
    onError: (e: Error) => {
      toast.error(userMessage(e));
      setDeleting(null);
    },
  });

  const loading = shops.isPending || cities.isPending;
  const failed = shops.isError || cities.isError;
  const noCities = cities.isSuccess && cities.data.length === 0;

  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("");
  const all = shops.data ?? [];
  const rows = all.filter(
    (s) =>
      matches(applied, s.shop_number, s.name, s.address) &&
      (!city || s.city_id === city) &&
      (!status || (status === "active" ? s.is_active : !s.is_active)),
  );
  const active = all.filter((s) => s.is_active).length;
  const unassigned = all.filter((s) => !s.manager_id).length;

  return (
    <div className="tasmac-ws tasmac-ws-mgmt flex flex-col gap-4">
      <PageHeading
        title="Shops"
        description="Manage TASMAC retail shops. Assign each Shop Manager from Management → Users."
        actions={
          <AddButton
            label="Add shop"
            disabled={!cities.isSuccess || noCities}
            title={noCities ? "Add a city first" : undefined}
            onClick={() => setEditing("new")}
          />
        }
      />
      {loading ? (
        <TableLoading />
      ) : failed ? (
        <LoadError
          title="Shops could not be loaded"
          onRetry={() => {
            void shops.refetch();
            void cities.refetch();
          }}
        />
      ) : noCities ? (
        <StatePanel
          title="No cities recorded"
          description="Add a city under Management → Cities before registering shops."
        />
      ) : all.length === 0 ? (
        <StatePanel
          title="No shops recorded"
          description="Add the first shop to a city."
        />
      ) : (
        <>
          <ReportSummary
            label="Shop summary"
            items={[
              {
                label: "Shops",
                value: all.length.toLocaleString("en-IN"),
                icon: <Store />,
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
              {
                label: "No manager",
                value: unassigned.toLocaleString("en-IN"),
                icon: <UserMinus />,
              },
            ]}
          />
          <MgmtToolbar
            q={q}
            onQ={setQ}
            onSearch={() => setApplied(q)}
            placeholder="Shop number, name or address"
            dirty={Boolean(applied || city || status)}
            onClear={() => {
              setQ("");
              setApplied("");
              setCity("");
              setStatus("");
            }}
            filters={[
              {
                id: "m-city",
                label: "City",
                value: city,
                allLabel: "All cities",
                options: (cities.data ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                })),
                onChange: setCity,
              },
              {
                id: "m-status",
                label: "Status",
                value: status,
                allLabel: "All statuses",
                options: [
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ],
                onChange: setStatus,
              },
            ]}
          />
          <ReportTable
            title="Shop list"
            count={rows.length}
            head={[
              "Shop no.",
              "Name",
              "City",
              "Manager",
              "Status",
              "Last changed",
              "Actions",
            ]}
            numeric={["Actions"]}
            centered={[
              "Shop no.",
              "City",
              "Manager",
              "Status",
              "Last changed",
              "Actions",
            ]}
            tableClassName="tasmac-actions-sticky"
            empty={<NoMatches what="shops" />}
          >
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="text-center font-mono text-xs whitespace-nowrap">
                  {s.shop_number}
                </td>
                <td className="min-w-48">
                  <p className="font-medium text-foreground">{s.name}</p>
                  {s.address ? (
                    <p
                      className="max-w-72 truncate text-xs text-muted-foreground"
                      title={s.address}
                    >
                      {s.address}
                    </p>
                  ) : null}
                </td>
                <td className="text-center whitespace-nowrap">
                  {cityById.get(s.city_id)?.name ?? "—"}
                </td>
                <td className="text-center whitespace-nowrap">
                  {s.manager_id ? (
                    (managerById.get(s.manager_id) ?? "Inactive manager")
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </td>
                <td className="text-center">
                  <StatusLozenge
                    label={s.is_active ? "Active" : "Inactive"}
                    tone={s.is_active ? "active" : "inactive"}
                  />
                </td>
                <td className="text-center whitespace-nowrap font-medium text-muted-foreground">
                  {fmtChanged(s.updated_at)}
                </td>
                <td className="text-center">
                  <RowActions>
                    <EditAction
                      label={`Edit ${s.name}`}
                      onClick={() => setEditing(s)}
                    />
                    <DeleteAction
                      label={`Delete ${s.name}`}
                      onClick={() => setDeleting(s)}
                    />
                  </RowActions>
                </td>
              </tr>
            ))}
          </ReportTable>
        </>
      )}
      {editing ? (
        <ShopDialog
          shop={editing === "new" ? null : editing}
          cities={cities.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDelete
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "shop"}?`}
        description="This permanently removes the shop. It is blocked while a Shop Manager is scoped to it."
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function ShopDialog(props: {
  shop: Shop | null;
  cities: City[];
  onClose: () => void;
}) {
  const { shop, onClose } = props;
  const qc = useQueryClient();
  const [cityId, setCityId] = useState(shop?.city_id ?? "");
  const [shopNumber, setShopNumber] = useState(shop?.shop_number ?? "");
  const [name, setName] = useState(shop?.name ?? "");
  const [address, setAddress] = useState(shop?.address ?? "");
  const [active, setActive] = useState(shop?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cityOptions = props.cities.filter(
    (c) => c.is_active || c.id === shop?.city_id,
  );

  const save = useMutation({
    mutationFn: async (v: ReturnType<typeof shopSchema.parse>) => {
      const row = {
        city_id: v.cityId,
        shop_number: v.shopNumber,
        name: v.name,
        address: v.address || null,
        is_active: v.isActive,
      };
      const { error } = shop
        ? await supabase.from("shops").update(row).eq("id", shop.id)
        : await supabase.from("shops").insert(row);
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success(shop ? "Shop updated" : "Shop added");
      qc.invalidateQueries({ queryKey: ["shops"] });
      onClose();
    },
    onError: (e: Error) => setErrors({ form: userMessage(e) }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = shopSchema.safeParse({
      cityId,
      shopNumber,
      name,
      address,
      managerId: null,
      isActive: active,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tasmac-mgmt-dialog">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{shop ? "Edit shop" : "Add shop"}</DialogTitle>
            <DialogDescription>
              Shop numbers must be unique within a city.
            </DialogDescription>
          </DialogHeader>
          <RecordContext entity="Shop" id={shop?.shop_number} />
          <Field id="shop-city" label="City" error={errors["cityId"]}>
            <OpSelect
              id="shop-city"
              value={cityId}
              placeholder="Select a city"
              error={errors["cityId"]}
              options={cityOptions.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.code})${c.is_active ? "" : " — inactive"}`,
              }))}
              onChange={setCityId}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              id="shop-number"
              label="Shop number"
              error={errors["shopNumber"]}
            >
              <Input
                {...errProps("shop-number", errors["shopNumber"])}
                value={shopNumber}
                maxLength={16}
                onChange={(e) => setShopNumber(e.target.value)}
              />
            </Field>
            <Field id="shop-name" label="Name" error={errors["name"]}>
              <Input
                {...errProps("shop-name", errors["name"])}
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <Field
            id="shop-address"
            label="Address"
            optional
            error={errors["address"]}
          >
            <Input
              {...errProps("shop-address", errors["address"])}
              value={address}
              maxLength={300}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Switch
              id="shop-active"
              checked={active}
              onCheckedChange={setActive}
            />
            <Label htmlFor="shop-active">Shop active</Label>
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
              {save.isPending ? "Saving…" : "Save shop"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
