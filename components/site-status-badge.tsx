import type { SiteStatus } from "@/lib/metrics/status";

// El estado nunca se codifica solo con color: cada estado tiene también su
// propia forma, para que se distinga en daltonismo.
const STATUS_CONFIG: Record<
  SiteStatus,
  { label: string; glyph: string; className: string }
> = {
  up: { label: "Activa", glyph: "●", className: "text-emerald-700" },
  down: { label: "Caída", glyph: "▲", className: "text-red-700" },
  unknown: {
    label: "Sin datos",
    glyph: "○",
    className: "text-[var(--color-text-muted)]",
  },
};

export function SiteStatusBadge({ status }: { status: SiteStatus }) {
  const config = STATUS_CONFIG[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${config.className}`}>
      <span aria-hidden="true">{config.glyph}</span>
      {config.label}
    </span>
  );
}
