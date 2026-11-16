import { test } from 'node:test';
import assert from 'node:assert/strict';
import { covers, holds } from './permission-match.ts';

test('wildcards cover what the server says they cover', () => {
  assert.ok(covers('*', 'member.create'), 'super admin');
  assert.ok(covers('member.*', 'member.create'));
  assert.ok(covers('member.create', 'member.create'));
  assert.ok(!covers('member.view', 'member.create'));
  assert.ok(!covers('household.*', 'member.create'));
});

test('a "self only" permission does not show staff buttons', () => {
  assert.ok(!holds(['member.edit:self'], 'member.edit'));
  assert.ok(holds(['*'], 'household.create'));
  assert.ok(holds(['member.view', 'member.*'], 'member.create'));
  assert.ok(!holds(['member.view'], 'member.create'));
});
