import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  EMAIL_SENT_NOTICE,
  authErrorMessage,
  cooldownRemaining,
} from "@/lib/auth-messages";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark } from "@/components/shell/states";
import { Button, Input, Label } from "@4rged-ai/platform";
import { ArrowLeft, Eye, EyeOff, Info } from "lucide-react";

const searchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.enum(["expired"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in · TASMAC Inventory" },
      {
        name: "description",
        content: "Sign in to TASMAC inventory and stock tracking.",
      },
      { property: "og:title", content: "Sign in · TASMAC Inventory" },
      {
        property: "og:description",
        content: "Sign in to TASMAC inventory and stock tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup" | "forgot" | "resend";

function safeRedirect(target: string | undefined): string {
  if (!target) return "/dashboard";
  try {
    const url = new URL(target, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      url.pathname.startsWith("/login")
    )
      return "/dashboard";
    return url.pathname + url.search;
  } catch {
    return "/dashboard";
  }
}

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setErrorText] = useState<string>();
  const [errField, setErrField] = useState<
    "email" | "password" | "full-name" | undefined
  >();
  const [showPw, setShowPw] = useState(false);
  const setError = (
    msg?: string,
    field?: "email" | "password" | "full-name",
  ) => {
    setErrorText(msg);
    setErrField(msg ? field : undefined);
  };
  const [notice, setNotice] = useState<string | undefined>(
    search.reason === "expired"
      ? "Your session has expired. Sign in again to continue."
      : undefined,
  );

  const [lastSent, setLastSent] = useState<number>();
  const [now, setNow] = useState(() => Date.now());
  const wait = cooldownRemaining(lastSent, now);
  useEffect(() => {
    if (!wait) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wait]);
  const emailMode = mode !== "signin";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setNotice(undefined);
    const emailOk = z.string().trim().email().safeParse(email).success;
    if (!emailOk) return setError("Enter a valid email address.", "email");
    if (emailMode && wait)
      return setError(`Wait ${wait} seconds before requesting another email.`);
    if (
      (mode === "signin" || mode === "signup") &&
      password.length < (mode === "signup" ? 8 : 1)
    ) {
      return setError(
        mode === "signup"
          ? "Password must be at least 8 characters."
          : "Enter your password.",
        "password",
      );
    }
    if (mode === "signup" && fullName.trim().length < 2)
      return setError("Enter your full name.", "full-name");

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) return setError(authErrorMessage(err, "signin"));
        navigate({ to: safeRedirect(search.redirect), replace: true });
      } else if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (err) return setError(authErrorMessage(err, "signup"));
        setLastSent(Date.now());
        setNow(Date.now());
        setMode("signin");
        setPassword("");
        setNotice(
          `${EMAIL_SENT_NOTICE.signup} A State Administrator must then approve your access.`,
        );
      } else if (mode === "resend") {
        const { error: err } = await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) return setError(authErrorMessage(err, "resend"));
        setLastSent(Date.now());
        setNow(Date.now());
        setMode("signin");
        setNotice(EMAIL_SENT_NOTICE.resend);
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/reset-password`,
          },
        );
        if (err) return setError(authErrorMessage(err, "forgot"));
        setLastSent(Date.now());
        setNow(Date.now());
        setMode("signin");
        setNotice(EMAIL_SENT_NOTICE.forgot);
      }
    } catch {
      setError(
        "The TASMAC service could not be reached. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    signin: "Sign in",
    signup: "Request an account",
    forgot: "Reset password",
    resend: "Resend confirmation email",
  };

  const go = (m: Mode) => {
    setMode(m);
    setError(undefined);
  };

  async function signInWithProvider(provider: "google" | "apple") {
    setError(undefined);
    setNotice(undefined);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (err) {
      setBusy(false);
      setError(authErrorMessage(err, "signin"));
    }
  }
  const fieldErr = (id: "email" | "password" | "full-name") =>
    error && errField === id ? (
      <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
        {error}
      </p>
    ) : null;
  const aria = (id: "email" | "password" | "full-name") => ({
    "aria-invalid": Boolean(error && errField === id),
    "aria-describedby": error && errField === id ? `${id}-error` : undefined,
  });

  return (
    <main className="tasmac-auth">
      <div className="tasmac-auth-panel">
        <div className={`tasmac-auth-header ${mode === "signin" ? "mb-5" : ""}`}>
          <div className="tasmac-auth-brand">
            <BrandMark />
            <div className="tasmac-auth-brand-copy">
              <span className="tasmac-auth-brand-name">TASMAC</span>
              <span className="tasmac-auth-brand-product">Inventory Hub</span>
            </div>
          </div>
          <h1 className="tasmac-auth-title">{titles[mode]}</h1>
        </div>
        {mode !== "signin" ? (
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Your access is activated after State Administrator approval."
              : "We will email a link to this address."}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="tasmac-auth-notice">
            <Info aria-hidden />
            <span>{notice}</span>
          </p>
        ) : null}
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {mode === "signup" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                autoComplete="name"
                value={fullName}
                {...aria("full-name")}
                onChange={(e) => setFullName(e.target.value)}
              />
              {fieldErr("full-name")}
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete={mode === "signin" ? "username" : "email"}
              value={email}
              {...aria("email")}
              onChange={(e) => setEmail(e.target.value)}
            />
            {fieldErr("email")}
          </div>
          {mode === "signin" || mode === "signup" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="tasmac-auth-pw">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  value={password}
                  {...aria("password")}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="tasmac-btn tasmac-auth-pw-toggle"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                  aria-controls="password"
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
              {fieldErr("password")}
            </div>
          ) : null}
          {error && !errField ? (
            <p role="alert" className="tasmac-auth-error">
              {error}
            </p>
          ) : null}
          <Button
            size="lg"
            type="submit"
            className="tasmac-btn tasmac-btn-primary w-full"
            disabled={busy || (emailMode && wait > 0)}
          >
            {busy
              ? "Please wait…"
              : emailMode && wait > 0
                ? `Wait ${wait}s`
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "resend"
                      ? "Resend confirmation"
                      : "Send reset link"}
          </Button>
        </form>
        {mode === "signin" ? (
          <>
            <div className="tasmac-auth-divider" aria-hidden>
              <span />
              <span>or continue with</span>
              <span />
            </div>
            <div className="tasmac-auth-socials">
              <Button
                type="button"
                variant="outline"
                className="tasmac-btn tasmac-auth-social"
                disabled={busy}
                onClick={() => void signInWithProvider("google")}
              >
                <GoogleMark />
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="tasmac-btn tasmac-auth-social"
                disabled={busy}
                onClick={() => void signInWithProvider("apple")}
              >
                <AppleMark />
                Apple
              </Button>
            </div>
          </>
        ) : null}
        <div className="mt-5 flex flex-col items-start gap-1 border-t border-border pt-4">
          {mode === "signin" ? (
            <>
              <AuthLink onClick={() => go("forgot")}>Forgot password?</AuthLink>
              <AuthLink onClick={() => go("signup")}>
                No account? Request access
              </AuthLink>
              <AuthLink onClick={() => go("resend")}>
                Didn&apos;t get the confirmation email? Resend
              </AuthLink>
            </>
          ) : (
            <AuthLink onClick={() => go("signin")}>
              <ArrowLeft aria-hidden />
              Back to sign in
            </AuthLink>
          )}
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="tasmac-auth-provider-icon">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.04H12v3.86h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.34Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.91A5.98 5.98 0 0 1 6.1 12c0-.66.11-1.3.31-1.91V7.51H3.06A10 10 0 0 0 2 12c0 1.62.39 3.16 1.06 4.49l3.35-2.58Z" />
      <path fill="#EA4335" d="M12 5.97c1.47 0 2.79.5 3.83 1.49l2.87-2.87C16.95 2.95 14.7 2 12 2a10 10 0 0 0-8.94 5.51l3.35 2.58C7.2 7.73 9.4 5.97 12 5.97Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="tasmac-auth-provider-icon fill-current">
      <path d="M16.7 12.7c0-2.12 1.74-3.15 1.82-3.2a3.9 3.9 0 0 0-3.07-1.65c-1.3-.14-2.55.78-3.21.78-.68 0-1.7-.76-2.79-.74A4.1 4.1 0 0 0 6 10c-1.5 2.6-.38 6.42 1.06 8.53.72 1.03 1.56 2.18 2.67 2.14 1.08-.05 1.48-.7 2.79-.7 1.3 0 1.67.7 2.8.68 1.16-.02 1.9-1.04 2.6-2.08.83-1.18 1.16-2.35 1.18-2.41a3.68 3.68 0 0 1-2.4-3.46ZM14.6 6.5c.59-.74 1-1.75.88-2.76-.86.04-1.94.6-2.56 1.32-.56.65-1.06 1.69-.92 2.66.97.07 1.96-.49 2.6-1.22Z" />
    </svg>
  );
}

function AuthLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="tasmac-btn tasmac-btn-quiet"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
