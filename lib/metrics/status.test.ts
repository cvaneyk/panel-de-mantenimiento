import { describe, expect, it } from "vitest";
import type { Check } from "@/lib/supabase/types";
import { computeSiteStatus } from "./status";

function check(overrides: Partial<Check>): Check {
  return {
    id: 1,
    site_id: "site-1",
    checked_at: "2026-08-16T10:00:00Z",
    ok: true,
    status_code: 200,
    response_ms: 300,
    error: null,
    ...overrides,
  };
}

describe("computeSiteStatus", () => {
  it("es 'unknown' sin comprobaciones todavía", () => {
    expect(computeSiteStatus([]).status).toBe("unknown");
  });

  it("es 'up' si la última comprobación fue correcta", () => {
    const result = computeSiteStatus([
      check({ id: 1, checked_at: "2026-08-16T10:00:00Z", ok: true }),
    ]);
    expect(result.status).toBe("up");
  });

  it("es 'up' tras un único fallo aislado (ruido de red, no caída)", () => {
    const result = computeSiteStatus([
      check({ id: 3, checked_at: "2026-08-16T10:10:00Z", ok: true }),
      check({ id: 2, checked_at: "2026-08-16T10:05:00Z", ok: true }),
      check({ id: 1, checked_at: "2026-08-16T10:00:00Z", ok: false }),
    ]);
    expect(result.status).toBe("up");
  });

  it("es 'down' tras 3 fallos consecutivos", () => {
    const result = computeSiteStatus([
      check({ id: 3, checked_at: "2026-08-16T10:10:00Z", ok: false }),
      check({ id: 2, checked_at: "2026-08-16T10:05:00Z", ok: false }),
      check({ id: 1, checked_at: "2026-08-16T10:00:00Z", ok: false }),
    ]);
    expect(result.status).toBe("down");
  });

  it("vuelve a 'up' en cuanto una comprobación reciente sale bien", () => {
    const result = computeSiteStatus([
      check({ id: 4, checked_at: "2026-08-16T10:15:00Z", ok: true }),
      check({ id: 3, checked_at: "2026-08-16T10:10:00Z", ok: false }),
      check({ id: 2, checked_at: "2026-08-16T10:05:00Z", ok: false }),
      check({ id: 1, checked_at: "2026-08-16T10:00:00Z", ok: false }),
    ]);
    expect(result.status).toBe("up");
  });

  it("no depende del orden de entrada: ordena por checked_at internamente", () => {
    const result = computeSiteStatus([
      check({ id: 1, checked_at: "2026-08-16T10:00:00Z", ok: false }),
      check({ id: 3, checked_at: "2026-08-16T10:10:00Z", ok: false }),
      check({ id: 2, checked_at: "2026-08-16T10:05:00Z", ok: false }),
    ]);
    expect(result.status).toBe("down");
    expect(result.lastCheckedAt).toBe("2026-08-16T10:10:00Z");
  });

  it("informa del tiempo de respuesta de la comprobación más reciente", () => {
    const result = computeSiteStatus([
      check({ id: 1, checked_at: "2026-08-16T10:00:00Z", response_ms: 500 }),
      check({ id: 2, checked_at: "2026-08-16T10:05:00Z", response_ms: 250 }),
    ]);
    expect(result.lastResponseMs).toBe(250);
  });
});
