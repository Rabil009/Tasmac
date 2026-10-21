import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { userMessage } from "@/lib/app-error";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark } from "@/components/shell/states";
import { toast, Button, Input, Label } from "@4rged-ai/platform";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set password · TASMAC Inventory" },
      {
        name: "description",
        content: "Set a new password for your TASMAC account.",
      },
      { property: "og:title", content: "Set password · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Set a new password for your TASMAC account.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN"))
        setReady(true);
    });
    supabase.auth
      .getSession()
      .then(({ data: s }) => setReady((r) => r ?? Boolean(s.session)));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8)
      return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(userMessage(err));
    toast.success("Password saved");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center gap-2 text-sm font-bold tracking-[0.12em]">
          <BrandMark />
          <span>TASMAC</span>
        </div>
        <h1 className="mb-5 text-lg font-semibold">Set your password</h1>
        {ready === false ? (
          <p role="alert" className="text-sm text-destructive">
            This link is invalid or has expired. Request a new reset link from
            the sign-in page.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button size="lg" type="submit" disabled={busy || !ready}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
