import { AGENT_STALE_AFTER_HOURS } from "./constants";

// El inventario es la última foto que mandó el agente. Pasadas 48 h sin
// respuesta se muestra como caducado (§6), sin ocultarlo ni fingir que está
// al día.
export function isInventoryStale(collectedAt: string, now: Date): boolean {
  const ageMs = now.getTime() - new Date(collectedAt).getTime();
  return ageMs > AGENT_STALE_AFTER_HOURS * 60 * 60 * 1000;
}
