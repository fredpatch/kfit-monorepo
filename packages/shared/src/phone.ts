/** Sprint 3 normalization semantics, shared by request intake and customer lookup/create. */
export function normalizeWhatsapp(value: string): string | null {
  const stripped = value.replace(/[^\d+]/g, "");
  const digits = stripped.replace(/^\+/, "");
  if (digits.length < 6 || digits.length > 20) return null;
  return stripped;
}
