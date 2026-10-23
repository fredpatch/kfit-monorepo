/*
 * Public contact links (UX-11, Fred 2026-10-23). Set at build time; a button is hidden when its value is unset.
 * Later replaced by the coach onboarding settings (name, logo, links) — Notion backlog.
 *
 *   VITE_PUBLIC_WHATSAPP   international number, digits only or with +, e.g. +24107000000
 *   VITE_PUBLIC_INSTAGRAM  full https URL of the Instagram profile
 */
const env = import.meta.env as Record<string, string | undefined>;

function whatsappUrl(raw: string | undefined, text?: string): string | null {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  if (digits.length < 6) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

function httpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const publicLinks = {
  whatsapp: whatsappUrl(env.VITE_PUBLIC_WHATSAPP),
  whatsappAbout: (offer: string) => whatsappUrl(env.VITE_PUBLIC_WHATSAPP, `Bonjour, j'aimerais des informations sur l'offre « ${offer} ».`),
  instagram: httpsUrl(env.VITE_PUBLIC_INSTAGRAM),
} as const;
