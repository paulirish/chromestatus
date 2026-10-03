import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWebFeatureValue,
  resolveMovedWebFeatureId,
  resolveWebFeatureIds,
  resolveWebFeatureBaselineYear,
  resolveBaselineYear,
  resolveGatedBy,
  disambiguateFeatureNames,
  type OriginTrialContext,
  type WebFeaturesCatalog,
} from '../src/compile-helpers.ts';

const catalog: WebFeaturesCatalog = {
  'feature-a': { kind: 'feature', status: { baseline_low_date: '2024-05-10' } },
  'feature-b': { kind: 'moved', redirect_target: 'feature-a' },
  'feature-c': { kind: 'feature', status: {} },
  'feature-s': { kind: 'split', redirect_targets: ['feature-a', 'feature-c'] },
  'canvas-html': { kind: 'feature' },
};

test('web feature ID resolution', () => {
  const ids = (name: string, web_feature: string | null) => resolveWebFeatureIds({ name, web_feature }, catalog);
  assert.deepEqual({
    parsePlaceholders: ['Missing feature', 'None', '', null].map(parseWebFeatureValue),
    parseList: parseWebFeatureValue(' a , b '),
    moved: resolveMovedWebFeatureId('feature-b', catalog),
    split: resolveMovedWebFeatureId('feature-s', catalog),
    unknown: resolveMovedWebFeatureId('unknown', catalog),
    override: ids('HTML-in-canvas', 'canvas'),
    overrideIgnoresPadding: ids('  HTML-in-canvas ', null),
    listMovedDeduped: ids('Feature A', '  feature-a, Feature-B  '),
    placeholder: ids('Feature B', 'Missing feature'),
  }, {
    parsePlaceholders: [[], [], [], []],
    parseList: ['a', 'b'],
    moved: 'feature-a',
    split: 'feature-s',
    unknown: 'unknown',
    override: ['canvas-html'],
    overrideIgnoresPadding: ['canvas-html'],
    listMovedDeduped: ['feature-a'],
    placeholder: [],
  });
});

test('baseline year', () => {
  const year = (id: string) => resolveWebFeatureBaselineYear(id, catalog);
  assert.deepEqual(
    ['feature-a', 'feature-b', 'feature-c', 'unknown'].map(year),
    [2024, 2024, undefined, undefined]
  );
  const years: Record<string, number> = { x: 2019, y: 2025 };
  assert.deepEqual(
    [[], ['x'], ['x', 'y'], ['x', 'none']].map(ids => resolveBaselineYear(ids, id => years[id])),
    [undefined, 2019, 2025, 2019]
  );
});

test('resolveGatedBy', () => {
  const feed: OriginTrialContext = {
    activeStableMilestone: 120,
    otApiActiveFeatureIds: new Set([101]),
    otApiActiveTrialNames: new Set(['ActiveTrialName']),
  };
  const noFeed: OriginTrialContext = { ...feed, otApiActiveFeatureIds: new Set(), otApiActiveTrialNames: new Set() };
  const otStage = (desktop_first: number, desktop_last: number | null) => ({ stage_type: 150 as const, desktop_first, desktop_last });

  const cases = {
    feedListsFeatureId: resolveGatedBy({ id: 101 }, feed, undefined),
    feedListsTrialName: resolveGatedBy({ id: 102, stages: [{ stage_type: 150, ot_chromium_trial_name: 'ActiveTrialName' }] }, feed, undefined),
    feedListsDeprecationTrialName: resolveGatedBy({ id: 104, stages: [{ stage_type: 450, ot_chromium_trial_name: 'ActiveTrialName' }] }, feed, undefined),
    feedIgnoresEvalReadinessStage: resolveGatedBy({ id: 105, stages: [{ stage_type: 140, ot_chromium_trial_name: 'ActiveTrialName' }] }, feed, undefined),
    feedOverridesHeuristic: resolveGatedBy({ id: 103, stages: [otStage(100, 125)] }, feed, undefined),
    heuristicEndedTrial: resolveGatedBy({ id: 1, stages: [otStage(100, 115)] }, noFeed, undefined),
    heuristicRunningTrial: resolveGatedBy({ id: 2, stages: [otStage(100, 125)] }, noFeed, undefined),
    heuristicFutureTrial: resolveGatedBy({ id: 3, stages: [otStage(125, 130)] }, noFeed, undefined),
    heuristicStatusOriginTrial: resolveGatedBy({ id: 9, stages: [otStage(100, null)], browsers: { chrome: { origintrial: true, status: { text: 'Origin trial' } } } }, noFeed, undefined),
    heuristicShipped: resolveGatedBy({ id: 4, stages: [otStage(100, 125)], browsers: { chrome: { status: { text: 'Enabled by default' } } } }, noFeed, undefined),
    oldBaselineTrial: resolveGatedBy({ id: 101 }, feed, 2015),
    flag: resolveGatedBy({ id: 5, browsers: { chrome: { flag: true } } }, feed, undefined),
    flagStatusText: resolveGatedBy({ id: 6, browsers: { chrome: { status: { text: 'In developer trial (Behind a flag)' } } } }, feed, 2024),
    flagShipped: resolveGatedBy({ id: 7, browsers: { chrome: { flag: true, status: { text: 'Shipped' } } } }, feed, undefined),
    flagOldBaseline: resolveGatedBy({ id: 8, browsers: { chrome: { flag: true } } }, feed, 2023),
    both: resolveGatedBy({ id: 101, browsers: { chrome: { flag: true } } }, feed, undefined),
  };
  assert.deepEqual(cases, {
    feedListsFeatureId: ['Origin Trial'],
    feedListsTrialName: ['Origin Trial'],
    feedListsDeprecationTrialName: ['Origin Trial'],
    feedIgnoresEvalReadinessStage: [],
    feedOverridesHeuristic: [],
    heuristicEndedTrial: [],
    heuristicRunningTrial: ['Origin Trial'],
    heuristicFutureTrial: [],
    heuristicStatusOriginTrial: ['Origin Trial'],
    heuristicShipped: [],
    oldBaselineTrial: [],
    flag: ['Flag'],
    flagStatusText: ['Flag'],
    flagShipped: [],
    flagOldBaseline: [],
    both: ['Origin Trial', 'Flag'],
  });
});

test('disambiguateFeatureNames', () => {
  const features = [{ name: 'WebGPU' }, { name: 'WebGPU ' }, { name: 'webgpu' }, { name: 'WebGL' }];
  disambiguateFeatureNames(features);
  assert.deepEqual(features.map(f => f.name), ['WebGPU', 'WebGPU (Phase 2)', 'webgpu (Phase 3)', 'WebGL']);
});
