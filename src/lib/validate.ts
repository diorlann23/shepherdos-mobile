/** Same rules as the server, so mistakes show while typing rather than after a sync. */
export const PHONE_RE = /^[+\d][\d\s\-().]{5,24}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validPhone = (v: string | null | undefined) => !v || PHONE_RE.test(v.trim());
export const validEmail = (v: string | null | undefined) => !v || EMAIL_RE.test(v.trim());

/** '' → null, trimmed. */
export const clean = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** Dates are typed DD/MM/YYYY and kept as YYYY-MM-DD. */
export function isoToDisplay(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
}

export function displayToIso(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  const ok = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && y >= 1900 && date.getTime() <= Date.now() + 366 * 86_400_000;
  return ok ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

