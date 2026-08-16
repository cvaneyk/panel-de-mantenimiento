import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AgencyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireStaff();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/agencia" className="text-sm font-semibold">
            Panel de mantenimiento · Agencia
          </Link>
          <div className="flex items-center gap-4 text-sm text-[var(--color-text-muted)]">
            <span>{session.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
