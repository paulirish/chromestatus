import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { features as webFeatures } from 'web-features';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { resolveMovedWebFeatureIds } from '../src/compile-helpers.ts';
import { loadUpstreamMappings, parseWebFeatureValue, type UpstreamMappings } from '../src/upstream-mappings.ts';
import {
  auditOverrides,
  suggestChromeStatusEdits,
  crbugId,
  mdnKey,
  type RawFeatureLike,
  type WebFeaturesCatalog,
} from '../src/mapping-audit.ts';

const catalog: WebFeaturesCatalog = {
  'grid-lanes': { kind: 'feature' },
  'masonry': { kind: 'moved', redirect_target: 'grid-lanes' },
  'gradients': { kind: 'feature' },
  'conic-gradients': { kind: 'feature' },
  'single-color-gradients': { kind: 'split', redirect_targets: ['gradients', 'conic-gradients'] },
  'canvas': { kind: 'feature' },
  'canvas-html': { kind: 'feature' },
  'languagemodel': { kind: 'feature' },
  'container-timing': { kind: 'feature' },
  'let-const': { kind: 'feature' },
  'hashbang-comments': { kind: 'feature' },
};

const upstream: UpstreamMappings = {
  chromeStatus: { 'canvas': [{ name: 'HTML in canvas', url: 'https://chromestatus.com/feature/1', 'bug-url': null }] },
  bugs: { 'container-timing': { chrome: ['https://issues.chromium.org/issues/382422286'] } },
  mdnDocs: {
    'let-const': [{ title: 'let', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/let', anchor: null }],
    'hashbang-comments': [{ title: 'Hashbang', url: 'https://developer.mozilla.org/docs/Web/JavaScript/Reference/Lexical_grammar', anchor: 'hashbang_comments' }],
  },
  useCounters: {}, standardsPositions: {}, wpt: {}, interop: {}, developerSignals: {},
};

const features: RawFeatureLike[] = [
  { id: 1, name: 'HTML in canvas', web_feature: 'canvas' },
  { id: 2, name: 'Grid lanes', web_feature: 'masonry' },
  { id: 3, name: 'Prompt API', web_feature: 'languagemodel' },
  { id: 4, name: 'Unmapped with bug', web_feature: 'Missing feature', bug_url: 'https://crbug.com/382422286' },
  { id: 5, name: 'Unmapped with MDN', web_feature: null, doc_links: ['https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let'] },
  { id: 6, name: 'Unmapped with section link', web_feature: null, doc_links: ['https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#Numeric_literals'] },
  { id: 7, name: 'Bad value', web_feature: 'LanguageModel' },
  { id: 8, name: 'Issue link', web_feature: 'https://github.com/web-platform-dx/web-features/issues/1' },
  { id: 9, name: 'Split value', web_feature: 'single-color-gradients' },
];

test('parseWebFeatureValue drops placeholders and splits lists', () => {
  assert.deepEqual(parseWebFeatureValue('Missing feature'), []);
  assert.deepEqual(parseWebFeatureValue('None'), []);
  assert.deepEqual(parseWebFeatureValue(null), []);
  assert.deepEqual(parseWebFeatureValue(' a , b '), ['a', 'b']);
});

test('resolveMovedWebFeatureIds rewrites moved IDs only', () => {
  assert.equal(resolveMovedWebFeatureIds('masonry', catalog), 'grid-lanes');
  assert.equal(resolveMovedWebFeatureIds('masonry,grid-lanes', catalog), 'grid-lanes');
  assert.equal(resolveMovedWebFeatureIds('single-color-gradients', catalog), 'single-color-gradients');
  assert.equal(resolveMovedWebFeatureIds(' canvas ', catalog), ' canvas ', 'unchanged input is returned as-is');
});

test('auditOverrides classifies each override', () => {
  const overrides = {
    'HTML in canvas': 'canvas-html',  // conflict
    'Grid lanes': 'grid-lanes',       // redundant via moved redirect
    'Prompt API': 'languagemodel',    // redundant
    'Unmapped with bug': 'container-timing', // needed
    'Split value': 'masonry',         // broken: override uses a moved ID
    'Renamed away': 'canvas',         // unknown-name
  };
  const byName = Object.fromEntries(auditOverrides(overrides, features, upstream, catalog).map(o => [o.featureName, o]));
  assert.equal(byName['HTML in canvas'].status, 'conflict');
  assert.deepEqual(byName['HTML in canvas'].upstreamIds, ['canvas']);
  assert.equal(byName['Grid lanes'].status, 'redundant');
  assert.equal(byName['Prompt API'].status, 'redundant');
  assert.equal(byName['Unmapped with bug'].status, 'needed');
  assert.equal(byName['Split value'].status, 'broken');
  assert.equal(byName['Renamed away'].status, 'unknown-name');
  assert.equal(byName['Renamed away'].chromestatusUrl, null);
});

test('suggestChromeStatusEdits covers overrides, bad IDs, and evidence-based candidates', () => {
  const audit = auditOverrides({ 'HTML in canvas': 'canvas-html' }, features, upstream, catalog);
  const edits = suggestChromeStatusEdits(audit, features, upstream, catalog);
  const byName = Object.fromEntries(edits.map(e => [e.featureName, e]));

  assert.equal(byName['HTML in canvas'].reason, 'override');
  assert.equal(byName['HTML in canvas'].suggestedValue, 'canvas-html');
  assert.equal(byName['Grid lanes'].reason, 'moved-id');
  assert.equal(byName['Grid lanes'].suggestedValue, 'grid-lanes');
  assert.equal(byName['Split value'].reason, 'split-id');
  assert.equal(byName['Bad value'].reason, 'invalid-id');
  assert.equal(byName['Bad value'].suggestedValue, 'languagemodel');
  assert.equal(byName['Issue link'].reason, 'invalid-id');
  assert.equal(byName['Issue link'].suggestedValue, null);
  assert.equal(byName['Unmapped with bug'].reason, 'shared-bug');
  assert.equal(byName['Unmapped with bug'].suggestedValue, 'container-timing');
  assert.equal(byName['Unmapped with MDN'].reason, 'mdn-docs');
  assert.equal(byName['Unmapped with MDN'].suggestedValue, 'let-const');
  assert.equal(byName['Unmapped with section link'], undefined, 'a section link must not match a different section');
  assert.equal(byName['Prompt API'], undefined, 'valid values need no edit');
});

test('crbugId and mdnKey normalize URL variants', () => {
  assert.equal(crbugId('https://bugs.chromium.org/p/chromium/issues/detail?id=394770'), '394770');
  assert.equal(crbugId('https://issues.chromium.org/issues/382422286'), '382422286');
  assert.equal(crbugId('https://crbug.com/907601'), '907601');
  assert.equal(crbugId('https://example.com/1'), null);
  assert.equal(mdnKey('https://developer.mozilla.org/en-US/docs/Web/API/Foo/'), 'web/api/foo');
  assert.equal(mdnKey('https://developer.mozilla.org/docs/Web/API/Foo#Bar'), 'web/api/foo#bar');
  assert.equal(mdnKey('https://developer.mozilla.org/docs/Web/API/Foo', 'Bar'), 'web/api/foo#bar');
});

test('live overrides are all still needed', async (t) => {
  const rawUrl = new URL('../data/raw/features-verbose.json', import.meta.url);
  if (!fs.existsSync(rawUrl)) {
    t.skip('data/raw not downloaded; run `pnpm run download`');
    return;
  }
  const raw: RawFeatureLike[] = JSON.parse(fs.readFileSync(rawUrl, 'utf8')).features;
  const audit = auditOverrides(CUSTOM_WEB_FEATURE_OVERRIDES, raw, await loadUpstreamMappings(), webFeatures as WebFeaturesCatalog);
  const stale = audit.filter(o => o.status === 'redundant' || o.status === 'unknown-name' || o.status === 'broken');
  assert.deepEqual(
    stale.map(o => `${o.featureName}: ${o.status}${o.notes.length ? ` (${o.notes.join('; ')})` : ''}`),
    [],
    'Remove or fix these overrides in src/overrides.ts (see `pnpm run audit:overrides`)'
  );
});

test('buildWebFeatureExtras keeps only published fields and omits empty IDs', async () => {
  const { buildWebFeatureExtras } = await import('../src/upstream-mappings.ts');
  const extras = buildWebFeatureExtras(['grid-lanes', 'canvas', 'grid-lanes'], {
    ...upstream,
    useCounters: { 'grid-lanes': { percentageOfPageLoad: 0.5, url: 'https://chromestatus.com/metrics/webfeature/timeline/popularity/1' } },
    standardsPositions: { 'grid-lanes': [{ vendor: 'mozilla', position: 'positive', url: 'https://github.com/mozilla/standards-positions/issues/1', concerns: [] } as any] },
  });
  assert.deepEqual(Object.keys(extras), ['grid-lanes']);
  assert.deepEqual(extras['grid-lanes'].standardsPositions, [{ vendor: 'mozilla', position: 'positive', url: 'https://github.com/mozilla/standards-positions/issues/1' }]);
  assert.equal(extras['grid-lanes'].useCounter?.percentageOfPageLoad, 0.5);
});
