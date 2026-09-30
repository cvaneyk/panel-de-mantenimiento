import { formatDateTimeMadrid } from "@/lib/format";
import { isInventoryStale } from "@/lib/metrics/inventory";
import { AGENT_STALE_AFTER_HOURS } from "@/lib/metrics/constants";
import type { BackupSource, InventoryPlugin, SiteInventory } from "@/lib/supabase/types";

// Inventario interno de WordPress (capa B, §3 del SPEC). Solo lectura: el
// panel informa de lo pendiente, no lo aplica (§2, fuera de la v1).

type Tone = "ok" | "attention" | "neutral";

// Color + glifo, nunca solo color.
const TONE_GLYPH: Record<Tone, { glyph: string; className: string } | null> = {
  ok: { glyph: "●", className: "text-[var(--color-ok)]" },
  attention: { glyph: "▲", className: "text-[var(--color-degraded)]" },
  neutral: null,
};

const BACKUP_SOURCE_LABELS: Record<BackupSource, string> = {
  updraftplus: "UpdraftPlus",
  duplicator: "Duplicator",
  "all-in-one-wp-migration": "All-in-One WP Migration",
};

function Fact({
  label,
  value,
  tone = "neutral",
  note,
}: {
  label: string;
  value: string;
  tone?: Tone;
  note?: string;
}) {
  const glyph = TONE_GLYPH[tone];
  return (
    <div className="border-b border-[var(--color-border)] py-2.5">
      <dt className="text-xs text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5 text-sm tabular-nums">
        {glyph ? (
          <span aria-hidden="true" className={`text-xs ${glyph.className}`}>
            {glyph.glyph}
          </span>
        ) : null}
        <span className="font-mono">{value}</span>
      </dd>
      {note ? <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{note}</p> : null}
    </div>
  );
}

function formatNumber(value: number | null, unit = ""): string {
  if (value === null) return "No disponible";
  return `${value.toLocaleString("es-ES")}${unit}`;
}

function ExtensionTable({
  title,
  items,
}: {
  title: string;
  items: InventoryPlugin[];
}) {
  // Primero lo que tiene actualización pendiente, luego lo activo.
  const sorted = [...items].sort(
    (a, b) =>
      Number(Boolean(b.update_available)) - Number(Boolean(a.update_available)) ||
      Number(b.active) - Number(a.active) ||
      a.name.localeCompare(b.name, "es"),
  );
  const pending = items.filter((item) => item.update_available).length;

  return (
    <div>
      <h3 className="text-sm font-semibold">
        {title}{" "}
        <span className="font-normal text-[var(--color-text-muted)] tabular-nums">
          · {items.length} instalados · {pending} con actualización
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          El agente no ha informado de ninguno.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Versión</th>
                <th className="px-3 py-2 font-medium">Actualización</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr key={item.slug} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-1.5">{item.name}</td>
                  <td className="px-3 py-1.5 text-[var(--color-text-muted)]">
                    {item.active ? "Activo" : "Inactivo"}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums">{item.version}</td>
                  <td className="px-3 py-1.5 font-mono tabular-nums">
                    {item.update_available ? (
                      <span className="text-[var(--color-degraded)]">
                        <span aria-hidden="true">▲ </span>
                        {item.update_available}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">Al día</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function WordPressInventory({ inventory }: { inventory: SiteInventory }) {
  const stale = isInventoryStale(inventory.collected_at, new Date());

  return (
    <div className="space-y-8">
      <p
        className={`text-sm ${
          stale ? "rounded-md bg-amber-50 p-3 text-amber-900" : "text-[var(--color-text-muted)]"
        }`}
      >
        {stale ? (
          <>
            <span aria-hidden="true">▲ </span>
            Datos caducados: el agente no responde desde el{" "}
            {formatDateTimeMadrid(inventory.collected_at)} (más de {AGENT_STALE_AFTER_HOURS} h).
            Comprueba que el mu-plugin sigue instalado y que la clave de{" "}
            <code className="font-mono">wp-config.php</code> es la actual.
          </>
        ) : (
          <>Lectura del agente: {formatDateTimeMadrid(inventory.collected_at)}.</>
        )}
      </p>

      <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        <Fact
          label="WordPress"
          value={
            inventory.wp_version
              ? inventory.core_update_available
                ? `${inventory.wp_version} → ${inventory.core_update_available}`
                : inventory.wp_version
              : "No disponible"
          }
          tone={inventory.wp_version ? (inventory.core_update_available ? "attention" : "ok") : "neutral"}
          note={inventory.core_update_available ? "Hay una versión nueva de WordPress." : undefined}
        />
        <Fact label="PHP" value={inventory.php_version ?? "No disponible"} />
        <Fact
          label="Actualizaciones pendientes"
          value={formatNumber(inventory.updates_pending)}
          tone={
            inventory.updates_pending === null
              ? "neutral"
              : inventory.updates_pending > 0
                ? "attention"
                : "ok"
          }
          note={
            inventory.updates_checked_at
              ? `Según la última comprobación de WordPress: ${formatDateTimeMadrid(inventory.updates_checked_at)}.`
              : "WordPress no ha registrado cuándo comprobó las actualizaciones."
          }
        />
        <Fact
          label="WP_DEBUG"
          value={
            inventory.debug_enabled === null
              ? "No disponible"
              : inventory.debug_enabled
                ? "Activado"
                : "Desactivado"
          }
          tone={
            inventory.debug_enabled === null ? "neutral" : inventory.debug_enabled ? "attention" : "ok"
          }
          note={
            inventory.debug_enabled ? "En producción debería estar desactivado." : undefined
          }
        />
        <Fact
          label="Indexación en buscadores"
          value={
            inventory.search_engines_discouraged === null
              ? "No disponible"
              : inventory.search_engines_discouraged
                ? "Bloqueada"
                : "Permitida"
          }
          tone={
            inventory.search_engines_discouraged === null
              ? "neutral"
              : inventory.search_engines_discouraged
                ? "attention"
                : "ok"
          }
          note={
            inventory.search_engines_discouraged
              ? "Está marcada «Disuadir a los motores de búsqueda» en Ajustes → Lectura."
              : undefined
          }
        />
        <Fact label="Administradores" value={formatNumber(inventory.admin_count)} />
        <Fact
          label="Último backup detectado"
          value={
            inventory.last_backup_at
              ? formatDateTimeMadrid(inventory.last_backup_at)
              : "Sin monitorizar"
          }
          note={
            inventory.last_backup_at
              ? inventory.backup_source
                ? `Detectado por ${BACKUP_SOURCE_LABELS[inventory.backup_source]}.`
                : undefined
              : "No hay rastro de UpdraftPlus, Duplicator ni All-in-One WP Migration. Puede haber backups de otro tipo (hosting, servidor) que el agente no ve."
          }
        />
      </dl>

      <div>
        <h3 className="text-sm font-semibold">Base de datos</h3>
        <dl className="mt-1 grid grid-cols-2 gap-x-8 sm:grid-cols-4">
          <Fact label="Tamaño" value={formatNumber(inventory.db_size_mb, " MB")} />
          <Fact label="Revisiones de entradas" value={formatNumber(inventory.db_revisions)} />
          <Fact label="Transients caducados" value={formatNumber(inventory.db_expired_transients)} />
          <Fact label="Opciones con autoload" value={formatNumber(inventory.db_autoload_kb, " KB")} />
        </dl>
      </div>

      <ExtensionTable title="Plugins" items={inventory.plugins} />
      <ExtensionTable title="Temas" items={inventory.themes} />
    </div>
  );
}
