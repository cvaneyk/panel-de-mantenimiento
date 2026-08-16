import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

// Cliente con la service_role key: se salta RLS por diseño. Solo para lo que
// exige la Admin API (invitar usuarios) — el import "server-only" hace que el
// build falle si esto llega a importarse desde código de cliente (regla 2 del
// CLAUDE.md).
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
