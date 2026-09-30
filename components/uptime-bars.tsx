import type { UptimeBar, UptimeDayStatus } from "@/lib/metrics/uptime";

// Cada estado se distingue por forma además de por color (§7 del SPEC):
// llena, rayada, partida y hueca.
const STATUS_LABELS: Record<UptimeDayStatus, string> = {
  ok: "Correcto",
  degraded: "Con fallos puntuales",
  down: "Caída",
  no_data: "Sin datos",
};

const STRIPES =
  "repeating-linear-gradient(135deg, var(--color-degraded) 0 2px, transparent 2px 4px)";

function dayLabel(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

function barTitle(bar: UptimeBar): string {
  const base = `${dayLabel(bar.day)} · ${STATUS_LABELS[bar.status]}`;
  if (bar.checksTotal === 0) return base;
  return `${base} · ${bar.checksTotal} comprobaciones, ${bar.checksFailed} fallidas`;
}

function BarShape({ status }: { status: UptimeDayStatus }) {
  switch (status) {
    case "ok":
      return <span className="block h-full w-full rounded-[1px] bg-[var(--color-ok)]" />;
    case "degraded":
      return (
        <span
          className="block h-full w-full rounded-[1px] border border-[var(--color-degraded)]"
          style={{ backgroundImage: STRIPES }}
        />
      );
    case "down":
      return (
        <span className="flex h-full w-full flex-col justify-between">
          <span className="block h-[40%] w-full rounded-[1px] bg-[var(--color-down)]" />
          <span className="block h-[40%] w-full rounded-[1px] bg-[var(--color-down)]" />
        </span>
      );
    case "no_data":
      return (
        <span className="block h-full w-full rounded-[1px] border border-[var(--color-border-strong)]" />
      );
  }
}

export function UptimeBars({
  bars,
  size = "md",
}: {
  bars: UptimeBar[];
  size?: "sm" | "md";
}) {
  const counts = bars.reduce<Record<UptimeDayStatus, number>>(
    (acc, bar) => ({ ...acc, [bar.status]: acc[bar.status] + 1 }),
    { ok: 0, degraded: 0, down: 0, no_data: 0 },
  );
  const summary = `Últimos ${bars.length} días: ${counts.ok} correctos, ${counts.degraded} con fallos puntuales, ${counts.down} con caída, ${counts.no_data} sin datos.`;

  return (
    <div
      role="img"
      aria-label={summary}
      className={`flex items-stretch ${size === "sm" ? "h-4 gap-px" : "h-9 gap-[3px]"}`}
    >
      {bars.map((bar) => (
        <span
          key={bar.day}
          title={barTitle(bar)}
          className={size === "sm" ? "w-[3px]" : "min-w-[4px] flex-1"}
        >
          <BarShape status={bar.status} />
        </span>
      ))}
    </div>
  );
}

export function UptimeLegend() {
  const statuses: UptimeDayStatus[] = ["ok", "degraded", "down", "no_data"];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
      {statuses.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[5px]">
            <BarShape status={status} />
          </span>
          {STATUS_LABELS[status]}
        </li>
      ))}
    </ul>
  );
}

export function formatUptimePercent(value: number | null): string {
  return value === null ? "Sin datos" : `${value.toFixed(2)} %`;
}
