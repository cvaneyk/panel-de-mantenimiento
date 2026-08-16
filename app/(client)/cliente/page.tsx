import { createClient } from "@/lib/supabase/server";

type ClientWithSites = {
  id: string;
  name: string;
  sites: { id: string; name: string; url: string; platform: string }[];
};

export default async function ClientePage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, sites(id, name, url, platform)")
    .returns<ClientWithSites[]>();

  if (!clients?.length) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Tu cuenta todavía no tiene ninguna web asociada. Contacta con tu
        agencia si crees que es un error.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {clients.map((client) => (
        <section key={client.id}>
          <h1 className="text-xl font-semibold">{client.name}</h1>

          {client.sites.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Tu agencia todavía no ha dado de alta ninguna web para tu
              cuenta.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {client.sites.map((site) => (
                <li
                  key={site.id}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <p className="font-medium">{site.name}</p>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-[var(--color-text-muted)] hover:underline"
                  >
                    {site.url}
                  </a>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    Sin datos de monitorización todavía: la comprobación de
                    disponibilidad empieza en la próxima fase.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
