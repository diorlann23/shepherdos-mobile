import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkTarget, parseMini, spans } from './mini-markdown.ts';

test('bold and guide links become spans; nothing is treated as code', () => {
  assert.deepEqual(spans('Open **Giving** first. See: [15. Giving](#15-giving)'), [
    { text: 'Open ' },
    { text: 'Giving', bold: true },
    { text: ' first. See: ' },
    { text: '15. Giving', href: '#15-giving' },
  ]);
});

test('an AI summary becomes paragraphs and lists', () => {
  const blocks = parseMini('**Attendance is up.**\n\n**Highlights**\n- 120 on Sunday\n- 14 first-timers\n\n1. Call them\n2. Thank the ushers\n\n## Next');
  assert.equal(blocks.length, 5);
  assert.deepEqual(blocks[0], { type: 'paragraph', spans: [{ text: 'Attendance is up.', bold: true }] });
  assert.deepEqual(blocks[2], { type: 'list', ordered: false, items: [[{ text: '120 on Sunday' }], [{ text: '14 first-timers' }]] });
  assert.equal(blocks[3].type === 'list' && blocks[3].ordered, true);
  assert.deepEqual(blocks[4], { type: 'paragraph', spans: [{ text: 'Next', bold: true }] });
});

test('links open the guide on the church’s server, never another site', () => {
  assert.equal(linkTarget('#151-counting-sheets', 'https://shepherdoss.vercel.app/'), 'https://shepherdoss.vercel.app/help#151-counting-sheets');
  assert.equal(linkTarget('/settings', 'https://x.test'), 'https://x.test/settings');
  assert.equal(linkTarget('https://evil.example', 'https://x.test'), null);
});
