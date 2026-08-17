"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { WorklogCategory } from "@/lib/supabase/types";

const VALID_CATEGORIES: WorklogCategory[] = [
  "update",
  "fix",
  "improvement",
  "content",
  "security",
];

// Registro de trabajo: pensado para menos de 15 segundos por entrada (§7 del
// SPEC), así que solo pide lo imprescindible — categoría y resumen.
export async function logWork(formData: FormData) {
  const session = await requireStaff();

  const siteId = String(formData.get("siteId") ?? "");
  const category = String(formData.get("category") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  const minutesRaw = formData.get("minutes");
  const minutes = minutesRaw ? Number(minutesRaw) : null;
  const visibleToClient = formData.get("visibleToClient") === "on";

  if (!siteId || !VALID_CATEGORIES.includes(category as WorklogCategory) || !summary) {
    redirect(`/agencia/webs/${siteId}?error=faltan_datos`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("worklog").insert({
    site_id: siteId,
    author_id: session.userId,
    category,
    summary,
    minutes: minutes && !Number.isNaN(minutes) ? minutes : null,
    visible_to_client: visibleToClient,
  });

  if (error) {
    redirect(`/agencia/webs/${siteId}?error=registro_fallido`);
  }

  revalidatePath(`/agencia/webs/${siteId}`);
  redirect(`/agencia/webs/${siteId}?ok=registrado`);
}
