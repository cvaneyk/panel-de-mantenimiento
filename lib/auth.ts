import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export type SessionProfile = {
  userId: string;
  email: string | null;
  profile: Profile;
};

// Sesión + perfil del usuario actual, o null si no hay sesión. Cada layout
// decide qué hacer con is_staff; esta función solo resuelve "quién eres".
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, is_staff, created_at")
    .eq("id", user.id)
    .single<Profile>();

  if (error || !profile) return null;

  return { userId: user.id, email: user.email ?? null, profile };
}

export async function requireStaff(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (!session.profile.is_staff) redirect("/cliente");
  return session;
}

export async function requireClient(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  if (session.profile.is_staff) redirect("/agencia");
  return session;
}
