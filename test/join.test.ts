import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import type { ChromeStatusFeatureStub } from '../src/types.ts';

test('WebFeature Join Fidelity - String identifiers map perfectly to web-features catalog', () => {
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

  assert.equal(
    Object.hasOwn(webFeatures, 'non-existent-fantasy-feature-id'),
    false
  );
});

test('WebFeature Population Metrics - Audits catalog string identifier presence and package mapping validity', async () => {
  let stubs: ChromeStatusFeatureStub[] = [];
  try {
    const litePath = path.resolve(process.cwd(), 'data', 'lite.json');
    const text = await fs.readFile(litePath, 'utf8');
    stubs = JSON.parse(text);
  } catch {
    // Skip subtest execution gracefully if compiled snapshot layer is unpopulated locally
    return;
  }

  const totalCount = stubs.length;
  const populatedStubs = stubs.filter(f => typeof f.web_feature === 'string' && f.web_feature.trim() !== '');
  const populatedPercentage = ((populatedStubs.length / totalCount) * 100).toFixed(2);

  console.log(`\n[WebFeature Metrics]: Populated on ${populatedStubs.length} out of ${totalCount} features (${populatedPercentage}%)`);

  // Exclude literal string placeholders to evaluate true symbol join alignment
  const legitimateStubs = populatedStubs.filter(f => f.web_feature !== 'Missing feature');
  let validMappingCount = 0;
  const invalidSamples: string[] = [];

  // Known upstream dictionary deviations where short symbols have not synchronized to web-features
  const knownUpstreamExceptions = new Set([
    'svg-path-length-css',
    'gethtml',
    'dedicated-workers',
    'service-workers',
    'js-modules-service-workers'
  ]);

  for (const feature of legitimateStubs) {
    const symbol = feature.web_feature!;
    if (Object.hasOwn(webFeatures, symbol)) {
      validMappingCount++;
    } else if (!knownUpstreamExceptions.has(symbol)) {
      if (invalidSamples.length < 5) {
        invalidSamples.push(`"${symbol}" (Feature ID: ${feature.id})`);
      }
    }
  }

  const validPercentage = ((validMappingCount / legitimateStubs.length) * 100).toFixed(2);
  console.log(`[WebFeature Metrics]: ${validMappingCount} out of ${legitimateStubs.length} legitimate symbols successfully map directly to web-features catalog (${validPercentage}%)`);

  // Validate that mapping fidelity remains highly deterministic and valid across the dataset
  assert.equal(
    validMappingCount / legitimateStubs.length >= 0.99,
    true,
    `Global web_feature symbol mapping accuracy (${validPercentage}%) must remain >= 99%`
  );
});
