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

export function formatDurationSince(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} h ${remainingMinutes} min`;
}
