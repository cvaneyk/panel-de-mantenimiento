import type { Check } from "@/lib/supabase/types";
import { DOWN_AFTER_CONSECUTIVE_FAILURES } from "./constants";

export type SiteStatus = "up" | "down" | "unknown";

export type SiteStatusSummary = {
  status: SiteStatus;
  lastCheckedAt: string | null;
  lastResponseMs: number | null;
};

// Caída = las últimas N comprobaciones (§6 del SPEC) han fallado todas. Una
// sola comprobación fallida es ruido de red, no una caída. Sin comprobaciones
// todavía, el estado es "unknown": nunca se finge un "up" sin datos.
export function computeSiteStatus(checks: readonly Check[]): SiteStatusSummary {
  if (checks.length === 0) {
    return { status: "unknown", lastCheckedAt: null, lastResponseMs: null };
  }

  const sorted = [...checks].sort(
    (a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime(),
  );
  const mostRecent = sorted[0]!;
  const recentWindow = sorted.slice(0, DOWN_AFTER_CONSECUTIVE_FAILURES);

  const isDown =
    recentWindow.length === DOWN_AFTER_CONSECUTIVE_FAILURES &&
    recentWindow.every((check) => !check.ok);

  return {
    status: isDown ? "down" : "up",
    lastCheckedAt: mostRecent.checked_at,
    lastResponseMs: mostRecent.response_ms,
  };
}
