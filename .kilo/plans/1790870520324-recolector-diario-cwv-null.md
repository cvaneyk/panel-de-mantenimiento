# Plan — Recolector diario: por qué SSL y Core Web Vitals salen `null`

## Contexto

El JSON que devuelve n8n es exactamente el `return` del nodo **"Comprobar SSL y CWV"**
(`n8n/recolector-diario.json`, nodo `sslcwv000001`). No es un error de n8n: es el
resultado "sin datos", porque el código traga en silencio los dos fallos posibles
antes de hacer el `return`:

- `ssl_expires_at: null` → `getCertExpiry()` no obtuvo el certificado; su
  `socket.on('error'|'timeout')` resuelve `null` y nadie lo registra.
- `lcp_ms`/`inp_ms`/`cls: null` y `screenshot_saved: false` → la respuesta de
  PageSpeed no traía `loadingExperience.metrics` ni `lighthouseResult.audits['final-screenshot']`;
  el `try/catch` de la llamada PSI oculta el motivo (status HTTP / `body.error`).

El nodo **sí llegó hasta el final** (hizo el upsert en `metrics_daily` con
`$env.SUPABASE_URL`): eso descarta que `require('tls')`/`require('url')` estén
bloqueados y demuestra que `$helpers.httpRequest` (que se ejecuta en el proceso
principal de n8n) funciona. El problema es sólo "por qué no hay datos".

## Causas candidatas (en orden de probabilidad)

1. **`$env.PAGESPEED_API_KEY` llega `undefined` al Code node.**
   En modo external, el Code node corre en el sandbox del task runner. `$helpers.httpRequest`
   se proxya a n8n, pero `$env` se resuelve con el entorno del runner, gobernado por
   `allowed-env` de `/etc/n8n-task-runners.json`. El `allowed-env` por defecto sólo
   incluye `PATH`, `GENERIC_TIMEZONE`, `NODE_OPTIONS`, etc.: **ninguna variable propia**.
   Si al configurar `NODE_FUNCTION_ALLOW_BUILTIN` se añadieron `SUPABASE_*`/`TELEGRAM_*`
   a `allowed-env` pero se olvidó `PAGESPEED_API_KEY`, sólo falla PageSpeed.
   Con la clave `undefined`, Google responde 400/403 → cae en el `catch` → todo `null`.
2. **La web no tiene field data de CrUX.** Para sitios con poco tráfico, PSI devuelve
   `lighthouseResult` pero **no** `loadingExperience` (ni `final-screenshot` en algunos casos).
   Aquí el `null` es correcto por diseño (regla 5 de `CLAUDE.md`). Se distingue del caso 1
   mirando si la respuesta PSI trae `body.error` o sólo `lighthouseResult`.
3. **La comprobación TLS no sale del sandbox.** `getCertExpiry()` usa `require('tls')`
   crudo dentro del runner; si el contenedor `n8nio/runners` no tiene egress/DNS a
   Internet (distinto del egress del contenedor n8n, que sí lo tiene porque
   `httpRequest` va proxya), el handshake falla y devuelve `null`. PageSpeed se salva
   porque va por `httpRequest`; SSL no.

## Objetivo

Determinar cuál de las tres causas aplica, haciendo visibles los errores que hoy se
devoran, y corregir la configuración o el código según el resultado. **No** inventar
métricas: si no hay field data, `null` es correcto y debe quedarse.

## Pasos

### 1. Instrumentar el nodo (cambio de código)

En el `jsCode` de "Comprobar SSL y CWV" (`n8n/recolector-diario.json`):

- Antes de la llamada PSI: `const psiKey = $env.PAGESPEED_API_KEY;`.
- En el `catch` de PSI, guardar `psiErrorText = err.message`.
- Tras la respuesta, exponer en el `return` (sólo diagnóstico, fuera de `body` que va a
  la base de datos):
  - `has_pagespeed_key: Boolean(psiKey)`
  - `psi_status: psi.statusCode`
  - `psi_error: psi.body && psi.body.error ? (psi.body.error.message || psi.body.error.status) : null`
  - `has_loading_experience: Boolean(psi.body && psi.body.loadingExperience)`
  - `tls_error: <código/mensaje capturado en getCertExpiry>`
- `getCertExpiry` debe resolver `{ date, error }` en vez de sólo la fecha, para no
  perder el código de error de `socket.on('error')`.
- Mantener intacto el `body` que se envía a `metrics_daily` (nada de campos de debug ahí).

Estos campos aparecerán en el JSON que ya estás mirando y dirán exactamente qué pasa.

### 2. Verificar el plumbing de entorno en el task runner

- Añadir temporalmente un Code node de prueba (o ejecutar sólo el paso 1) que devuelva:
  `{ has_psi: Boolean($env.PAGESPEED_API_KEY), psi_len: ($env.PAGESPEED_API_KEY||'').length, has_supabase: Boolean($env.SUPABASE_URL), has_service_role: Boolean($env.SUPABASE_SERVICE_ROLE_KEY) }`.
- Si `has_supabase` es `true` y `has_psi` es `false`: falta `PAGESPEED_API_KEY` en el
  entorno del **contenedor `n8nio/runners`** y/o en `allowed-env` del runner `javascript`
  en `/etc/n8n-task-runners.json`. Añadirla en ambos y reiniciar el sidecar.
- Referencia: el `allowed-env` por defecto no incluye variables propias
  (<https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/task-runners.md>).
  Recordar no romper la config existente (ver nota del sticky note del workflow: conservar
  `workdir`, `command`, `args`, `health-check-server-port`, `allowed-env` y la entrada del
  runner `python`).

### 3. Probar la clave PSI de forma aislada

Con la clave real, fuera de n8n:

```
GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://zappinglibre.com/&strategy=mobile&key=<KEY>
```

Interpretación:
- `error` con 400/403 → clave no válida/restringida/API no habilitada/cuota → arreglar en
  Google Cloud (habilitar PageSpeed Insights API, permitir la IP del VPS o ninguna restricción
  de referer). Nota: PSI es una API de servidor, no admite restricción por referer HTTP.
- `200` con `lighthouseResult` y **sin** `loadingExperience` → la web no tiene field data:
  `lcp_ms`/`inp_ms`/`cls = null` es el comportamiento correcto; el único arreglo real sería
  esperar a tener tráfico CrUX. La `final-screenshot` sí debería venir de `lighthouseResult`;
  si falta, revisar que la respuesta no venga truncada.
- `200` con `loadingExperience` → el problema era sólo el paso 2 (clave no llegaba al runner).

### 4. Resolver el SSL nulo

- Con el `tls_error` del paso 1:
  - Si es `ENOTFOUND`/`EAI_AGAIN` → el sandbox del runner no resuelve DNS.
  - Si es `ECONNREFUSED`/`ETIMEDOUT`/`EHOSTUNREACH` → sin egress desde el contenedor runner.
  - Si es un error de certificado concreto → revisar el host (`zappinglibre.com`).
- Si el runner no tiene egress, la opción recomendada es darle salida a Internet al
  contenedor `n8nio/runners` (no relajar `N8N_RUNNERS_INSECURE_MODE`). Alternativa si no
  se quiere dar egress al runner: mover la comprobación TLS al proceso principal, pero eso
  requiere otra pieza (no hay nodo estándar que lea la caducidad del certificado); valorar
  en el plan de implementación.

## Validación

1. Ejecución manual del workflow con 1 item: el `return` debe mostrar los campos de
   diagnóstico; identificar la causa.
2. `select * from metrics_daily where site_id = 'aaaaaaaa-...'` debe seguir guardando la fila
   (con `null` si no hay field data) sin error.
3. Tras corregir, `ssl_expires_at` debe traer fecha y, si hay field data, `lcp_ms`/`inp_ms`/`cls`
   deben traer números. `screenshot_saved` debe pasar a `true` si PSI responde 200.
4. Quitar los campos de diagnóstico del `return` (o dejarlos sólo en logs) una vez identificada
   la causa, para no ensuciar la salida del nodo.

## Riesgos / notas

- `zappinglibre.com` con id `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` es el UUID del `seed.sql`
  (fila demo con `monitoring_enabled = false`). Verificar que la fila real de ZappingLibre
  no sea la semilla reutilizada, porque el workflow filtra `monitoring_enabled=eq.true`.
- El `null` por ausencia de field data NO es un bug (regla 5 de `CLAUDE.md`): no sustituir
  por datos de Lighthouse.
- Trabajo de implementación: este plan requiere editar `n8n/recolector-diario.json` y la
  config del contenedor de runners; hacerlo desde un agente con permisos de edición/despliegue.

## Decisión abierta

- Si el paso 4 confirma falta de egress en el runner: ¿dar salida a Internet al contenedor
  `n8nio/runners` (recomendado) o rediseñar la comprobación TLS para que corra en el proceso
  principal?
