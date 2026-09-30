"use client";

import { useActionState } from "react";
import { generateAgentKey, type AgentKeyState } from "./actions";

const INITIAL_STATE: AgentKeyState = { status: "idle" };

export function AgentKeyForm({ siteId, hasKey }: { siteId: string; hasKey: boolean }) {
  const [state, formAction, pending] = useActionState(generateAgentKey, INITIAL_STATE);

  if (state.status === "generated") {
    return (
      <div className="space-y-3 rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface)] p-4 text-sm">
        <p className="font-medium">
          Clave generada. Cópiala ahora: no se vuelve a mostrar.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Sube <code className="font-mono">agent/panel-agent.php</code> a{" "}
            <code className="font-mono">wp-content/mu-plugins/</code> de la web.
          </li>
          <li>
            Añade esta línea a <code className="font-mono">wp-config.php</code>, antes
            de «That&apos;s all, stop editing»:
            <pre className="mt-2 overflow-x-auto rounded bg-[var(--color-bg)] p-2 font-mono text-xs select-all">
              {`define( 'PANEL_AGENT_KEY', '${state.key}' );`}
            </pre>
          </li>
          <li>
            El inventario aparece aquí en la siguiente lectura del agente (cada 6 horas).
          </li>
        </ol>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="siteId" value={siteId} />
      {hasKey ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          Esta web ya tiene clave. Generar una nueva invalida la anterior: el agente
          dejará de responder hasta que actualices <code className="font-mono">wp-config.php</code>.
        </p>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">
          Esta web aún no tiene agente. Genera una clave para instalarlo.
        </p>
      )}
      {state.status === "error" ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60 ${
          hasKey
            ? "border border-[var(--color-border-strong)] text-[var(--color-text)]"
            : "bg-[var(--color-accent)] text-white"
        }`}
      >
        {pending ? "Generando…" : hasKey ? "Generar clave nueva" : "Generar clave del agente"}
      </button>
    </form>
  );
}
