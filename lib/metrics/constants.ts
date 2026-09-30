// Umbrales de negocio (§6 del SPEC). Un solo sitio con nombre, nunca números
// sueltos repartidos por el código.

// 3 comprobaciones consecutivas fallidas ≈ 15 min a 5 min por check.
export const DOWN_AFTER_CONSECUTIVE_FAILURES = 3;

// p95 del tiempo de respuesta por encima de esto durante un día = web lenta.
export const SLOW_RESPONSE_MS_THRESHOLD = 2000;

// Aviso informativo de caducidad de SSL.
export const SSL_EXPIRING_WARNING_DAYS = 14;

// Pasado este tiempo sin respuesta del agente, el inventario se muestra como
// caducado en vez de fingir que está al día.
export const AGENT_STALE_AFTER_HOURS = 48;

// Días de barras de uptime: los mismos que retiene la tabla checks (§5).
export const UPTIME_HISTORY_DAYS = 30;
