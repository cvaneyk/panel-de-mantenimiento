import Link from "next/link";
import { notFound } from "next/navigation";
import { computeSiteStatus } from "@/lib/metrics/status";
import { formatDateMadrid, formatDateTimeMadrid } from "@/lib/format";
import { WORKLOG_CATEGORY_LABELS } from "@/lib/worklog-labels";
import { SSL_EXPIRING_WARNING_DAYS } from "@/lib/metrics/constants";
import { createClient } from "@/lib/supabase/server";
import { SiteStatusBadge } from "@/components/site-status-badge";
import { SiteScreenshot } from "@/components/site-screenshot";
import { UptimeBars, UptimeLegend, formatUptimePercent } from "@/components/uptime-bars";
import { WordPressInventory } from "@/components/wordpress-inventory";
import { getScreenshotUrls, getUptimeBars } from "@/lib/site-visuals";
import { uptimePercent } from "@/lib/metrics/uptime";
import type { Check, MetricsDaily, SiteInventory, WorklogEntry } from "@/lib/supabase/types";
import { logWork } from "./actions";
import { AgentKeyForm } from "./agent-key-form";

type SiteDetail = {
  id: string;
  name: string;
  url: string;
  platform: string;
  agent_key_secret_id: string | null;
  screenshot_path: string | null;
  screenshot_taken_at: string | null;
  client: { name: string } | null;
  checks: Check[];
};

const ERROR_MESSAGES: Record<string, string> = {
  faltan_datos: "Indica la categoría y un resumen del trabajo.",
  registro_fallido: "No hemos podido guardar el registro. Inténtalo de nuevo.",
};

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { siteId } = await params;
  const { error, ok } = await searchParams;
  const supabase = await createClient();

  const [
    { data: site },
    { data: worklog },
    { data: metricsDaily },
    { data: inventory },
    uptimeBySite,
  ] = await Promise.all([
    supabase
      .from("sites")
      .select(
        "id, name, url, platform, agent_key_secret_id, screenshot_path, screenshot_taken_at, client:clients(name), checks(id, site_id, checked_at, ok, status_code, response_ms, error)",
      )
      .eq("id", siteId)
      .order("checked_at", { referencedTable: "checks", ascending: false })
      .limit(3, { referencedTable: "checks" })
      .single<SiteDetail>(),
    supabase
      .from("worklog")
      .select("id, site_id, performed_at, author_id, category, summary, minutes, visible_to_client")
      .eq("site_id", siteId)
      .order("performed_at", { ascending: false })
      .returns<WorklogEntry[]>(),
    supabase
      .from("metrics_daily")
      .select("site_id, day, uptime_pct, checks_total, checks_failed, response_ms_avg, response_ms_p95, lcp_ms, inp_ms, cls, lab_performance_score, lab_lcp_ms, lab_cls, lab_tbt_ms, ssl_expires_at")
      .eq("site_id", siteId)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle<MetricsDaily>(),
    supabase
      .from("site_inventory")
      .select("*")
      .eq("site_id", siteId)
      .maybeSingle<SiteInventory>(),
    getUptimeBars(supabase, [siteId]),
  ]);

  if (!site) notFound();

  const screenshotUrls = await getScreenshotUrls(supabase, [site]);
  const uptimeBars = uptimeBySite.get(site.id) ?? [];
  const summary = computeSiteStatus(site.checks);
  const sslDaysLeft = metricsDaily?.ssl_expires_at
    ? Math.floor((new Date(metricsDaily.ssl_expires_at).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="space-y-10">
      <div>
        <Link href="/agencia" className="text-sm text-[var(--color-text-muted)] hover:underline">
          ← Todas las webs
        </Link>

        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{site.name}</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {site.client?.name ?? "—"} ·{" "}
              <a href={site.url} target="_blank" rel="noreferrer" className="hover:underline">
                {site.url}
              </a>
            </p>
          </div>
          <SiteStatusBadge status={summary.status} />
        </div>
      </div>

      <section className="grid gap-6 sm:grid-cols-[220px_1fr]">
        <SiteScreenshot
          url={screenshotUrls.get(site.id)}
          takenAt={site.screenshot_taken_at}
          siteName={site.name}
          size="large"
        />
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-semibold">Disponibilidad · 30 días</h2>
            <p className="font-mono text-2xl tabular-nums">
              {formatUptimePercent(uptimePercent(uptimeBars))}
            </p>
          </div>
          <div className="mt-3">
            <UptimeBars bars={uptimeBars} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-[var(--color-text-muted)] tabular-nums">
            <span>Hace 30 días</span>
            <span>Hoy</span>
          </div>
          <div className="mt-3">
            <UptimeLegend />
          </div>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            {summary.lastCheckedAt
              ? `Última comprobación: ${formatDateTimeMadrid(summary.lastCheckedAt)}${
                  summary.lastResponseMs !== null ? ` · ${summary.lastResponseMs} ms` : ""
                }.`
              : "Sin comprobaciones todavía: el recolector de uptime aún no ha pasado por esta web."}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold">Rendimiento y SSL</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {metricsDaily
            ? `Última comprobación: ${formatDateMadrid(metricsDaily.day)}.`
            : "Todavía no hay datos: la comprobación diaria de SSL y Core Web Vitals aún no se ha ejecutado para esta web."}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <dt className="text-xs text-[var(--color-text-muted)]">Certificado SSL</dt>
            <dd
              className={`mt-1 text-sm tabular-nums ${
                sslDaysLeft !== null && sslDaysLeft <= SSL_EXPIRING_WARNING_DAYS
                  ? "text-red-700"
                  : ""
              }`}
            >
              {metricsDaily?.ssl_expires_at
                ? `Caduca el ${formatDateMadrid(metricsDaily.ssl_expires_at)} (${sslDaysLeft} d)`
                : "No disponible"}
            </dd>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <dt className="text-xs text-[var(--color-text-muted)]">LCP real (móvil)</dt>
            <dd className="mt-1 text-sm tabular-nums">
              {metricsDaily?.lcp_ms !== null && metricsDaily?.lcp_ms !== undefined
                ? `${metricsDaily.lcp_ms} ms`
                : "No disponible"}
            </dd>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <dt className="text-xs text-[var(--color-text-muted)]">INP real (móvil)</dt>
            <dd className="mt-1 text-sm tabular-nums">
              {metricsDaily?.inp_ms !== null && metricsDaily?.inp_ms !== undefined
                ? `${metricsDaily.inp_ms} ms`
                : "No disponible"}
            </dd>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <dt className="text-xs text-[var(--color-text-muted)]">CLS real (móvil)</dt>
            <dd className="mt-1 text-sm tabular-nums">
              {metricsDaily?.cls !== null && metricsDaily?.cls !== undefined
                ? metricsDaily.cls.toFixed(2)
                : "No disponible"}
            </dd>
          </div>
        </dl>
        {metricsDaily && metricsDaily.lcp_ms === null ? (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Sin Core Web Vitals: Google solo las publica para webs con tráfico
            suficiente de usuarios reales de Chrome, y esta todavía no llega.
          </p>
        ) : null}

        <h3 className="mt-6 text-sm font-semibold">
          Prueba de laboratorio{" "}
          <span className="font-normal text-[var(--color-text-muted)]">
            · simulada, móvil
          </span>
        </h3>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Una sola carga de la portada en un móvil y una red simulados por
          Google (Lighthouse). Sirve para detectar problemas y comparar día a
          día; no es lo que viven los usuarios reales.
        </p>
        {metricsDaily?.lab_performance_score !== null &&
        metricsDaily?.lab_performance_score !== undefined ? (
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-3">
              <dt className="text-xs text-[var(--color-text-muted)]">Rendimiento</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {metricsDaily.lab_performance_score} / 100
              </dd>
            </div>
            <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-3">
              <dt className="text-xs text-[var(--color-text-muted)]">LCP simulado</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {metricsDaily.lab_lcp_ms !== null ? `${metricsDaily.lab_lcp_ms} ms` : "No disponible"}
              </dd>
            </div>
            <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-3">
              <dt className="text-xs text-[var(--color-text-muted)]">CLS simulado</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {metricsDaily.lab_cls !== null ? metricsDaily.lab_cls.toFixed(3) : "No disponible"}
              </dd>
            </div>
            <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-3">
              <dt className="text-xs text-[var(--color-text-muted)]">Bloqueo total (TBT)</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {metricsDaily.lab_tbt_ms !== null ? `${metricsDaily.lab_tbt_ms} ms` : "No disponible"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Sin prueba de laboratorio todavía: se ejecuta en la comprobación
            diaria de las 3:00.
          </p>
        )}
      </section>

      {site.platform === "wordpress" ? (
        <section>
          <h2 className="text-base font-semibold">WordPress</h2>
          <div className="mt-3">
            {inventory ? (
              <WordPressInventory inventory={inventory} />
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                {site.agent_key_secret_id
                  ? "Clave generada, pero el agente aún no ha respondido. Comprueba que el mu-plugin está en wp-content/mu-plugins/ y la clave en wp-config.php; el recolector pasa cada 6 horas."
                  : "Sin inventario: esta web no tiene el agente instalado. Con él verás versiones, plugins, temas, backups y base de datos."}
              </p>
            )}
          </div>
          <div className="mt-6 max-w-xl">
            <h3 className="text-sm font-semibold">Clave del agente</h3>
            <div className="mt-2">
              <AgentKeyForm siteId={site.id} hasKey={site.agent_key_secret_id !== null} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="max-w-lg">
        <h2 className="text-base font-semibold">Registrar trabajo</h2>

        {ok === "registrado" ? (
          <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            Registrado.
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {ERROR_MESSAGES[error] ?? "Ha ocurrido un error. Inténtalo de nuevo."}
          </p>
        ) : null}

        <form action={logWork} className="mt-4 space-y-3">
          <input type="hidden" name="siteId" value={site.id} />

          <div className="flex gap-3">
            <select
              name="category"
              required
              defaultValue="update"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            >
              {Object.entries(WORKLOG_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <input
              name="minutes"
              type="number"
              min={0}
              placeholder="min"
              className="w-20 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <textarea
            name="summary"
            required
            rows={2}
            placeholder="Qué se ha hecho, en una frase clara para el cliente"
            className="block w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />

          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <input type="checkbox" name="visibleToClient" defaultChecked />
            Visible para el cliente
          </label>

          <button
            type="submit"
            className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
          >
            Registrar
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold">Historial</h2>

        {worklog?.length ? (
          <ul className="mt-4 space-y-2">
            {worklog.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {WORKLOG_CATEGORY_LABELS[entry.category]}
                    {entry.minutes ? ` · ${entry.minutes} min` : ""}
                  </span>
                  <span className="text-[var(--color-text-muted)] tabular-nums">
                    {formatDateTimeMadrid(entry.performed_at)}
                  </span>
                </div>
                <p className="mt-1">{entry.summary}</p>
                {!entry.visible_to_client ? (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Solo visible para la agencia
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            Todavía no hay ningún trabajo registrado en esta web.
          </p>
        )}
      </section>
    </div>
  );
}
