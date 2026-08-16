"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Invita a un contacto de cliente por email: crea el usuario en Auth (dispara
// el trigger on_auth_user_created, que le crea el perfil) y le da acceso al
// cliente elegido vía memberships. Requiere la Admin API, así que es la única
// operación de esta fase que usa la service_role key (regla 2 del CLAUDE.md).
export async function inviteMember(formData: FormData) {
  await requireStaff();

  const email = String(formData.get("email") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();

  if (!email || !clientId) {
    redirect("/agencia?error=faltan_datos");
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/`,
  });

  if (error || !data.user) {
    const alreadyExists = error?.code === "email_exists";
    redirect(
      `/agencia?error=${alreadyExists ? "email_ya_invitado" : "invitacion_fallida"}`,
    );
  }

  const supabase = await createClient();
  const { error: membershipError } = await supabase
    .from("memberships")
    .insert({ user_id: data.user.id, client_id: clientId });

  if (membershipError) {
    redirect("/agencia?error=membership_fallida");
  }

  revalidatePath("/agencia");
  redirect("/agencia?ok=invitado");
}
