import Link from "next/link";
import { notFound } from "next/navigation";
import { computeSiteStatus } from "@/lib/metrics/status";
import { formatDateMadrid, formatDateTimeMadrid } from "@/lib/format";
import { WORKLOG_CATEGORY_LABELS } from "@/lib/worklog-labels";
import { SSL_EXPIRING_WARNING_DAYS } from "@/lib/metrics/constants";
import { createClient } from "@/lib/supabase/server";
import { SiteStatusBadge } from "@/components/site-status-badge";
import type { Check, MetricsDaily, WorklogEntry } from "@/lib/supabase/types";
import { logWork } from "./actions";

type SiteDetail = {
  id: string;
  name: string;
  url: string;
  platform: string;
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

  const [{ data: site }, { data: worklog }, { data: metricsDaily }] = await Promise.all([
    supabase
      .from("sites")
      .select(
        "id, name, url, platform, client:clients(name), checks(id, site_id, checked_at, ok, status_code, response_ms, error)",
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
      .select("site_id, day, uptime_pct, checks_total, checks_failed, response_ms_avg, response_ms_p95, lcp_ms, inp_ms, cls, ssl_expires_at")
      .eq("site_id", siteId)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle<MetricsDaily>(),
  ]);

  if (!site) notFound();

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
            <dt className="text-xs text-[var(--color-text-muted)]">LCP (móvil)</dt>
            <dd className="mt-1 text-sm tabular-nums">
              {metricsDaily?.lcp_ms !== null && metricsDaily?.lcp_ms !== undefined
                ? `${metricsDaily.lcp_ms} ms`
                : "No disponible"}
            </dd>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <dt className="text-xs text-[var(--color-text-muted)]">INP (móvil)</dt>
            <dd className="mt-1 text-sm tabular-nums">
              {metricsDaily?.inp_ms !== null && metricsDaily?.inp_ms !== undefined
                ? `${metricsDaily.inp_ms} ms`
                : "No disponible"}
            </dd>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <dt className="text-xs text-[var(--color-text-muted)]">CLS (móvil)</dt>
            <dd className="mt-1 text-sm tabular-nums">
              {metricsDaily?.cls !== null && metricsDaily?.cls !== undefined
                ? metricsDaily.cls.toFixed(2)
                : "No disponible"}
            </dd>
          </div>
        </dl>
        {metricsDaily && metricsDaily.lcp_ms === null ? (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Sin Core Web Vitals: Google no tiene tráfico real suficiente de
            esta web para medirlas (field data de Chrome).
          </p>
        ) : null}
      </section>

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
