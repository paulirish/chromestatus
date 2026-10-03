import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import type { ChromeStatusFeatureBasic } from '../src/types.ts';

test('WebFeature Join Fidelity - String identifiers map perfectly to web-features catalog', () => {
  const knownWebFeatureIds = [
    'canvas',
    'webgpu',
    'view-transitions',
    'abortable-fetch',
    'accent-color'
  ];

  for (const webFeatureId of knownWebFeatureIds) {
    assert.equal(
      Object.hasOwn(webFeatures, webFeatureId), 
      true, 
      `Web feature ID "${webFeatureId}" must exist as a top-level key in the web-features package export`
    );
  }

  assert.equal(
    Object.hasOwn(webFeatures, 'non-existent-fantasy-feature-id'),
    false
  );
});

test('WebFeature Population Metrics - Audits catalog string identifier presence and package mapping validity', async () => {
  let features: ChromeStatusFeatureBasic[] = [];
  try {
    const litePath = path.resolve(process.cwd(), 'data', 'lite.json');
    const text = await fs.readFile(litePath, 'utf8');
    features = JSON.parse(text);
  } catch {
    // Skip subtest execution gracefully if compiled snapshot layer is unpopulated locally
    return;
  }

  const totalCount = features.length;
  const populatedFeatures = features.filter(f => typeof f.web_feature === 'string' && f.web_feature.trim() !== '');
  const populatedPercentage = ((populatedFeatures.length / totalCount) * 100).toFixed(2);

  console.log(`\n[WebFeature Metrics]: Populated on ${populatedFeatures.length} out of ${totalCount} features (${populatedPercentage}%)`);

  // Exclude literal string placeholders to evaluate true web feature ID mapping alignment
  const legitimateFeatures = populatedFeatures.filter(f => f.web_feature !== 'Missing feature');
  let validMappingCount = 0;
  const invalidSamples: string[] = [];

  // Known upstream dictionary deviations where IDs have not synchronized to web-features
  const knownUpstreamExceptions = new Set([
    'svg-path-length-css',
    'gethtml',
    'dedicated-workers',
    'service-workers',
    'js-modules-service-workers'
  ]);

  for (const feature of legitimateFeatures) {
    const webFeatureIds = (feature.web_feature ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const unknown = webFeatureIds.filter(s => !Object.hasOwn(webFeatures, s));
    if (unknown.length === 0) {
      validMappingCount++;
    } else if (!unknown.every(s => knownUpstreamExceptions.has(s))) {
      if (invalidSamples.length < 5) {
        invalidSamples.push(`"${feature.web_feature}" (${feature.name})`);
      }
    }
  }

  const validPercentage = ((validMappingCount / legitimateFeatures.length) * 100).toFixed(2);
  console.log(`[WebFeature Metrics]: ${validMappingCount} out of ${legitimateFeatures.length} legitimate web feature IDs successfully map directly to web-features catalog (${validPercentage}%)`);

  // Validate that mapping fidelity remains highly deterministic and valid across the dataset
  assert.equal(
    validMappingCount / legitimateFeatures.length >= 0.99,
    true,
    `Global web_feature ID mapping accuracy (${validPercentage}%) must remain >= 99%`
  );
});
