import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Cliente para Server Components, Server Actions y Route Handlers. Lee la
// sesión de las cookies y usa la anon key: los datos se filtran por RLS con
// el JWT del usuario (regla 4 del CLAUDE.md), nunca con la service_role key.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Se llama desde un Server Component sin permiso de escritura de
          // cookies; el middleware se encarga de refrescar la sesión en ese
          // caso, así que se ignora el error.
        }
      },
    },
  });
}
