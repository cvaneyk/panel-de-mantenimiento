import { computeSiteStatus } from "@/lib/metrics/status";
import { formatDateTimeMadrid } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { SiteStatusBadge } from "@/components/site-status-badge";
import type { Check } from "@/lib/supabase/types";

type ClientWithSites = {
  id: string;
  name: string;
  sites: { id: string; name: string; url: string; platform: string }[];
};

// Cuántas comprobaciones recientes se traen por sitio para calcular el
// estado. No hay "top N por grupo" en PostgREST sin una función; con el
// número de webs de un cliente en esta fase, traer las últimas N globales y
// agrupar en JS es más simple que una consulta doblemente anidada.
const RECENT_CHECKS_PER_SITE = 3;

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

  const checksBySite = new Map<string, Check[]>();
  if (siteIds.length > 0) {
    const { data: checks } = await supabase
      .from("checks")
      .select("id, site_id, checked_at, ok, status_code, response_ms, error")
      .in("site_id", siteIds)
      .order("checked_at", { ascending: false })
      .limit(RECENT_CHECKS_PER_SITE * siteIds.length)
      .returns<Check[]>();

    for (const check of checks ?? []) {
      const existing = checksBySite.get(check.site_id) ?? [];
      if (existing.length < RECENT_CHECKS_PER_SITE) {
        existing.push(check);
        checksBySite.set(check.site_id, existing);
      }
    }
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
