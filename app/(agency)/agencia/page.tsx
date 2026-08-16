import { createClient } from "@/lib/supabase/server";
import { inviteMember } from "./actions";

type ClientRow = {
  id: string;
  name: string;
  contact_email: string;
  status: string;
  sites: { count: number }[];
};

const ERROR_MESSAGES: Record<string, string> = {
  faltan_datos: "Indica un cliente y un email para invitar.",
  email_ya_invitado: "Ese email ya tiene una invitación o una cuenta.",
  invitacion_fallida: "No hemos podido enviar la invitación. Inténtalo de nuevo.",
  membership_fallida:
    "Se ha creado el usuario pero no hemos podido darle acceso al cliente.",
};

export default async function AgenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, contact_email, status, sites(count)")
    .order("name")
    .returns<ClientRow[]>();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-xl font-semibold">Clientes</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Todos los clientes de la agencia. La monitorización de sus webs
          empieza en la fase 3.
        </p>

        <div className="mt-6 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Contacto</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium tabular-nums">Webs</th>
              </tr>
            </thead>
            <tbody>
              {clients?.length ? (
                clients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="px-4 py-2">{client.name}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">
                      {client.contact_email}
                    </td>
                    <td className="px-4 py-2">{client.status}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {client.sites[0]?.count ?? 0}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-[var(--color-text-muted)]"
                  >
                    No hay clientes dados de alta todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-sm">
        <h2 className="text-base font-semibold">Invitar a un contacto</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Le enviamos un enlace de acceso a su email. Al entrar, verá solo las
          webs del cliente elegido.
        </p>

        {ok === "invitado" ? (
          <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            Invitación enviada.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {ERROR_MESSAGES[error] ?? "Ha ocurrido un error. Inténtalo de nuevo."}
          </p>
        ) : null}

        <form action={inviteMember} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="clientId"
              className="block text-sm font-medium text-[var(--color-text)]"
            >
              Cliente
            </label>
            <select
              id="clientId"
              name="clientId"
              required
              defaultValue=""
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            >
              <option value="" disabled>
                Selecciona un cliente
              </option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--color-text)]"
            >
              Email del contacto
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              placeholder="contacto@cliente.com"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white"
          >
            Enviar invitación
          </button>
        </form>
      </section>
    </div>
  );
}
