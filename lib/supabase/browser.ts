import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Cliente para Client Components. Usa siempre la anon key: sin sesión, RLS no
// deja ver nada (regla 2 del CLAUDE.md).
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
