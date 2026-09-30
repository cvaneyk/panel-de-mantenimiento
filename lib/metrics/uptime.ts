import type { UptimeDailyRow } from "@/lib/supabase/types";

// Estado de una barra diaria (§7 del SPEC, "Barras de uptime").
export type UptimeDayStatus = "ok" | "degraded" | "down" | "no_data";

export type UptimeBar = {
  day: string; // YYYY-MM-DD en hora de Madrid
  status: UptimeDayStatus;
  checksTotal: number;
  checksFailed: number;
};

export type DownIncidentSpan = {
  opened_at: string;
  resolved_at: string | null;
};

const MADRID_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Día natural en Madrid (YYYY-MM-DD) de un instante.
export function madridDay(instant: Date): string {
  return MADRID_DAY.format(instant);
}

function shiftDay(day: string, deltaDays: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date! + deltaDays))
    .toISOString()
    .slice(0, 10);
}

// Los `count` últimos días en Madrid, del más antiguo a hoy.
export function lastMadridDays(now: Date, count: number): string[] {
  const today = madridDay(now);
  return Array.from({ length: count }, (_, index) => shiftDay(today, index - (count - 1)));
}

// Una barra por día. "down" solo si hubo incidencia de caída ese día (la
// definición de caída es de §6: 3 fallos seguidos, ya aplicada al abrirla);
// fallos sueltos sin incidencia son "degraded". Un día sin comprobaciones es
// "no_data", nunca "ok".
export function buildUptimeBars(
  days: readonly string[],
  daily: readonly UptimeDailyRow[],
  downIncidents: readonly DownIncidentSpan[],
  now: Date,
): UptimeBar[] {
  const byDay = new Map(daily.map((row) => [row.day, row]));

  const downDays = new Set<string>();
  for (const incident of downIncidents) {
    const first = madridDay(new Date(incident.opened_at));
    const last = madridDay(incident.resolved_at ? new Date(incident.resolved_at) : now);
    for (let day = first; day <= last; day = shiftDay(day, 1)) {
      downDays.add(day);
    }
  }

  return days.map((day) => {
    const row = byDay.get(day);
    const checksTotal = row?.checks_total ?? 0;
    const checksFailed = row?.checks_failed ?? 0;

    let status: UptimeDayStatus;
    if (downDays.has(day)) status = "down";
    else if (checksTotal === 0) status = "no_data";
    else if (checksFailed > 0) status = "degraded";
    else status = "ok";

    return { day, status, checksTotal, checksFailed };
  });
}

// Uptime del periodo (§6): checks_ok / checks_total. null si no hay
// comprobaciones: no hay porcentaje que mostrar, y 100 % sería mentir.
export function uptimePercent(bars: readonly UptimeBar[]): number | null {
  const total = bars.reduce((sum, bar) => sum + bar.checksTotal, 0);
  if (total === 0) return null;
  const failed = bars.reduce((sum, bar) => sum + bar.checksFailed, 0);
  return ((total - failed) / total) * 100;
}
