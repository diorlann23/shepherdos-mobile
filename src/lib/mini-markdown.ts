/**
 * Just enough markdown for AI answers on the phone: paragraphs, bullet and
 * numbered lists, **bold** and [links](#guide-section). Everything else is
 * shown as plain text. Pure, so it's unit-tested without a phone.
 */
export type Span = { text: string; bold?: boolean; href?: string };
export type MdBlock = { type: 'paragraph'; spans: Span[] } | { type: 'list'; ordered: boolean; items: Span[][] };

export function spans(line: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1].replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1'), bold: true });
    else out.push({ text: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out.map((s) => ({ ...s, text: s.text.replace(/\*\*|__/g, '').replace(/`/g, '') })).filter((s) => s.text);
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseMini(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', spans: spans(para.join(' ')) });
    para = [];
  };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = !!numbered;
      const prev = blocks.at(-1);
      const item = spans((bullet ?? numbered)![1]);
      if (prev?.type === 'list' && prev.ordered === ordered) prev.items.push(item);
      else blocks.push({ type: 'list', ordered, items: [item] });
      continue;
    }
    if (!line.trim() || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'paragraph', spans: spans(heading[1]).map((s) => ({ ...s, bold: true })) });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** Where a link in an answer opens: guide sections and site pages on the church's ShepherdOS server. */
export function linkTarget(href: string, server: string): string | null {
  const base = server.replace(/\/+$/, '');
  if (href.startsWith('#')) return `${base}/help${href}`;
  if (href.startsWith('/')) return `${base}${href}`;
  return null;
}
