import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appUserAgent } from './user-agent.ts';

test('the app names the phone it runs on, for the website’s list of signed-in devices', () => {
  assert.equal(appUserAgent('1.0.0', { os: 'android', version: 34, constants: { Manufacturer: 'samsung', Model: 'SM-S918B', Release: '14' } }), 'ShepherdOS-Mobile/1.0.0 (Android 14; samsung SM-S918B)');
  assert.equal(appUserAgent('1.0.0', { os: 'android', version: 33 }), 'ShepherdOS-Mobile/1.0.0 (Android 33)');
  assert.equal(appUserAgent('1.2.0', { os: 'ios', version: '18.1', constants: { interfaceIdiom: 'phone' } }), 'ShepherdOS-Mobile/1.2.0 (iOS 18.1; iPhone)');
  assert.equal(appUserAgent('1.2.0', { os: 'ios', version: '18.1', constants: { interfaceIdiom: 'pad' } }), 'ShepherdOS-Mobile/1.2.0 (iOS 18.1; iPad)');
});

test('odd characters in a model name can’t break the format', () => {
  assert.equal(appUserAgent('1.0.0', { os: 'android', constants: { Manufacturer: 'Acme', Model: 'X (5G); test', Release: '13' } }), 'ShepherdOS-Mobile/1.0.0 (Android 13; Acme X 5G test)');
});
