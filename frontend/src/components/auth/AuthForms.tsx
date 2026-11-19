"use client";

import { AlertCircle, CheckCircle2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Field } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Header({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink-1">{title}</h1>
      <p className="mt-1.5 text-sm text-ink-2">{body}</p>
    </div>
  );
}

function Alert({ tone, children }: { tone: "error" | "good"; children: ReactNode }) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-2 rounded-sm px-3 py-2.5 text-xs ${tone === "error" ? "bg-critical-bg text-critical-ink" : "bg-good-bg text-good-ink"}`}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function friendly(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(msg)) return "Confirm your email first. Check your inbox for the link.";
  if (/already registered/i.test(msg)) return "An account with this email already exists. Sign in instead.";
  if (/rate limit/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
  return msg;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "link" ? "That link is invalid or has expired." : null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  };

  return (
    <>
      <Header title="Sign in" body="Welcome back. Sign in to your workspace." />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-xs text-ink-3 hover:text-ink-1">Forgot password?</Link>
        </div>
        <Button variant="primary" size="lg" type="submit" loading={busy}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">
        No account? <Link href="/signup" className="font-medium text-ink-1 hover:underline">Create one</Link>
      </p>
    </>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const pwErr = password && password.length < 8 ? "At least 8 characters." : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your name.");
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    if (data.session) {
      router.replace("/");
      router.refresh();
    } else setSent(true);
  };

  if (sent)
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 grid size-11 place-items-center rounded-md border border-line bg-surface-2 text-ink-2">
          <MailCheck className="size-5" aria-hidden />
        </div>
        <Header title="Check your email" body={<>We sent a confirmation link to <span className="font-medium text-ink-1">{email}</span>. Open it to activate your account.</>} />
        <Link href="/login" className="text-sm font-medium text-ink-1 hover:underline">Back to sign in</Link>
      </div>
    );

  return (
    <>
      <Header title="Create your account" body="Simulations, vehicles and drive cycles are saved to your private workspace." />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field id="name" label="Name" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="password" label="Password" type="password" autoComplete="new-password" value={password} error={pwErr} hint="At least 8 characters" onChange={(e) => setPassword(e.target.value)} />
        <Button variant="primary" size="lg" type="submit" loading={busy}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">
        Already have an account? <Link href="/login" className="font-medium text-ink-1 hover:underline">Sign in</Link>
      </p>
    </>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email address.");
    setBusy(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    setSent(true);
  };

  return (
    <>
      <Header title="Reset password" body="We'll email you a link to choose a new password." />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {sent && <Alert tone="good">If an account exists for {email}, a reset link is on its way.</Alert>}
        <Field id="email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button variant="primary" size="lg" type="submit" loading={busy} disabled={sent}>Send reset link</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">
        <Link href="/login" className="font-medium text-ink-1 hover:underline">Back to sign in</Link>
      </p>
    </>
  );
}

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    router.replace("/");
    router.refresh();
  };

  return (
    <>
      <Header title="Choose a new password" body="You're signed in through the reset link. Set a new password to continue." />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field id="password" label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field id="confirm" label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button variant="primary" size="lg" type="submit" loading={busy}>Update password</Button>
      </form>
    </>
  );
}
