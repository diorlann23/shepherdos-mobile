import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCard } from './card-token.ts';

test('reads ShepherdOS member cards and nothing else', () => {
  assert.deepEqual(readCard('CM1.65a1b2c3d4e5f6a7b8c9d0e1.2.AbCdEfGh_-123456'), { memberId: '65a1b2c3d4e5f6a7b8c9d0e1', version: 2 });
  assert.deepEqual(readCard('  CM1.65a1b2c3d4e5f6a7b8c9d0e1.1.AbCdEfGh_-123456\n'), { memberId: '65a1b2c3d4e5f6a7b8c9d0e1', version: 1 }, 'spaces and a newline around it');
  assert.equal(readCard('https://example.com'), null);
  assert.equal(readCard('CM1.not-an-id.1.AbCdEfGh_-123456'), null);
  assert.equal(readCard('CM1.65a1b2c3d4e5f6a7b8c9d0e1.1.short'), null);
});
