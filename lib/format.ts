// Las fechas se guardan en UTC y se muestran siempre en hora de Madrid
// (convención del CLAUDE.md).
const MADRID_DATETIME = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTimeMadrid(iso: string): string {
  return MADRID_DATETIME.format(new Date(iso));
}
