import { describe, expect, it } from "vitest";
import { buildUptimeBars, lastMadridDays, madridDay, uptimePercent } from "./uptime";
import { isInventoryStale } from "./inventory";

const NOW = new Date("2026-09-30T10:00:00Z");

describe("madridDay", () => {
  it("usa el día de Madrid, no el de UTC", () => {
    // 23:30 UTC del 29 son las 01:30 del 30 en Madrid (horario de verano).
    expect(madridDay(new Date("2026-09-29T23:30:00Z"))).toBe("2026-09-30");
  });
});

describe("lastMadridDays", () => {
  it("devuelve N días acabando hoy, del más antiguo al más reciente", () => {
    expect(lastMadridDays(NOW, 3)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30"]);
  });

  it("cruza el cambio de mes", () => {
    expect(lastMadridDays(new Date("2026-10-01T10:00:00Z"), 2)).toEqual([
      "2026-09-30",
      "2026-10-01",
    ]);
  });
});

describe("buildUptimeBars", () => {
  const days = ["2026-09-28", "2026-09-29", "2026-09-30"];

  it("un día sin comprobaciones es 'no_data', nunca 'ok'", () => {
    const bars = buildUptimeBars(days, [], [], NOW);
    expect(bars.map((bar) => bar.status)).toEqual(["no_data", "no_data", "no_data"]);
  });

  it("distingue días correctos de días con fallos sueltos", () => {
    const bars = buildUptimeBars(
      days,
      [
        { site_id: "s", day: "2026-09-28", checks_total: 288, checks_failed: 0 },
        { site_id: "s", day: "2026-09-29", checks_total: 288, checks_failed: 1 },
      ],
      [],
      NOW,
    );
    expect(bars.map((bar) => bar.status)).toEqual(["ok", "degraded", "no_data"]);
  });

  it("marca como caída todos los días que abarca una incidencia", () => {
    const bars = buildUptimeBars(
      days,
      [
        { site_id: "s", day: "2026-09-28", checks_total: 288, checks_failed: 10 },
        { site_id: "s", day: "2026-09-29", checks_total: 288, checks_failed: 40 },
        { site_id: "s", day: "2026-09-30", checks_total: 100, checks_failed: 0 },
      ],
      [{ opened_at: "2026-09-28T22:00:00Z", resolved_at: "2026-09-29T08:00:00Z" }],
      NOW,
    );
    // 22:00 UTC del 28 ya es día 29 en Madrid: solo el 29 es caída.
    expect(bars.map((bar) => bar.status)).toEqual(["degraded", "down", "ok"]);
  });

  it("una incidencia sin resolver llega hasta hoy", () => {
    const bars = buildUptimeBars(
      days,
      [],
      [{ opened_at: "2026-09-29T10:00:00Z", resolved_at: null }],
      NOW,
    );
    expect(bars.map((bar) => bar.status)).toEqual(["no_data", "down", "down"]);
  });
});

describe("uptimePercent", () => {
  it("es null sin comprobaciones", () => {
    expect(uptimePercent(buildUptimeBars(["2026-09-30"], [], [], NOW))).toBeNull();
  });

  it("es checks_ok / checks_total sobre todo el periodo", () => {
    const bars = buildUptimeBars(
      ["2026-09-29", "2026-09-30"],
      [
        { site_id: "s", day: "2026-09-29", checks_total: 100, checks_failed: 1 },
        { site_id: "s", day: "2026-09-30", checks_total: 100, checks_failed: 0 },
      ],
      [],
      NOW,
    );
    expect(uptimePercent(bars)).toBeCloseTo(99.5);
  });
});

describe("isInventoryStale", () => {
  it("no está caducado con menos de 48 h", () => {
    expect(isInventoryStale("2026-09-28T11:00:00Z", NOW)).toBe(false);
  });

  it("está caducado con más de 48 h", () => {
    expect(isInventoryStale("2026-09-28T09:00:00Z", NOW)).toBe(true);
  });
});
