import { computeSiteStatus } from "@/lib/metrics/status";
import { formatDateTimeMadrid } from "@/lib/format";
import { WORKLOG_CATEGORY_LABELS } from "@/lib/worklog-labels";
import { createClient } from "@/lib/supabase/server";
import { SiteStatusBadge } from "@/components/site-status-badge";
import type { Check, WorklogEntry } from "@/lib/supabase/types";

type ClientWithSites = {
  id: string;
  name: string;
  sites: { id: string; name: string; url: string; platform: string }[];
};

// Cuántas comprobaciones/entradas recientes se traen por sitio. No hay "top N
// por grupo" en PostgREST sin una función; con el número de webs de un
// cliente en esta fase, traer las últimas N globales y agrupar en JS es más
// simple que una consulta doblemente anidada.
const RECENT_CHECKS_PER_SITE = 3;
const RECENT_WORKLOG_PER_SITE = 3;

function groupBySite<T extends { site_id: string }>(
  rows: T[] | null,
  limitPerSite: number,
): Map<string, T[]> {
  const bySite = new Map<string, T[]>();
  for (const row of rows ?? []) {
    const existing = bySite.get(row.site_id) ?? [];
    if (existing.length < limitPerSite) {
      existing.push(row);
      bySite.set(row.site_id, existing);
    }
  }
  return bySite;
}

export default async function ClientePage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, sites(id, name, url, platform)")
    .returns<ClientWithSites[]>();

  if (!clients?.length) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Tu cuenta todavía no tiene ninguna web asociada. Contacta con tu
        agencia si crees que es un error.
      </p>
    );
  }

  const siteIds = clients.flatMap((client) => client.sites.map((site) => site.id));

  let checksBySite = new Map<string, Check[]>();
  let worklogBySite = new Map<string, WorklogEntry[]>();

  if (siteIds.length > 0) {
    const [{ data: checks }, { data: worklog }] = await Promise.all([
      supabase
        .from("checks")
        .select("id, site_id, checked_at, ok, status_code, response_ms, error")
        .in("site_id", siteIds)
        .order("checked_at", { ascending: false })
        .limit(RECENT_CHECKS_PER_SITE * siteIds.length)
        .returns<Check[]>(),
      // RLS ya filtra visible_to_client = true para el rol client.
      supabase
        .from("worklog")
        .select("id, site_id, performed_at, author_id, category, summary, minutes, visible_to_client")
        .in("site_id", siteIds)
        .order("performed_at", { ascending: false })
        .limit(RECENT_WORKLOG_PER_SITE * siteIds.length)
        .returns<WorklogEntry[]>(),
    ]);

    checksBySite = groupBySite(checks, RECENT_CHECKS_PER_SITE);
    worklogBySite = groupBySite(worklog, RECENT_WORKLOG_PER_SITE);
  }

  return (
    <div className="space-y-10">
      {clients.map((client) => (
        <section key={client.id}>
          <h1 className="text-xl font-semibold">{client.name}</h1>

          {client.sites.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Tu agencia todavía no ha dado de alta ninguna web para tu
              cuenta.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {client.sites.map((site) => {
                const summary = computeSiteStatus(checksBySite.get(site.id) ?? []);
                const recentWork = worklogBySite.get(site.id) ?? [];
                return (
                  <li
                    key={site.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{site.name}</p>
                      <SiteStatusBadge status={summary.status} />
                    </div>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[var(--color-text-muted)] hover:underline"
                    >
                      {site.url}
                    </a>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      {summary.status === "unknown"
                        ? "Sin datos de monitorización todavía: la comprobación de disponibilidad está en marcha."
                        : `Última comprobación: ${formatDateTimeMadrid(summary.lastCheckedAt!)}.`}
                    </p>

                    {recentWork.length > 0 ? (
                      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                        <p className="text-xs font-medium text-[var(--color-text-muted)]">
                          Últimas actualizaciones
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {recentWork.map((entry) => (
                            <li key={entry.id} className="text-sm">
                              <span className="text-[var(--color-text-muted)]">
                                {formatDateTimeMadrid(entry.performed_at)} ·{" "}
                                {WORKLOG_CATEGORY_LABELS[entry.category]} —{" "}
                              </span>
                              {entry.summary}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
