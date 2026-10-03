import test from 'node:test';
import assert from 'node:assert/strict';
import { ChromeStatusClient } from '../src/index.ts';
import { basicFeature } from './fixtures.ts';

test('client queries compiled fields', () => {
  const client = new ChromeStatusClient([
    basicFeature({ id: 1, name: 'HTML-in-canvas', web_feature_ids: ['canvas-html'], gated_by: ['Origin Trial'] }),
    basicFeature({ id: 2, name: 'WebMCP', web_feature_ids: ['declarative-webmcp', 'document-modelcontext'], gated_by: ['Origin Trial', 'Flag'] }),
    basicFeature({ id: 3, name: 'Accent Color Base Implementation', web_feature_ids: ['accent-color'] }),
    basicFeature({ id: 4, name: 'System Accent Color Bindings', web_feature_ids: ['accent-color'], gated_by: ['Flag'] }),
  ]);
  const names = (features: ReadonlyArray<{ name: string }>) => features.map(f => f.name);

  assert.deepEqual({
    byWebFeatureId: client.findFeature('canvas-html')?.name,
    bySecondWebFeatureId: client.findFeature('document-modelcontext')?.name,
    byWebFeatureIdWord: client.findFeature('the accent-color property')?.name,
    byNameWords: client.findFeature('webmcp')?.name,
    byShuffledNameWords: client.findFeature('bindings color system accent')?.name,
    byNumericId: client.findFeature(2)?.name,
    noMatch: client.findFeature('nonexistent zebra'),
    allForWebFeatureId: names(client.findFeaturesByWebFeatureId('Accent-Color')),
    gated: names(client.getGatedFeatures()),
    originTrial: names(client.getGatedFeatures('Origin Trial')),
    flag: names(client.getGatedFeatures('Flag')),
    gatedWebFeatureIds: client.getGatedWebFeatureIds(),
    originTrialWebFeatureIds: client.getGatedWebFeatureIds('Origin Trial'),
  }, {
    byWebFeatureId: 'HTML-in-canvas',
    bySecondWebFeatureId: 'WebMCP',
    byWebFeatureIdWord: 'Accent Color Base Implementation',
    byNameWords: 'WebMCP',
    byShuffledNameWords: 'System Accent Color Bindings',
    byNumericId: 'WebMCP',
    noMatch: undefined,
    allForWebFeatureId: ['Accent Color Base Implementation', 'System Accent Color Bindings'],
    gated: ['HTML-in-canvas', 'WebMCP', 'System Accent Color Bindings'],
    originTrial: ['HTML-in-canvas', 'WebMCP'],
    flag: ['WebMCP', 'System Accent Color Bindings'],
    gatedWebFeatureIds: ['accent-color', 'canvas-html', 'declarative-webmcp', 'document-modelcontext'],
    originTrialWebFeatureIds: ['canvas-html', 'declarative-webmcp', 'document-modelcontext'],
  });
});

test('client features are frozen', () => {
  const { features } = new ChromeStatusClient([basicFeature({ id: 1, name: 'Frozen' })]);
  // @ts-expect-error - ReadonlyArray has no push
  assert.throws(() => features.push(features[0]), TypeError);
  // @ts-expect-error - Readonly feature
  assert.throws(() => { features[0].name = 'Changed'; }, TypeError);
});

test('client loads the compiled catalog', async () => {
  const client = await ChromeStatusClient.create();
  assert.ok(client.features.length > 3000);

  const pick = (query: string) => {
    const f = client.findFeature(query);
    return f && { name: f.name, web_feature_ids: f.web_feature_ids, gated_by: f.gated_by };
  };
  assert.deepEqual({
    htmlInCanvas: pick('canvas-html'),
    webmcp: pick('declarative-webmcp'),
    // Origin Trial stages ended in M65 and M137.
    audioWorkletGatedBy: pick('[WebAudio] AudioWorklet')?.gated_by,
    interestInvokersGatedBy: pick('interest invokers')?.gated_by,
  }, {
    htmlInCanvas: { name: 'HTML-in-canvas', web_feature_ids: ['canvas-html'], gated_by: ['Origin Trial'] },
    webmcp: { name: 'WebMCP', web_feature_ids: ['declarative-webmcp', 'document-modelcontext'], gated_by: ['Origin Trial'] },
    audioWorkletGatedBy: [],
    interestInvokersGatedBy: [],
  });

  const otIds = client.getGatedWebFeatureIds('Origin Trial');
  assert.deepEqual(['canvas-html', 'declarative-webmcp', 'document-modelcontext', 'canvas'].map(id => otIds.includes(id)), [true, true, true, false]);

  const verbose = await client.getFeatureVerbose('WebMCP');
  assert.deepEqual(verbose && { name: verbose.name, web_feature_ids: verbose.web_feature_ids }, { name: 'WebMCP', web_feature_ids: ['declarative-webmcp', 'document-modelcontext'] });
  assert.equal(await client.getFeatureVerbose('Unresolvable Zebra Title'), undefined);
});

test('client web-features-mappings extras', async () => {
  const client = await ChromeStatusClient.create();
  const vt = client.getWebFeatureExtras('view-transitions');
  assert.ok(vt, 'view-transitions must have compiled extras');
  assert.equal(typeof vt.useCounter?.percentageOfPageLoad, 'number');
  assert.match(vt.useCounter?.url ?? '', /^https:\/\/chromestatus\.com\/metrics\//);
  assert.match(vt.wpt?.url ?? '', /^https:\/\/wpt\.fyi\//);
  assert.equal(client.getWebFeatureExtras('non-existent-fantasy-feature-id'), undefined);
  assert.deepEqual(client.getFeatureExtras('view-transitions')['view-transitions'], vt);
});
