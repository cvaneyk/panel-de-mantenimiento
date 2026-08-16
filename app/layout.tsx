import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel de mantenimiento",
  description: "Estado de las webs de tus clientes, siempre a la vista.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
