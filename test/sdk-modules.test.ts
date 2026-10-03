import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { tokenize } from '../src/text-analyzer.ts';
import { normalizeBaseUrl, extractAnchor, isSpecMatch } from '../src/spec-matcher.ts';
import { CollectorResultsIndex } from '../src/collector-results-index.ts';
import { ConformanceAuditor, classifyConformance, findMilestoneDrift } from '../src/conformance.ts';
import type { ChromeStatusFeatureVerbose } from '../src/types.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('Centralized Mapping Overrides', () => {
  assert.ok(CUSTOM_WEB_FEATURE_OVERRIDES);
  assert.equal(CUSTOM_WEB_FEATURE_OVERRIDES['HTML-in-canvas'], 'canvas-html');
});

test('Tokenizer and Stop Word Filtering', () => {
  const tokens = tokenize("WebGL canvas capability implementation");
  assert.ok(tokens.has('webgl'));
  assert.ok(tokens.has('canvas'));
  assert.ok(!tokens.has('implementation')); // Filtered by stop words
  assert.ok(!tokens.has('a')); // Filtered by stop words
});

test('Spec URL Normalization', () => {
  assert.equal(normalizeBaseUrl('https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-todataurl'), 'https://html.spec.whatwg.org/multipage/canvas.html');
  assert.equal(normalizeBaseUrl('https://html.spec.whatwg.org/multipage/canvas.html'), 'https://html.spec.whatwg.org/multipage/canvas.html');
  assert.equal(normalizeBaseUrl(''), '');
  assert.equal(normalizeBaseUrl(null), '');
});

test('Spec URL Anchor Extraction', () => {
  assert.equal(extractAnchor('https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-todataurl'), 'dom-canvas-todataurl');
  assert.equal(extractAnchor('https://html.spec.whatwg.org/multipage/canvas.html'), null);
  assert.equal(extractAnchor(''), null);
  assert.equal(extractAnchor(null), null);
});

test('Spec Matcher Alignment', () => {
  assert.ok(isSpecMatch(
    'https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-todataurl',
    'https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-todataurl'
  ));

  assert.equal(isSpecMatch(
    'https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-todataurl',
    'https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob'
  ), false);

  assert.ok(isSpecMatch(
    'https://indexeddb.spec.whatwg.org/#dom-idbfactory-open',
    'https://indexeddb.spec.whatwg.org/'
  ));
  
  assert.equal(isSpecMatch(
    'https://html.spec.whatwg.org/multipage/interaction.html#dom-dragevent',
    'https://html.spec.whatwg.org/multipage/interaction.html#dom-datatransfer'
  ), false);
});

test('Collector Results Index Chronological Loading', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-results-index-test-'));
  
  const file1 = path.join(tempDir, '100.0.1000.0-chrome-100.0.1000.0-windows-unknown-0000000000.json');
  fs.writeFileSync(file1, JSON.stringify({
    results: {
      'api.foo': [{ name: 'api.foo.bar', result: true }],
      'api.baz': [{ name: 'api.baz.qux', result: false }]
    }
  }));

  const file2 = path.join(tempDir, '101.0.1100.0-chrome-101.0.1100.0-windows-unknown-0000000000.json');
  fs.writeFileSync(file2, JSON.stringify({
    results: {
      'api.foo': [{ name: 'api.foo.bar', result: true }],
      'api.baz': [{ name: 'api.baz.qux', result: true }]
    }
  }));

  try {
    const index = CollectorResultsIndex.loadFromDir(tempDir);

    const supportFoo = index.getSupport('api.foo.bar');
    assert.ok(supportFoo);
    assert.equal(supportFoo.majorVersion, 100);
    assert.equal(supportFoo.fullVersion, '100.0.1000.0');

    const supportBaz = index.getSupport('api.baz.qux');
    assert.ok(supportBaz);
    assert.equal(supportBaz.majorVersion, 101);
    assert.equal(supportBaz.fullVersion, '101.0.1100.0');

    assert.equal(index.getSupport('api.unknown'), undefined);

  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Conformance Auditor - Conformant Case', () => {
  const mockCollectorIndex = {
    getSupport(bcdKey: string) {
      if (bcdKey.includes('popover')) {
        return { majorVersion: 116, fullVersion: '116.0.0.0' };
      }
      return undefined;
    }
  } as unknown as CollectorResultsIndex;

  const auditor = new ConformanceAuditor(mockCollectorIndex);

  const mockFeature = {
    id: 1,
    name: "Popover API",
    summary: "A mechanism for displaying popovers",
    web_feature_ids: ["popover"],
    browsers: {
      chrome: {
        desktop: 116
      }
    }
  } as unknown as ChromeStatusFeatureVerbose;

  const result = auditor.audit([mockFeature]);

  assert.equal(result.conformant.length, 1);
  assert.equal(result.conformant[0].id, 1);
  assert.equal(result.conformant[0].name, "Popover API");
  assert.equal(result.conformant[0].csMilestone, 116);
  assert.equal(result.conformant[0].wfMilestone, "M116");
  assert.ok(result.conformant[0].collector.startsWith("M116"));
  
  assert.equal(result.bcdLagging.length, 0);
  assert.equal(result.csStale.length, 0);
  assert.equal(result.flagGaps.length, 0);
  assert.equal(result.coarseMapping.length, 0);
});

test('Conformance Auditor - Coarse Mapping Case', () => {
  const mockCollectorIndex = {
    getSupport(bcdKey: string) {
      if (bcdKey.includes('pagereveal')) {
        return { majorVersion: 123, fullVersion: '123.0.0.0' };
      }
      return undefined;
    }
  } as unknown as CollectorResultsIndex;

  const auditor = new ConformanceAuditor(mockCollectorIndex);

  const mockFeature = {
    id: 2,
    name: "'pagereveal' event",
    summary: "fires when a document is revealed",
    web_feature_ids: ["view-transitions"], // Coarse parent web feature ID
    browsers: {
      chrome: {
        desktop: 123
      }
    }
  } as unknown as ChromeStatusFeatureVerbose;

  // Let's mock webFeatures structure locally for view-transitions
  // In real test, it loads BCD keys from view-transitions: PageRevealEvent
  // Our local mockCollectorIndex returns M123 for PageRevealEvent keys.
  // And view-transitions static milestone in web-features is M111.
  const result = auditor.audit([mockFeature]);

  assert.equal(result.coarseMapping.length, 1);
  assert.equal(result.coarseMapping[0].id, 2);
  assert.equal(result.coarseMapping[0].csMilestone, 123);
  assert.equal(result.coarseMapping[0].wfMilestone, "M111");
  assert.ok(result.coarseMapping[0].collector.startsWith("M123"));

  assert.equal(result.conformant.length, 0);
  assert.equal(result.bcdLagging.length, 0);
  assert.equal(result.csStale.length, 0);
  assert.equal(result.flagGaps.length, 0);
});

test('classifyConformance buckets', () => {
  // [ChromeStatus milestone, web-features milestone, earliest collector pass]
  const cases: Array<[number, number | null, number]> = [
    [116, 116, 116], [116, 116, 110], // conformant
    [118, 143, 118],                  // collector agrees with ChromeStatus: BCD lags
    [142, 111, 109], [100, 120, 110], // collector agrees with BCD: ChromeStatus stale
    [123, 111, 123],                  // BCD earlier than any collector pass: coarse
    [125, null, 120], [125, null, 130], // no BCD support
  ];
  assert.deepEqual(cases.map(([cs, wf, min]) => classifyConformance(cs, wf, min)), [
    'conformant', 'conformant', 'bcdLagging', 'csStale', 'csStale', 'coarseMapping', 'bcdLagging', 'flagGaps',
  ]);
});

test('findMilestoneDrift keeps disagreeing features without collector evidence', () => {
  const record = (name: string, csMilestone: number, wfMilestone: string) =>
    ({ id: 0, name, webFeatureId: 'x', csMilestone, wfMilestone, collector: '', keys: '' });
  const drift = findMilestoneDrift({
    noCollectorData: [record('agree', 120, 'M120'), record('differ', 120, 'M118')],
    noBcdKeys: [record('unsupported in BCD', 125, 'unsupported')],
  });
  assert.deepEqual(drift.map(r => r.name), ['differ', 'unsupported in BCD']);
});
