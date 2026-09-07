"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";

import { createBrowserClient } from "../../lib/supabase/browserClient.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card.js";

/**
 * REAL-mode sign-in. Uses the Supabase anon key only (browserClient.ts) —
 * never a service-role key, never in the bundle (task section 13). Shown
 * whenever the app is in REAL mode and no session exists yet.
 */
export function SignInPrompt() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const supabase = createBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="mb-2 h-8 w-8 text-brand-600" aria-hidden="true" />
          <CardTitle>Sign in to Meridian AML</CardTitle>
          <CardDescription>Access is restricted to your organization's analysts and compliance team.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-ink-secondary">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-ink-secondary">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-line px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </div>
            {error && (
              <p role="alert" className="text-xs text-status-critical">
                {error}
              </p>
            )}
            <Button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
