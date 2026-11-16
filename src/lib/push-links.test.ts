import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeForLink } from './push-links.ts';

test("a tapped notification opens the matching screen in the app", () => {
  assert.equal(routeForLink('/tasks?task=6650aa11bb22cc33dd44ee55'), '/tasks/6650aa11bb22cc33dd44ee55');
  assert.equal(routeForLink('/tasks?tab=delegations'), '/tasks');
  assert.equal(routeForLink('/expenses?open=6650aa11bb22cc33dd44ee55'), '/expense/6650aa11bb22cc33dd44ee55');
  assert.equal(routeForLink('/giving/batches/6650aa11bb22cc33dd44ee55'), '/sheet/6650aa11bb22cc33dd44ee55');
  assert.equal(routeForLink('/visitors?mine=1'), '/firsttimers');
  assert.equal(routeForLink('/events/6650aa11bb22cc33dd44ee55'), '/events/6650aa11bb22cc33dd44ee55');
  assert.equal(routeForLink('/submissions?open=6650aa11bb22cc33dd44ee55'), '/reports/branch/6650aa11bb22cc33dd44ee55');
  assert.equal(routeForLink('/submissions'), '/reports/branch');
});

test('anything the app has no screen for, or anything odd, opens the home screen', () => {
  assert.equal(routeForLink(undefined), '/');
  assert.equal(routeForLink('/settings/approvals'), '/');
  assert.equal(routeForLink('/audit?category=security'), '/');
  assert.equal(routeForLink('/tasks?task=../../etc'), '/tasks');
  assert.equal(routeForLink('https://evil.example/tasks?task=x'), '/tasks/x', 'only the path is used, never another site');
});
