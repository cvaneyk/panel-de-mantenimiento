import type { WorklogCategory } from "@/lib/supabase/types";

// Un solo sitio con las etiquetas en castellano de las categorías del
// worklog, usado tanto en el formulario de la agencia como en la vista de
// cliente (copy en castellano, voz activa — convención del CLAUDE.md).
export const WORKLOG_CATEGORY_LABELS: Record<WorklogCategory, string> = {
  update: "Actualización",
  fix: "Arreglo",
  improvement: "Mejora",
  content: "Contenido",
  security: "Seguridad",
};
