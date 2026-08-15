# CLAUDE.md

Contexto permanente de este repositorio. Léelo entero antes de tocar nada.

## Qué es esto

Panel de mantenimiento web multi-cliente. Producto propio de la agencia: cada cliente
entra y ve el estado de sus webs; la agencia las ve todas. **La especificación completa
está en `SPEC.md` y es la fuente de verdad.** Si una petición mía contradice el SPEC,
dilo antes de programar: o me equivoco yo, o hay que actualizar el SPEC en el mismo
commit.

Idioma: **todo el texto de interfaz, mensajes de error y documentación en castellano**.
Código, nombres de tablas, variables y commits en inglés.

## Stack

- **Next.js (App Router) + TypeScript estricto** — panel web
- **Supabase** — Postgres, Auth y RLS
- **n8n** — todos los recolectores programados (cron)
- **Coolify sobre VPS Contabo** — despliegue vía Dockerfile
- **Tailwind** — estilos

No añadas dependencias sin proponerlo primero, con una frase de por qué y qué se
descarta a cambio. En especial: nada de librerías de componentes completas, ORMs sobre
Supabase, ni gestores de estado globales sin discutirlo.

## Comandos

```bash
npm run dev          # desarrollo local
npm run build        # build de producción (debe pasar antes de cualquier commit)
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
supabase db diff     # generar migración a partir de cambios locales
supabase db push     # aplicar migraciones
```

## Estructura

```
/app                 rutas (App Router)
  /(agency)          vistas de la agencia — requieren is_staff
  /(client)          vista de cliente
/components          componentes de UI
/lib
  /supabase          clientes de servidor y de navegador
  /metrics           cálculos de uptime, p95, estados
/supabase/migrations migraciones SQL versionadas
/agent               mu-plugin de WordPress (panel-agent.php)
SPEC.md              especificación funcional y técnica
```

## Reglas que no se negocian

1. **RLS en toda tabla nueva.** Crear una tabla sin políticas RLS es un bug de
   seguridad, no una tarea pendiente. La migración que crea la tabla crea las políticas.
2. **La `service_role key` no aparece jamás en código que llegue al navegador.** Solo en
   credenciales de n8n y en variables de entorno de servidor. Si necesitas saltarte RLS
   en el frontend, la respuesta correcta es que la política está mal.
3. **Las migraciones ya aplicadas no se editan.** Cambios = migración nueva.
4. **Los datos se leen en Server Components con el JWT del usuario**, para que RLS actúe
   de verdad. Nada de leer con la clave de servicio y filtrar por código.
5. **Sin datos falsos.** Si una métrica no está disponible, la interfaz dice que no está
   disponible. No hay valores de relleno, ni gráficas de ejemplo, ni "—" que parezca un
   cero. Un panel de estado que miente una vez ya no sirve para nada.
6. **Nada que escriba en las webs de los clientes.** El agente de WordPress es de solo
   lectura y no se le añaden rutas de escritura "de momento".

## Convenciones

- Nombres de tablas y columnas en `snake_case`, en inglés, tal como aparecen en el SPEC.
- Fechas siempre `timestamptz`, guardadas en UTC, mostradas en `Europe/Madrid`.
- Los cálculos de métricas (uptime, p95, umbrales de estado) viven en `/lib/metrics`,
  nunca dentro de un componente. Se prueban con tests unitarios.
- Los umbrales (3 fallos = caída, 14 días de aviso SSL, 2.000 ms = lento) son constantes
  con nombre en un solo sitio, no números sueltos repartidos por el código.
- Errores en la interfaz: qué ha pasado y qué hacer. Sin disculpas y sin tecnicismos.

## Sobre la UI

Es un panel de datos, no una landing. Antes de escribir componentes nuevos, mira la
sección "Dirección visual" del SPEC. Dos cosas concretas:

- Cifras tabulares con ancho fijo. En una tabla de métricas, eso importa más que
  cualquier gráfico.
- El estado nunca se codifica solo con color: color + icono o forma.

Evita el aspecto de plantilla de dashboard genérico (tarjetas redondeadas grises,
acento azul por defecto, un gráfico de área por widget). Si una decisión visual la
tomarías igual para cualquier otro proyecto, no es una decisión.

## Cómo quiero trabajar

- **Por fases, según §8 del SPEC.** Al empezar una sesión, dime en qué fase estamos y
  qué vas a hacer antes de escribir código.
- **Un commit por fase o por unidad coherente**, con `npm run build` y `npm run
  typecheck` en verde. Mensajes en inglés, imperativo.
- **Antes de dar algo por terminado**, comprueba el criterio de "hecho" de esa fase en
  el SPEC. La fase 1 no está hecha porque el SQL se aplique: está hecha cuando se ha
  verificado con una consulta que un cliente no ve los datos de otro.
- Si algo del SPEC está sin definir y necesitas una decisión, pregúntame en vez de
  elegir por tu cuenta y seguir. Una pregunta cuesta menos que deshacer media fase.
- Prefiero código aburrido y explícito a código listo.
