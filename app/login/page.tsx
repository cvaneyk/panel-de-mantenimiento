"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Status = "idle" | "sending" | "error";

function InvalidLinkNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("error") !== "enlace_invalido") return null;

  return (
    <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
      El enlace ha caducado o ya se ha usado. Pide uno nuevo.
    </p>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus("error");
      setErrorMessage(
        "Email o contraseña incorrectos. Comprueba tus datos e inténtalo de nuevo.",
      );
      return;
    }

    // Redirige al inicio (o a la vista correspondiente por middleware)
    router.push("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <h1 className="text-lg font-semibold text-[var(--color-text)]">
          Panel de mantenimiento
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Accede con tu email y contraseña.
        </p>

        <Suspense fallback={null}>
          <InvalidLinkNotice />
        </Suspense>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--color-text)]"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--color-text)]"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              placeholder="••••••••"
            />
          </div>

          {status === "error" && errorMessage ? (
            <p className="text-sm text-red-700">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {status === "sending" ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </main>
  );
}
