"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, ShieldAlert, TriangleAlert } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SentinelLogo } from "@/components/shared/sentinel-logo";
import { cn } from "@/lib/utils/cn";
import { loginSchema } from "@/lib/validation/schemas";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/utils/labels";
import type { Role } from "@/lib/types/enums";

export interface DemoAccount {
  email: string;
  name: string;
  role: string;
  jobTitle: string | null;
}

/**
 * Sign-in form.
 *
 * Real credentials against bcrypt hashes with server-side role enforcement.
 * The demo accounts are listed openly because their password is published in
 * the README — pretending otherwise would be security theatre. The warning
 * about the development session secret is shown when it applies, so nobody
 * mistakes this for a production-hardened deployment.
 */
export function LoginForm({
  demoAccounts,
  demoPassword,
  sessionSecretConfigured,
  next,
}: {
  demoAccounts: DemoAccount[];
  demoPassword: string;
  sessionSecretConfigured: boolean;
  next: string;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState(demoAccounts[0]?.email ?? "");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password, next });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join(".") || "_root";
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as { error: { message?: string } }).error?.message === "string"
            ? (payload as { error: { message: string } }).error.message
            : "Sign-in failed.";
        setFormError(message);
        setSubmitting(false);
        return;
      }

      const destination =
        payload &&
        typeof payload === "object" &&
        "data" in payload &&
        typeof (payload as { data: { next?: string } }).data?.next === "string"
          ? (payload as { data: { next: string } }).data.next
          : "/overview";

      router.push(destination);
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check that it is running and try again.");
      setSubmitting(false);
    }
  };

  const useAccount = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(demoPassword);
    setFormError(null);
    setFieldErrors({});
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <SentinelLogo animated />
        <p className="max-w-sm text-xs leading-relaxed text-foreground-muted">
          Regulatory domain intelligence and evidence management. Discovery is kept separate from
          verification throughout: nothing here is a legal determination.
        </p>
      </div>

      {!sessionSecretConfigured ? (
        <Alert tone="review" title="Development session security" icon={<ShieldAlert />}>
          <code className="font-mono text-[11px]">SESSION_SECRET</code> is not configured, so
          sessions are sealed with an ephemeral secret that changes on every restart. This is{" "}
          <strong>not production-secure authentication</strong>. Set a 32-character secret before
          deploying — see <code className="font-mono text-[11px]">docs/security-checklist.md</code>.
        </Alert>
      ) : null}

      <form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
        noValidate
      >
        <Field
          label="Email address"
          htmlFor="email"
          required
          error={fieldErrors.email ?? null}
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={Boolean(fieldErrors.email)}
            placeholder="you@example.com"
          />
        </Field>

        <Field label="Password" htmlFor="password" required error={fieldErrors.password ?? null}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={Boolean(fieldErrors.password)}
            placeholder="••••••••••"
          />
        </Field>

        {formError ? (
          <Alert tone="critical" icon={<TriangleAlert />} role="alert">
            {formError}
          </Alert>
        ) : null}

        <Button type="submit" variant="primary" loading={submitting} loadingLabel="Signing in…">
          <LogIn aria-hidden="true" />
          Sign in
        </Button>
      </form>

      {demoAccounts.length > 0 ? (
        <section className="rounded-lg border border-border bg-surface-sunken/60 p-4">
          <header className="flex items-center gap-2 pb-1">
            <KeyRound className="size-3.5 text-foreground-subtle" aria-hidden="true" />
            <h2 className="text-xs font-semibold text-foreground">Demo accounts</h2>
            <Badge tone="info" size="sm">
              Password published
            </Badge>
          </header>
          <p className="pb-3 text-[11px] leading-relaxed text-foreground-muted">
            Every account below uses the password{" "}
            <code className="rounded border border-border bg-surface px-1 font-mono text-[10px] text-foreground">
              {demoPassword}
            </code>
            . They are real accounts with real bcrypt-hashed passwords and real server-side role
            enforcement — they are simply not secret. Each role sees a genuinely different set of
            permitted actions.
          </p>

          <ul className="flex flex-col gap-1.5">
            {demoAccounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => useAccount(account)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md border border-border bg-surface",
                    "px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-surface-hover",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    email === account.email && "border-accent/60 bg-accent-subtle/30",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground">{account.name}</span>
                      <Badge tone={account.role === "ADMINISTRATOR" ? "info" : "neutral"} size="sm">
                        {ROLE_LABELS[account.role as Role] ?? account.role}
                      </Badge>
                    </span>
                    <span className="block truncate pt-0.5 font-mono text-[10px] text-foreground-subtle">
                      {account.email}
                    </span>
                    <span className="block pt-1 text-[10px] leading-snug text-foreground-muted">
                      {ROLE_DESCRIPTIONS[account.role as Role] ?? account.jobTitle}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
