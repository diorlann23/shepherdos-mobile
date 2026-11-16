import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clean, displayToIso, isoToDisplay, validEmail, validPhone } from './validate.ts';

test('phone numbers follow the server rule', () => {
  for (const ok of ['0244123456', '+233 24 412 3456', '024-412-3456', '024 (412) 3456']) assert.ok(validPhone(ok), ok);
  for (const bad of ['abc', '12', 'phone 0244', '(024) 4123456']) assert.ok(!validPhone(bad), bad);
  assert.ok(validPhone(''), 'blank is allowed');
});

test('emails and blanks', () => {
  assert.ok(validEmail('ama@church.org'));
  assert.ok(!validEmail('ama@church'));
  assert.equal(clean('  '), null);
  assert.equal(clean(' Ama '), 'Ama');
});

test('dates typed DD/MM/YYYY', () => {
  assert.equal(displayToIso('25/12/1990'), '1990-12-25');
  assert.equal(displayToIso('31/02/1990'), null, 'no 31 February');
  assert.equal(displayToIso('12/1990'), null, 'incomplete');
  assert.equal(displayToIso('01/01/1850'), null, 'too long ago');
  assert.equal(isoToDisplay('1990-12-25T00:00:00.000Z'), '25/12/1990');
});
