"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShellFallback />}>
      <LoginForm />
    </Suspense>
  );
}

/** Casca visual idêntica ao formulário, exibida por uma fração de segundo
 * enquanto o Suspense resolve o parâmetro de callbackUrl — evita layout
 * shift perceptível, sem depender de leitura manual de window.location. */
function LoginShellFallback() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <LoginHeader />
        <div className="h-[268px] rounded-2xl border border-border bg-surface" />
      </div>
    </main>
  );
}

function LoginHeader() {
  return (
    <div className="mb-8 flex flex-col items-center gap-2 text-center">
      <div
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
          <path
            d="M6 17 12 6l6 11z"
            stroke="var(--accent)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="14" r="1.4" fill="var(--accent)" />
        </svg>
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Oficina OS</h1>
      <p className="text-sm text-muted">Anápolis/GO</p>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("E-mail ou senha inválidos.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <LoginHeader />

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder="seuemail@oficina.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
