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
  agent_key_secret_id: string | null;
  agent_last_seen_at: string | null;
  monitoring_enabled: boolean;
  created_at: string;
  screenshot_path: string | null;
  screenshot_taken_at: string | null;
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

export type Incident = {
  id: number;
  site_id: string;
  opened_at: string;
  resolved_at: string | null;
  kind: "down" | "ssl_expiring" | "slow";
  severity: string;
  detail: string | null;
};

export type WorklogCategory =
  | "update"
  | "fix"
  | "improvement"
  | "content"
  | "security";

export type WorklogEntry = {
  id: number;
  site_id: string;
  performed_at: string;
  author_id: string;
  category: WorklogCategory;
  summary: string;
  minutes: number | null;
  visible_to_client: boolean;
};

export type MetricsDaily = {
  site_id: string;
  day: string;
  uptime_pct: number | null;
  checks_total: number | null;
  checks_failed: number | null;
  response_ms_avg: number | null;
  response_ms_p95: number | null;
  lcp_ms: number | null;
  inp_ms: number | null;
  cls: number | null;
  ssl_expires_at: string | null;
};

export type InventoryPlugin = {
  slug: string;
  name: string;
  version: string;
  active: boolean;
  update_available: string | null;
};

export type InventoryTheme = InventoryPlugin;

export type BackupSource = "updraftplus" | "duplicator" | "all-in-one-wp-migration";

export type SiteInventory = {
  site_id: string;
  collected_at: string;
  wp_version: string | null;
  php_version: string | null;
  core_update_available: string | null;
  plugins: InventoryPlugin[];
  themes: InventoryTheme[];
  updates_pending: number | null;
  updates_checked_at: string | null;
  admin_count: number | null;
  debug_enabled: boolean | null;
  search_engines_discouraged: boolean | null;
  db_size_mb: number | null;
  db_revisions: number | null;
  db_expired_transients: number | null;
  db_autoload_kb: number | null;
  last_backup_at: string | null;
  backup_source: BackupSource | null;
};

export type UptimeDailyRow = {
  site_id: string;
  day: string;
  checks_total: number;
  checks_failed: number;
};
