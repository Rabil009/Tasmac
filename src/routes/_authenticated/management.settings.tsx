import { createFileRoute } from "@tanstack/react-router";
import { userMessage } from "@/lib/app-error";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeading, SectionGuard } from "@/components/shell/feature-page";
import { StatePanel } from "@/components/shell/states";
import { Field, errProps } from "@/components/shell/form-bits";
import {
  fieldErrors,
  friendlyDbError,
  settingsSchema,
} from "@/lib/master-data";
import {
  toast,
  Button,
  Input,
  Label,
  Skeleton,
  Switch,
} from "@4rged-ai/platform";
import { RetryButton } from "@/components/stock/ops-bits";

export const Route = createFileRoute("/_authenticated/management/settings")({
  head: () => ({
    meta: [
      { title: "Settings · TASMAC Inventory" },
      {
        name: "description",
        content: "Stock thresholds, transfer approval, hours and helpline.",
      },
      { property: "og:title", content: "Settings · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Stock thresholds, transfer approval, hours and helpline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SectionGuard section="management">
      <SettingsPage />
    </SectionGuard>
  ),
});

async function fetchSettings() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .maybeSingle();
  if (error) throw new Error("Settings could not be loaded.");
  return data;
}

interface Form {
  low: string;
  critical: string;
  approval: boolean;
  minQty: string;
  open: string;
  close: string;
  helpline: string;
}
const blank: Form = {
  low: "",
  critical: "",
  approval: false,
  minQty: "0",
  open: "",
  close: "",
  helpline: "",
};

function SettingsPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["app-settings"],
    queryFn: fetchSettings,
  });
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const s = query.data;
    if (s)
      setForm({
        low: String(s.low_stock_threshold),
        critical: String(s.critical_stock_threshold),
        approval: s.transfer_approval_required,
        minQty: String(s.transfer_approval_min_quantity),
        open: s.operating_open.slice(0, 5),
        close: s.operating_close.slice(0, 5),
        helpline: s.state_helpline,
      });
  }, [query.data]);

  const save = useMutation({
    mutationFn: async (v: ReturnType<typeof settingsSchema.parse>) => {
      const { error } = await supabase.from("app_settings").upsert(
        {
          id: true,
          low_stock_threshold: v.lowStockThreshold,
          critical_stock_threshold: v.criticalStockThreshold,
          transfer_approval_required: v.transferApprovalRequired,
          transfer_approval_min_quantity: v.transferApprovalMinQuantity,
          operating_open: v.operatingOpen,
          operating_close: v.operatingClose,
          state_helpline: v.stateHelpline,
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(friendlyDbError(error));
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (e: Error) => setErrors({ form: userMessage(e) }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = settingsSchema.safeParse({
      lowStockThreshold: form.low === "" ? NaN : form.low,
      criticalStockThreshold: form.critical === "" ? NaN : form.critical,
      transferApprovalRequired: form.approval,
      transferApprovalMinQuantity: form.approval
        ? form.minQty === ""
          ? NaN
          : form.minQty
        : 0,
      operatingOpen: form.open,
      operatingClose: form.close,
      stateHelpline: form.helpline,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <div className="tasmac-ws tasmac-ws-mgmt flex flex-col gap-4">
      <PageHeading
        title="Settings"
        description="Stock thresholds, transfer approval, hours and helpline."
      />
      {query.isPending ? (
        <Skeleton
          className="tasmac-settings h-96 w-full"
          aria-label="Loading settings"
        />
      ) : query.isError ? (
        <StatePanel
          tone="error"
          title="Settings could not be loaded"
          description="The service did not respond. Try again."
          action={<RetryButton onClick={() => query.refetch()} />}
        />
      ) : (
        <form
          onSubmit={submit}
          noValidate
          aria-label="Application settings"
          className="tasmac-settings tasmac-op-surface"
        >
          {!query.data ? (
            <p
              role="status"
              className="border-b border-border px-5 py-3 text-sm text-primary"
            >
              Settings have not been configured yet. Enter every value and save
              to create them.
            </p>
          ) : null}
          <Section title="Stock thresholds" id="sec-stock">
            <div className="grid grid-cols-2 gap-4">
              <Field
                id="low"
                label="Low-stock threshold (units)"
                error={errors["lowStockThreshold"]}
              >
                <Input
                  {...errProps("low", errors["lowStockThreshold"])}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={form.low}
                  onChange={(e) => set("low", e.target.value)}
                />
              </Field>
              <Field
                id="critical"
                label="Critical threshold (units)"
                error={errors["criticalStockThreshold"]}
                hint="Must be lower than the low-stock threshold."
              >
                <Input
                  {...errProps("critical", errors["criticalStockThreshold"])}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form.critical}
                  onChange={(e) => set("critical", e.target.value)}
                />
              </Field>
            </div>
          </Section>
          <Section title="Transfer approval" id="sec-transfer">
            <div className="tasmac-transfer-approval">
              <div className="tasmac-transfer-approval-switch">
                <Switch
                  id="approval"
                  checked={form.approval}
                  onCheckedChange={(v) => set("approval", v)}
                />
                <Label htmlFor="approval">Transfers require approval</Label>
              </div>
              {form.approval ? (
                <div className="tasmac-transfer-approval-field">
                  <Field
                    id="min-qty"
                    label="Approval required from quantity (units)"
                    error={errors["transferApprovalMinQuantity"]}
                    hint="0 means every transfer needs approval."
                  >
                    <Input
                      {...errProps(
                        "min-qty",
                        errors["transferApprovalMinQuantity"],
                      )}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={form.minQty}
                      onChange={(e) => set("minQty", e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </Section>
          <Section title="Operating hours & helpline" id="sec-hours">
            <div className="grid grid-cols-2 gap-4">
              <Field
                id="open"
                label="Opening time"
                error={errors["operatingOpen"]}
              >
                <Input
                  {...errProps("open", errors["operatingOpen"])}
                  type="time"
                  value={form.open}
                  onChange={(e) => set("open", e.target.value)}
                />
              </Field>
              <Field
                id="close"
                label="Closing time"
                error={errors["operatingClose"]}
              >
                <Input
                  {...errProps("close", errors["operatingClose"])}
                  type="time"
                  value={form.close}
                  onChange={(e) => set("close", e.target.value)}
                />
              </Field>
            </div>
            <Field
              id="helpline"
              label="State helpline"
              error={errors["stateHelpline"]}
            >
              <Input
                {...errProps("helpline", errors["stateHelpline"])}
                type="tel"
                maxLength={20}
                value={form.helpline}
                onChange={(e) => set("helpline", e.target.value)}
              />
            </Field>
          </Section>
          <div className="tasmac-settings-footer">
            <div className="min-w-0 text-xs text-muted-foreground">
              {errors["form"] ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors["form"]}
                </p>
              ) : query.data ? (
                <>
                  Last changed{" "}
                  {new Date(query.data.updated_at).toLocaleString()}
                </>
              ) : null}
            </div>
            <Button
              size="lg"
              type="submit"
              className="tasmac-btn tasmac-btn-primary min-w-[8.5rem]"
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section className="tasmac-settings-section" aria-labelledby={id}>
      <h2 id={id} className="tasmac-section-title">
        {title}
      </h2>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}
