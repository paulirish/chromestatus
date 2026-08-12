import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWebFeatureBaselineYear,
  evaluateActiveOriginTrial,
  evaluateBehindFlag,
  disambiguateFeatureNames,
  assignWebFeaturesAndBaselineYears
} from '../src/compile-helpers.ts';

test('resolveWebFeatureBaselineYear', () => {
  // Mock web-features catalog
  const mockCatalog = {
    'feature-a': {
      status: { baseline_low_date: '2024-05-10' }
    },
    'feature-b': {
      kind: 'moved',
      redirect_target: 'feature-a'
    },
    'feature-c': {
      status: {}
    },
    'feature-d': {}
  };

  assert.equal(resolveWebFeatureBaselineYear('feature-a', mockCatalog), 2024);
  assert.equal(resolveWebFeatureBaselineYear('feature-b', mockCatalog), 2024); // Resolves redirect
  assert.equal(resolveWebFeatureBaselineYear('feature-c', mockCatalog), undefined);
  assert.equal(resolveWebFeatureBaselineYear('feature-d', mockCatalog), undefined);
  assert.equal(resolveWebFeatureBaselineYear('unknown-feature', mockCatalog), undefined);
});

test('evaluateActiveOriginTrial - basic cases', () => {
  const activeStableMilestone = 120;
  const otApiActiveFeatureIds = new Set([101]);
  const otApiActiveTrialNames = new Set(['ActiveTrialName']);

  // Case 1: Matching OT API Feature ID
  const feature1 = { id: 101, stages: [] };
  assert.equal(evaluateActiveOriginTrial(feature1, activeStableMilestone, otApiActiveFeatureIds, otApiActiveTrialNames), true);

  // Case 2: Matching OT API Trial Name inside stages
  const feature2 = {
    id: 102,
    stages: [
      { stage_type: 150, ot_chromium_trial_name: 'ActiveTrialName' }
    ]
  };
  assert.equal(evaluateActiveOriginTrial(feature2, activeStableMilestone, otApiActiveFeatureIds, otApiActiveTrialNames), true);

  // Case 3: Empty stages, no match
  const feature3 = { id: 103, stages: [] };
  assert.equal(evaluateActiveOriginTrial(feature3, activeStableMilestone, otApiActiveFeatureIds, otApiActiveTrialNames), false);
});

test('evaluateActiveOriginTrial - empirical checks (no live OT API match)', () => {
  const activeStableMilestone = 120;
  const emptyIds = new Set<number>();
  const emptyNames = new Set<string>();

  // Case 1: Legacy completed trial (end milestone < activeStableMilestone)
  const feature1 = {
    id: 1,
    stages: [
      { stage_type: 150, desktop_first: 100, desktop_last: 115 }
    ]
  };
  assert.equal(evaluateActiveOriginTrial(feature1, activeStableMilestone, emptyIds, emptyNames), false);

  // Case 2: Active trial (end milestone >= activeStableMilestone)
  const feature2 = {
    id: 2,
    stages: [
      { stage_type: 150, desktop_first: 100, desktop_last: 125 }
    ]
  };
  assert.equal(evaluateActiveOriginTrial(feature2, activeStableMilestone, emptyIds, emptyNames), true);

  // Case 3: Shipped feature (should be bypassed)
  const feature3 = {
    id: 3,
    is_released: true,
    stages: [
      { stage_type: 150, desktop_first: 100, desktop_last: 125 }
    ]
  };
  assert.equal(evaluateActiveOriginTrial(feature3, activeStableMilestone, emptyIds, emptyNames), false);
});

test('evaluateActiveOriginTrial - baseline year exclusion bounds', () => {
  const activeStableMilestone = 120;
  const emptyIds = new Set<number>();
  const emptyNames = new Set<string>();

  // Case 1: Active trial name match, but maps to baseline year < 2024 (e.g. 2020)
  const feature1 = {
    id: 1,
    name: 'HTML-in-canvas', // Overridden to canvas-html, baseline year is 2015/legacy
    web_feature: 'canvas',
    stages: [
      { stage_type: 150, desktop_first: 100, desktop_last: 125 }
    ]
  };
  
  const mockBaselineResolver = (symbol: string) => {
    if (symbol === 'canvas-html' || symbol === 'canvas') return 2015;
    return undefined;
  };

  assert.equal(evaluateActiveOriginTrial(feature1, activeStableMilestone, emptyIds, emptyNames, mockBaselineResolver), false);
});

test('evaluateBehindFlag', () => {
  // Case 1: Gated behind flag
  const feature1 = {
    id: 1,
    browsers: { chrome: { flag: true } }
  };
  assert.equal(evaluateBehindFlag(feature1), true);

  // Case 2: Gated behind flag but already shipped
  const feature2 = {
    id: 2,
    is_released: true,
    browsers: { chrome: { flag: true, status: { text: 'Shipped' } } }
  };
  assert.equal(evaluateBehindFlag(feature2), false);
});

test('disambiguateFeatureNames', () => {
  const features: any[] = [
    { id: 1, name: 'WebGPU' },
    { id: 2, name: 'WebGPU' },
    { id: 3, name: 'WebGPU' },
    { id: 4, name: 'WebGL' }
  ];

  disambiguateFeatureNames(features);

  assert.equal(features[0].name, 'WebGPU');
  assert.equal(features[1].name, 'WebGPU (Phase 2)');
  assert.equal(features[2].name, 'WebGPU (Phase 3)');
  assert.equal(features[3].name, 'WebGL');
});

test('assignWebFeaturesAndBaselineYears', () => {
  const features: any[] = [
    { id: 1, name: 'HTML-in-canvas', web_feature: 'canvas' }, // Name override -> canvas-html
    { id: 2, name: 'Feature A', web_feature: '  feature-a, feature-b  ' },
    { id: 3, name: 'Feature B', web_feature: 'Missing feature' }
  ];

  const mockBaselineResolver = (symbol: string) => {
    if (symbol === 'canvas-html') return 2026;
    if (symbol === 'feature-a') return 2024;
    if (symbol === 'feature-b') return 2025;
    return undefined;
  };

  const webFeatureMap = assignWebFeaturesAndBaselineYears(features, mockBaselineResolver);

  // Assert mapping values
  assert.equal(webFeatureMap.get(1), 'canvas-html');
  assert.equal(features[0].web_feature, 'canvas-html');
  assert.equal(features[0].baseline_year, 2026);

  assert.equal(webFeatureMap.get(2), 'feature-a, feature-b');
  assert.equal(features[1].baseline_year, 2025); // Max baseline year between 2024 and 2025

  assert.equal(webFeatureMap.has(3), false);
  assert.equal(features[2].web_feature, undefined);
  assert.equal(features[2].baseline_year, undefined);
});
