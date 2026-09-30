import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UPTIME_HISTORY_DAYS } from "@/lib/metrics/constants";
import {
  buildUptimeBars,
  lastMadridDays,
  type DownIncidentSpan,
  type UptimeBar,
} from "@/lib/metrics/uptime";
import type { UptimeDailyRow } from "@/lib/supabase/types";

// Lecturas compartidas por las vistas de agencia y de cliente para la parte
// visual (barras de uptime y capturas). Siempre con el cliente de Supabase
// del usuario: RLS decide qué se ve (regla 4 del CLAUDE.md).

type DownIncidentRow = DownIncidentSpan & { site_id: string };

export async function getUptimeBars(
  supabase: SupabaseClient,
  siteIds: string[],
): Promise<Map<string, UptimeBar[]>> {
  const result = new Map<string, UptimeBar[]>();
  if (siteIds.length === 0) return result;

  const now = new Date();
  const days = lastMadridDays(now, UPTIME_HISTORY_DAYS);
  // Margen de un día en UTC para no perder incidencias que empiezan justo
  // antes de la medianoche de Madrid del primer día.
  const windowStart = new Date(`${days[0]}T00:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - 1);

  const [{ data: dailyData }, { data: incidents }] = await Promise.all([
    supabase.rpc("uptime_daily", { p_site_ids: siteIds, p_days: UPTIME_HISTORY_DAYS }),
    supabase
      .from("incidents")
      .select("site_id, opened_at, resolved_at")
      .eq("kind", "down")
      .in("site_id", siteIds)
      .or(`resolved_at.is.null,resolved_at.gte.${windowStart.toISOString()}`)
      .returns<DownIncidentRow[]>(),
  ]);

  // El cliente de Supabase no está tipado con el esquema (ver types.ts), así
  // que la forma de la fila se fija aquí, igual que .returns<>() en las tablas.
  const daily = (dailyData ?? []) as UptimeDailyRow[];

  for (const siteId of siteIds) {
    result.set(
      siteId,
      buildUptimeBars(
        days,
        daily.filter((row) => row.site_id === siteId),
        (incidents ?? []).filter((row) => row.site_id === siteId),
        now,
      ),
    );
  }
  return result;
}

const SCREENSHOT_URL_TTL_SECONDS = 60 * 60;

// URLs firmadas del bucket privado de capturas. La política de Storage
// comprueba que la web es del usuario antes de firmar.
export async function getScreenshotUrls(
  supabase: SupabaseClient,
  sites: { id: string; screenshot_path: string | null }[],
): Promise<Map<string, string>> {
  const withScreenshot = sites.filter(
    (site): site is { id: string; screenshot_path: string } => site.screenshot_path !== null,
  );
  const result = new Map<string, string>();
  if (withScreenshot.length === 0) return result;

  const { data } = await supabase.storage
    .from("site-screenshots")
    .createSignedUrls(
      withScreenshot.map((site) => site.screenshot_path),
      SCREENSHOT_URL_TTL_SECONDS,
    );

  for (const [index, signed] of (data ?? []).entries()) {
    const site = withScreenshot[index];
    if (site && signed.signedUrl && !signed.error) {
      result.set(site.id, signed.signedUrl);
    }
  }
  return result;
}
