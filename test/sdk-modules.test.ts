import { test } from 'node:test';
import assert from 'node:assert';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';

test('Centralized Mapping Overrides', () => {
  assert.ok(CUSTOM_WEB_FEATURE_OVERRIDES);
  assert.equal(CUSTOM_WEB_FEATURE_OVERRIDES['HTML-in-canvas'], 'canvas-html');
  assert.equal(CUSTOM_WEB_FEATURE_OVERRIDES['Numeric separators'], 'numeric-separators');
});
