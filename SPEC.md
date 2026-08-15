# SPEC — Panel de Mantenimiento Multi-Cliente

> Documento vivo. Es la fuente de verdad del proyecto: si el código y este documento
> discrepan, se corrige uno de los dos en el mismo commit.
>
> Estado: v1 en definición · Última revisión: 2026-08-15

---

## 1. Qué es y para quién

Un panel donde cada cliente entra con su email y ve, de un vistazo, que su web está
viva, actualizada, respaldada y atendida. Y donde la agencia ve todas las webs a la vez
y detecta problemas antes que el cliente.

**El problema real que resuelve** no es técnico, es comercial: la cuota mensual de
mantenimiento es el servicio más difícil de justificar, porque cuando se hace bien no
pasa nada, y "no ha pasado nada" no se factura solo. El panel convierte trabajo
invisible en un registro visible.

De ahí se deriva la decisión de producto más importante de este documento:

> **El registro de trabajo y el informe mensual no son una funcionalidad secundaria.
> Son el producto.** Las métricas técnicas (uptime, CWV, actualizaciones) son la prueba
> que lo respalda. Si hay que recortar alcance, se recorta métrica, nunca registro.

### Dos tipos de usuario

| Rol | Quién | Qué ve |
|---|---|---|
| `staff` | Carlos y quien trabaje con él | Todos los clientes, todas las webs, vista de agencia |
| `client` | El contacto de cada cliente | Solo las webs de su cliente, en modo lectura |

No hay auto-registro. La agencia da de alta clientes y les invita por email.

---

## 2. Alcance de la v1

### Entra

1. Alta de clientes y webs desde la vista de agencia.
2. **Monitorización externa** de cualquier web, sea del CMS que sea: disponibilidad,
   tiempo de respuesta, caducidad del certificado SSL, Core Web Vitals.
3. **Inventario interno de WordPress** vía un agente propio (mu-plugin): versiones de
   core/plugins/temas, actualizaciones pendientes, versión de PHP, detección de backup.
4. **Incidencias** abiertas y cerradas automáticamente cuando una web cae y vuelve.
5. **Registro de trabajo** (worklog): qué se ha hecho en cada web y cuándo.
6. Vista de cliente: una página por web + resumen del mes.
7. Avisos a la agencia por Telegram/email cuando se abre una incidencia.

### No entra en la v1 (y conviene decirlo en voz alta)

- Hacer backups. El panel **observa** backups, no los ejecuta. Menos responsabilidad legal
  y muchísimo menos código.
- Aplicar actualizaciones en remoto. Se informa de lo pendiente; actualizar sigue siendo
  manual. (Ver §9, es la funcionalidad más pedida y la más peligrosa.)
- Sistema de tickets. Si el cliente quiere pedir algo, escribe un email como hasta ahora.
- Facturación y cobros.
- Multi-agencia / white-label revendible. El sistema tiene **una** agencia: la de Carlos.
  La arquitectura no debe impedirlo en el futuro, pero no se construye ahora.
- App móvil. Web responsive y ya.
- Escaneo de vulnerabilidades por CVE.

---

## 3. Restricción de partida: el parque de webs es heterogéneo

Este es el condicionante que decide toda la arquitectura de recolección. Las webs a
monitorizar están repartidas entre:

- Servidores propios (Contabo con Coolify, IONOS con Plesk).
- Hostings de terceros donde solo hay acceso FTP/panel (Hostinger y similares).
- CMS distintos: mayoría WordPress, pero también PrestaShop y alguna web a medida.

**Conclusión: no se puede depender de acceso al servidor.** La recolección se organiza
en dos capas independientes, y la capa externa tiene que dar valor por sí sola.

### Capa A — Externa (funciona en el 100% de las webs, sin instalar nada)

| Dato | Fuente | Frecuencia |
|---|---|---|
| Disponibilidad y código HTTP | Petición HTTP desde n8n | 5 min |
| Tiempo de respuesta | Misma petición | 5 min |
| Caducidad del certificado SSL | Handshake TLS | 1 vez al día |
| Core Web Vitals (LCP, INP, CLS) móvil | PageSpeed Insights API | 1 vez al día |
| Cabeceras de seguridad presentes | Misma petición HTTP | 1 vez al día |

### Capa B — Interna WordPress (opcional, aporta el detalle)

Un **mu-plugin propio** (`panel-agent.php`) que expone un único endpoint de solo lectura:

```
GET /wp-json/panel/v1/status
Header: X-Panel-Key: <clave única por sitio>
```

Devuelve versión de WP, PHP, listado de plugins/temas con sus actualizaciones
pendientes, número de administradores, si `WP_DEBUG` está activo, tamaño de la base de
datos y fecha del último backup detectado (busca rastro de UpdraftPlus / Duplicator /
All-in-One en `wp-content`; si no encuentra nada, devuelve `null` y el panel lo muestra
como "sin monitorizar", nunca como "sin backup").

Se elige un mu-plugin propio en lugar de Application Passwords + REST del core porque:
una sola llamada en vez de cuatro, no expone la API de escritura, no depende de que el
hosting no bloquee `/wp-json/wp/v2/users`, y es un activo propio reutilizable.

**Requisito de seguridad del agente:** solo lectura, sin ninguna ruta que modifique
nada, clave distinta por sitio, y comparación de claves con `hash_equals()`.

Las webs que no sean WordPress se quedan solo con la capa A. Es una degradación
aceptable: siguen teniendo uptime, SSL, CWV, incidencias y registro de trabajo.

---

## 4. Arquitectura

```
┌─────────────┐   cron    ┌──────────────┐   service_role   ┌─────────────┐
│  n8n        │──────────▶│ Recolectores │─────────────────▶│  Supabase   │
│ (Coolify)   │           │  A y B       │                  │  Postgres   │
└─────────────┘           └──────────────┘                  │  + Auth     │
                                                            │  + RLS      │
┌─────────────┐                                             └──────┬──────┘
│  Next.js    │◀────────── JWT del usuario, filtrado por RLS ──────┘
│ (Coolify)   │
└─────────────┘
```

**Decisiones y por qué:**

- **Supabase** como base de datos y autenticación. El aislamiento entre clientes se
  resuelve con RLS en Postgres, no con `if` en el código de la aplicación. Es la única
  forma de que un fallo en el frontend no filtre datos de otro cliente.
- **n8n** como recolector. No se escribe un scheduler propio. Cada recolector es un
  workflow con cron que escribe directamente en Supabase con la `service_role key`
  guardada en las credenciales de n8n. Sin API intermedia: menos código que mantener.
- **Next.js (App Router)** para el panel. Los datos se leen en Server Components con el
  JWT del usuario, así RLS se aplica de verdad. Desplegado en Coolify con Dockerfile.
- **La `service_role key` no sale nunca del servidor ni de n8n.** En el navegador solo
  vive la `anon key`, que sin sesión no ve nada.

---

## 5. Modelo de datos

Nombres en inglés en el esquema, textos de interfaz en castellano.

```sql
-- Identidad
profiles(id uuid PK → auth.users, full_name, is_staff bool default false)

clients(id, name, slug, contact_email, status, created_at)

memberships(user_id → profiles, client_id → clients, primary key (user_id, client_id))

-- Objeto monitorizado
sites(
  id, client_id → clients, name, url, platform,      -- 'wordpress'|'prestashop'|'other'
  agent_key_hash,                                     -- null si no tiene agente
  agent_last_seen_at, monitoring_enabled, created_at
)

-- Capa A: serie temporal cruda
checks(
  id, site_id, checked_at, ok bool, status_code int,
  response_ms int, error text
)                                                     -- retención 30 días

-- Agregado diario (lo que consulta la interfaz)
metrics_daily(
  site_id, day date, uptime_pct numeric, checks_total int, checks_failed int,
  response_ms_avg int, response_ms_p95 int,
  lcp_ms int, inp_ms int, cls numeric,
  ssl_expires_at timestamptz,
  primary key (site_id, day)
)

-- Capa B: última foto conocida, se sobreescribe
site_inventory(
  site_id PK, collected_at, wp_version, php_version,
  plugins jsonb, themes jsonb,                        -- [{slug, name, version, update_available}]
  updates_pending int, admin_count int, debug_enabled bool,
  db_size_mb int, last_backup_at timestamptz          -- null = sin monitorizar
)

-- Incidencias
incidents(
  id, site_id, opened_at, resolved_at, kind, severity, detail
)                                                     -- kind: 'down'|'ssl_expiring'|'slow'

-- El corazón del producto
worklog(
  id, site_id, performed_at, author_id → profiles,
  category,                                           -- 'update'|'fix'|'improvement'|'content'|'security'
  summary text,                                       -- visible al cliente, en castellano llano
  minutes int, visible_to_client bool default true
)

-- Informes mensuales (se modela ya, se llena en fase 6)
reports(id, client_id, period_month date, generated_at, pdf_url, summary_md)
```

### Reglas de RLS (obligatorias en todas las tablas)

- `staff` (`profiles.is_staff = true`) lee y escribe todo.
- `client` lee **solo** filas cuyo `site_id` pertenezca a un `client_id` que aparezca en
  su `memberships`. Sin permisos de escritura en ninguna tabla.
- `worklog`: además del filtro por cliente, el rol `client` solo ve
  `visible_to_client = true`.
- Los recolectores entran con `service_role`, que se salta RLS por diseño. Por eso la
  clave no puede tocar el navegador jamás.

### Retención

`checks` guarda 30 días de datos crudos. Un cron nocturno consolida el día anterior en
`metrics_daily` y borra lo que exceda los 30 días. Sin esto, con 20 webs a 5 minutos son
~2 millones de filas al año y las consultas del panel se degradan.

---

## 6. Definiciones que hay que fijar antes de programar

Estas definiciones acaban en un tooltip de la interfaz, así que más vale acordarlas
ahora que discutirlas con un cliente después:

- **Caída**: 3 comprobaciones consecutivas fallidas (≈15 min). Una sola comprobación
  fallida es ruido de red, no una caída, y avisar por ella quema la credibilidad del
  panel en la primera semana.
- **Uptime del mes**: `checks_ok / checks_total` sobre el periodo, en porcentaje con dos
  decimales. Las ventanas de mantenimiento planificadas no se excluyen en la v1.
- **Web lenta**: p95 del tiempo de respuesta por encima de 2.000 ms durante un día.
- **SSL por caducar**: incidencia informativa a 14 días de la caducidad.
- **Actualizaciones pendientes**: lo que reporta el agente en su última lectura. Si el
  agente lleva más de 48 h sin responder, el panel muestra el dato como caducado, no lo
  oculta y tampoco finge que está al día.

---

## 7. Interfaz

### Vista de agencia
- **Todas las webs** en una tabla densa, ordenable, con semáforo por web. Es una
  herramienta de trabajo: prioriza densidad sobre espacio en blanco.
- Al abrir una web: gráficas, inventario, incidencias y worklog de esa web.
- Formulario rápido de registro de trabajo (menos de 15 segundos por entrada, o no se
  usará y el producto se muere).

### Vista de cliente
- Una sola pantalla por web: estado actual, uptime del mes, CWV, "última actualización
  realizada" y las últimas entradas del worklog en lenguaje llano.
- Prioriza tranquilidad sobre densidad. El cliente no quiere datos, quiere confirmar que
  alguien se está ocupando.

### Dirección visual

El riesgo de este tipo de producto es acabar en el panel genérico de tarjetas
redondeadas grises con un acento azul, indistinguible de cualquier plantilla de
dashboard. Direcciones a fijar en la fase de UI, no antes:

- **Paleta**: base neutra fría, un único color de acento propio de la marca de la
  agencia, y una escala de estado de tres pasos (bien / atención / caído) que sea
  legible en daltonismo (no confiar solo en rojo/verde: añadir forma o icono).
- **Tipografía**: una familia de datos tabulares con cifras de ancho fijo para los
  números. En un panel, la tipografía monoespaciada en las métricas hace más por la
  legibilidad que cualquier gráfico.
- **Copy en castellano**, voz activa, sin jerga de sistema: "Actualizamos 4 plugins",
  no "4 plugin updates applied". El botón dice lo que hace y el mensaje posterior usa la
  misma palabra.
- **Estados vacíos**: una web recién dada de alta no dice "sin datos", dice qué falta
  para tenerlos.

---

## 8. Fases de construcción

Cada fase termina en un commit que funciona y es demostrable. No se empieza la
siguiente hasta que la anterior está desplegada.

| Fase | Entregable | Criterio de "hecho" |
|---|---|---|
| **1** | Esquema Supabase + RLS + seed | Un usuario `client` de prueba consulta la BD y no ve las webs de otro cliente. Verificado con SQL, no de palabra. |
| **2** | Auth e invitaciones + layout base | Un usuario invitado entra por magic link y aterriza en su vista. Un `staff` ve la vista de agencia. |
| **3** | Recolector A (uptime) end-to-end | Workflow n8n escribiendo en `checks` cada 5 min para una web real, y esa web pintada en pantalla con su estado. **Aquí ya hay producto.** |
| **4** | Incidencias + avisos | Se tira una web de prueba, se abre la incidencia sola, llega el aviso a Telegram, vuelve la web y se cierra sola. |
| **5** | Worklog + resto de métricas A (SSL, CWV) | Registrar trabajo en menos de 15 s. CWV diarios visibles. |
| **6** | Agente WordPress + inventario | mu-plugin instalado en dos sitios reales, inventario visible y fechado. |
| **7** | Informe mensual en PDF con resumen IA | Cron día 1: agrega el mes, Claude redacta el resumen en castellano, PDF al email del cliente. |
| **8** | Despliegue en Coolify y alta del primer cliente real | Un cliente de verdad entrando con su cuenta. |

La fase 3 es el punto de no retorno útil: en cuanto un dato real de una web real se pinta
en pantalla, el resto es repetir el patrón. Todo lo que retrase la fase 3 (elegir
librería de gráficas, pulir el diseño, montar el agente) va después.

---

## 9. Riesgos conocidos

- **Falsos positivos de caída.** Un aviso equivocado a las 3 de la mañana destruye la
  confianza en el panel. Por eso 3 fallos consecutivos y no 1, y por eso las
  comprobaciones deben salir de una IP con buena conectividad.
- **El panel se cae y nadie se entera.** Un monitor que no se monitoriza a sí mismo no
  sirve. Contratar un servicio externo gratuito que vigile el propio panel: es la única
  pieza que no puede vigilarse sola.
- **Actualizaciones remotas** (fuera de v1): aplicar actualizaciones desde el panel
  significa que si una actualización rompe una web del cliente, la rompió el panel. No
  se aborda hasta tener backups verificados y rollback.
- **Coste de PageSpeed Insights**: la API es gratuita con clave, pero tiene cuota. Con
  una llamada diaria por web sobra de largo; si algún día se hace horario, hay que
  revisarlo.
- **Guardar credenciales de clientes.** La v1 no guarda accesos FTP/SSH/wp-admin de
  nadie: solo claves de agente de solo lectura, y guardadas con hash. Cualquier
  propuesta futura de "guardar los accesos del cliente para automatizar X" cambia el
  perfil de riesgo del producto entero y merece su propia decisión.

---

## 10. Empaquetado comercial (borrador, fuera del alcance técnico)

- El panel no se vende suelto: se incluye en la cuota de mantenimiento y la justifica.
- Tres niveles razonables: básico (capa A + worklog), completo (+ agente WP + informe
  mensual), gestionado (+ horas de trabajo incluidas).
- El informe mensual automático es el argumento de renovación. Sale el día 1, antes que
  la factura.
