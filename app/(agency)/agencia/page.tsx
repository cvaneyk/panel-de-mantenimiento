import { computeSiteStatus } from "@/lib/metrics/status";
import { formatDateTimeMadrid, formatDurationSince } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { SiteStatusBadge } from "@/components/site-status-badge";
import type { Check } from "@/lib/supabase/types";
import { inviteMember } from "./actions";

type ClientRow = {
  id: string;
  name: string;
  contact_email: string;
  status: string;
  sites: { count: number }[];
};

type SiteRow = {
  id: string;
  name: string;
  url: string;
  client: { name: string } | null;
  checks: Check[];
};

const INCIDENT_KIND_LABELS: Record<string, string> = {
  down: "Caída",
  ssl_expiring: "SSL a punto de caducar",
  slow: "Web lenta",
};

type OpenIncidentRow = {
  id: number;
  opened_at: string;
  kind: string;
  detail: string | null;
  site: { name: string; url: string; client: { name: string } | null } | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  faltan_datos: "Indica un cliente y un email para invitar.",
  email_ya_invitado: "Ese email ya tiene una invitación o una cuenta.",
  invitacion_fallida: "No hemos podido enviar la invitación. Inténtalo de nuevo.",
  membership_fallida:
    "Se ha creado el usuario pero no hemos podido darle acceso al cliente.",
};

export default async function AgenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const supabase = await createClient();

  const [{ data: sites }, { data: clients }, { data: openIncidents }] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name, url, client:clients(name), checks(id, site_id, checked_at, ok, status_code, response_ms, error)")
      .order("checked_at", { referencedTable: "checks", ascending: false })
      .limit(3, { referencedTable: "checks" })
      .order("name")
      .returns<SiteRow[]>(),
    supabase
      .from("clients")
      .select("id, name, contact_email, status, sites(count)")
      .order("name")
      .returns<ClientRow[]>(),
    supabase
      .from("incidents")
      .select("id, opened_at, kind, detail, site:sites(name, url, client:clients(name))")
      .is("resolved_at", null)
      .order("opened_at", { ascending: false })
      .returns<OpenIncidentRow[]>(),
  ]);

  return (
    <div className="space-y-10">
      {openIncidents?.length ? (
        <section>
          <h2 className="text-lg font-semibold text-red-800">
            Incidencias abiertas ({openIncidents.length})
          </h2>
          <ul className="mt-4 space-y-2">
            {openIncidents.map((incident) => (
              <li
                key={incident.id}
                className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-red-900">
                    {incident.site?.name ?? "Web eliminada"}
                  </span>
                  <span className="ml-2 text-red-700">
                    {incident.site?.client?.name ? `· ${incident.site.client.name}` : null}
                  </span>
                  <p className="mt-0.5 text-red-700">
                    {INCIDENT_KIND_LABELS[incident.kind] ?? incident.kind}
                    {incident.detail ? ` — ${incident.detail}` : ""}
                  </p>
                </div>
                <span className="whitespace-nowrap text-red-700 tabular-nums">
                  Abierta hace {formatDurationSince(incident.opened_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h1 className="text-xl font-semibold">Webs</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Todas las webs de todos los clientes, con su estado más reciente.
        </p>

        <div className="mt-6 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                <th className="px-4 py-2 font-medium">Web</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium tabular-nums">Respuesta</th>
                <th className="px-4 py-2 font-medium">Última comprobación</th>
              </tr>
            </thead>
            <tbody>
              {sites?.length ? (
                sites.map((site) => {
                  const summary = computeSiteStatus(site.checks);
                  return (
                    <tr
                      key={site.id}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="px-4 py-2">
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium hover:underline"
                        >
                          {site.name}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-[var(--color-text-muted)]">
                        {site.client?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <SiteStatusBadge status={summary.status} />
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {summary.lastResponseMs !== null
                          ? `${summary.lastResponseMs} ms`
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-[var(--color-text-muted)]">
                        {summary.lastCheckedAt
                          ? formatDateTimeMadrid(summary.lastCheckedAt)
                          : "Sin comprobaciones todavía"}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-[var(--color-text-muted)]"
                  >
                    No hay webs dadas de alta todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Clientes</h2>

        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Contacto</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium tabular-nums">Webs</th>
              </tr>
            </thead>
            <tbody>
              {clients?.length ? (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="px-4 py-2">{client.name}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">
                      {client.contact_email}
                    </td>
                    <td className="px-4 py-2">{client.status}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {client.sites[0]?.count ?? 0}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-[var(--color-text-muted)]"
                  >
                    No hay clientes dados de alta todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-sm">
        <h2 className="text-base font-semibold">Invitar a un contacto</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Le enviamos un enlace de acceso a su email. Al entrar, verá solo las
          webs del cliente elegido.
        </p>

        {ok === "invitado" ? (
          <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            Invitación enviada.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {ERROR_MESSAGES[error] ?? "Ha ocurrido un error. Inténtalo de nuevo."}
          </p>
        ) : null}

        <form action={inviteMember} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="clientId"
              className="block text-sm font-medium text-[var(--color-text)]"
            >
              Cliente
            </label>
            <select
              id="clientId"
              name="clientId"
              required
              defaultValue=""
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            >
              <option value="" disabled>
                Selecciona un cliente
              </option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--color-text)]"
            >
              Email del contacto
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              placeholder="contacto@cliente.com"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
          >
            Enviar invitación
          </button>
        </form>
      </section>
    </div>
  );
}
