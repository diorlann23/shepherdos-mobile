/**
 * Money is kept in whole minor units (pesewas, cents) as on the server, so
 * sums never drift. Conversion follows each currency's decimals.
 */
const decimalsCache = new Map<string, number>();

export function decimals(currency: string): number {
  const hit = decimalsCache.get(currency);
  if (hit !== undefined) return hit;
  let d = 2;
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    d = 2;
  }
  decimalsCache.set(currency, d);
  return d;
}

export const toMinor = (amount: number, currency: string) => Math.round(amount * 10 ** decimals(currency));
export const fromMinor = (minor: number, currency: string) => minor / 10 ** decimals(currency);

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).format(fromMinor(minor, currency));
  } catch {
    return `${currency} ${fromMinor(minor, currency).toFixed(decimals(currency))}`;
  }
}

/**
 * What someone typed ("1,250.50", "50") as minor units, or null if it isn't an
 * amount. Never more decimals than the currency has.
 */
export function parseAmount(text: string, currency: string): number | null {
  const t = text.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d*)?$/.test(t)) return null;
  const [, frac = ''] = t.split('.');
  if (frac.length > decimals(currency)) return null;
  const minor = toMinor(Number(t), currency);
  return minor > 0 && minor <= 1e13 ? minor : null;
}

/** A note or coin's face value for the counting sheet ("200", "0.50"). */
export function denominationLabel(minor: number, currency: string): string {
  const major = fromMinor(minor, currency);
  return Number.isInteger(major) ? String(major) : major.toFixed(decimals(currency));
}

/** Notes and coins for counting sheets, in major units: the same table as the website. */
const DENOMINATIONS: Record<string, number[]> = {
  GHS: [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1],
  NGN: [1000, 500, 200, 100, 50, 20, 10, 5],
  KES: [1000, 500, 200, 100, 50, 20, 10, 5, 1],
  UGX: [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100],
  TZS: [10000, 5000, 2000, 1000, 500, 200, 100, 50],
  ZAR: [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1],
  XOF: [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25],
  XAF: [10000, 5000, 2000, 1000, 500, 100, 50, 25],
  USD: [100, 50, 20, 10, 5, 2, 1, 0.25, 0.1, 0.05, 0.01],
  GBP: [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01],
  EUR: [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05],
};

export function denominationsFor(currency: string): number[] {
  return (DENOMINATIONS[currency] ?? [100, 50, 20, 10, 5, 2, 1]).map((v) => toMinor(v, currency));
}
