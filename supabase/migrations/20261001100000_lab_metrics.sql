-- Prueba de laboratorio de Lighthouse (móvil), separada de las Core Web Vitals
-- de campo. Ver §3 del SPEC: "Campo y laboratorio no se mezclan".
-- metrics_daily ya tiene RLS desde la migración inicial; las columnas nuevas
-- quedan cubiertas por las mismas políticas.

alter table public.metrics_daily
  add column lab_performance_score int check (lab_performance_score between 0 and 100),
  add column lab_lcp_ms int,
  add column lab_cls numeric,
  add column lab_tbt_ms int;
