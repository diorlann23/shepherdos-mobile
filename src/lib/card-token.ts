/**
 * Member ID cards carry a QR like "CM1.<member id>.<version>.<signature>".
 * Only the server can check the signature; the phone reads the member id so it
 * can check someone in while offline, and the server checks the card when online.
 */
const CARD_RE = /^CM1\.([a-f\d]{24})\.(\d{1,6})\.([A-Za-z0-9_-]{16})$/;

export function readCard(data: string): { memberId: string; version: number } | null {
  const m = CARD_RE.exec(data.trim());
  return m ? { memberId: m[1], version: Number(m[2]) } : null;
}
