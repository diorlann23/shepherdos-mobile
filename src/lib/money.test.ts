import { test } from 'node:test';
import assert from 'node:assert/strict';
import { denominationLabel, formatMoney, parseAmount, toMinor } from './money.ts';

test('amounts typed in are kept in pesewas, never rounded wrong', () => {
  assert.equal(parseAmount('50', 'GHS'), 5000);
  assert.equal(parseAmount('1,250.50', 'GHS'), 125050);
  assert.equal(parseAmount('0.1', 'GHS'), 10);
  assert.equal(parseAmount('19.99', 'GHS'), 1999, 'no floating point drift');
  assert.equal(parseAmount('1.234', 'GHS'), null, 'more decimals than the cedi has');
  assert.equal(parseAmount('0', 'GHS'), null);
  assert.equal(parseAmount('abc', 'GHS'), null);
  assert.equal(parseAmount('-5', 'GHS'), null);
});

test('formats and labels', () => {
  assert.match(formatMoney(125050, 'GHS'), /1,250\.50/);
  assert.equal(toMinor(0.2, 'GHS'), 20);
  assert.equal(denominationLabel(20000, 'GHS'), '200');
  assert.equal(denominationLabel(50, 'GHS'), '0.50');
});
