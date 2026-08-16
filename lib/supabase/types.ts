// Tipos mínimos de las tablas que usa el panel en esta fase. Se amplía a medida
// que cada fase lee columnas nuevas — no se generan con `supabase gen types`
// todavía porque el proyecto no está enlazado con la CLI local.

export type Profile = {
  id: string;
  full_name: string | null;
  is_staff: boolean;
  created_at: string;
};

export type Client = {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  status: string;
  created_at: string;
};

export type Membership = {
  user_id: string;
  client_id: string;
};

export type Site = {
  id: string;
  client_id: string;
  name: string;
  url: string;
  platform: "wordpress" | "prestashop" | "other";
  agent_key_hash: string | null;
  agent_last_seen_at: string | null;
  monitoring_enabled: boolean;
  created_at: string;
};

export type Check = {
  id: number;
  site_id: string;
  checked_at: string;
  ok: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
};
