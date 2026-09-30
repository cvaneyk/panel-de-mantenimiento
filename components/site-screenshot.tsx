import { formatDateTimeMadrid } from "@/lib/format";

// Captura de la portada. Sin captura, un hueco que dice qué falta para
// tenerla (estados vacíos, §7 del SPEC), no una imagen de relleno.
export function SiteScreenshot({
  url,
  takenAt,
  siteName,
  size,
}: {
  url: string | undefined;
  takenAt: string | null;
  siteName: string;
  size: "thumb" | "large";
}) {
  const frame =
    size === "thumb"
      ? "h-[45px] w-[72px]"
      : "aspect-[9/16] w-full max-w-[220px]";

  if (!url) {
    return (
      <div
        className={`${frame} flex items-center justify-center rounded border border-dashed border-[var(--color-border-strong)] p-2 text-center text-[var(--color-text-muted)] ${
          size === "thumb" ? "text-[10px] leading-tight" : "text-xs"
        }`}
      >
        {size === "thumb"
          ? "Sin captura"
          : "Sin captura todavía: se toma en la comprobación diaria de las 3:00."}
      </div>
    );
  }

  return (
    <figure className={size === "large" ? "w-full max-w-[220px]" : undefined}>
      {/* Imagen de Storage con URL firmada y caducidad: next/image no aporta
          nada aquí y obligaría a abrir el dominio en remotePatterns. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Portada de ${siteName}`}
        loading="lazy"
        className={`${frame} rounded border border-[var(--color-border)] object-cover object-top`}
      />
      {size === "large" && takenAt ? (
        <figcaption className="mt-1 text-xs text-[var(--color-text-muted)] tabular-nums">
          Captura del {formatDateTimeMadrid(takenAt)} (móvil)
        </figcaption>
      ) : null}
    </figure>
  );
}
