import test from 'node:test';
import assert from 'node:assert/strict';
import { features as webFeatures } from 'web-features';

test('WebFeature Join Fidelity - String identifiers map perfectly to web-features catalog', () => {
  // Legitimate web_feature identifier symbols known to link ChromeStatus entries
  const knownSymbols = [
    'canvas',
    'webgpu',
    'view-transitions',
    'abortable-fetch',
    'accent-color'
  ];

  for (const symbol of knownSymbols) {
    assert.equal(
      Object.hasOwn(webFeatures, symbol), 
      true, 
      `Symbol "${symbol}" must exist as a top-level key in the web-features package export`
    );
  }

  // Unrecognized symbols fail lookup cleanly
  assert.equal(
    Object.hasOwn(webFeatures, 'non-existent-fantasy-feature-id'),
    false
  );
});
