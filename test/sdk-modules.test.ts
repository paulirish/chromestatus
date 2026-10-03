import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { tokenize, jaccardIndex, overlapCoefficient } from '../src/text-analyzer.ts';
import { normalizeBaseUrl, extractAnchor, isSpecMatch } from '../src/spec-matcher.ts';
import { CollectorResultsIndex } from '../src/collector-results-index.ts';
import { ConformanceAuditor } from '../src/conformance.ts';
import { AlignmentAuditor } from '../src/alignment.ts';
import type { ChromeStatusFeatureVerbose, ChromeStatusFeatureBasic } from '../src/types.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('Centralized Mapping Overrides', () => {
  assert.ok(CUSTOM_WEB_FEATURE_OVERRIDES);
  assert.equal(CUSTOM_WEB_FEATURE_OVERRIDES['HTML-in-canvas'], 'canvas-html');
  assert.equal(CUSTOM_WEB_FEATURE_OVERRIDES['Proofreader API'], 'languagemodel');
});

test('Tokenizer and Stop Word Filtering', () => {
  const tokens = tokenize("WebGL canvas capability implementation");
  assert.ok(tokens.has('webgl'));
  assert.ok(tokens.has('canvas'));
  assert.ok(!tokens.has('implementation')); // Filtered by stop words
  assert.ok(!tokens.has('a')); // Filtered by stop words
});

test('Jaccard Similarity Index', () => {
  const setA = new Set(['apple', 'banana', 'cherry']);
  const setB = new Set(['banana', 'cherry', 'date']);
  assert.equal(jaccardIndex(setA, setB), 0.5);
  assert.equal(jaccardIndex(new Set(), new Set()), 1);
  assert.equal(jaccardIndex(new Set(['a']), new Set()), 0);
});

test('Overlap Coefficient', () => {
  const setA = new Set(['apple', 'banana']);
  const setB = new Set(['apple', 'banana', 'cherry']);
  assert.equal(overlapCoefficient(setA, setB), 1.0);
  assert.equal(overlapCoefficient(new Set(), new Set(['a'])), 0);
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
    web_feature: "popover",
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
    web_feature: "view-transitions", // Coarse parent web feature ID
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

test('Alignment Auditor - Diagnostics', () => {
  const mockFeatures: ChromeStatusFeatureBasic[] = [
    {
      id: 10,
      name: "Orphan Feature",
      summary: "Summary",
      web_feature: "non-existent-symbol",
      category: "CSS",
      blink_components: [],
      star_count: 0,
      is_released: true,
      browsers: { chrome: { status: { text: "Enabled by default" } } } as any,
      standards: { maturity: { short_text: "ED" } } as any,
      stage_types: []
    },
    {
      id: 20,
      name: "Moved Feature",
      summary: "Summary",
      web_feature: "display-grid-lanes",
      category: "CSS",
      blink_components: [],
      star_count: 0,
      is_released: true,
      browsers: { chrome: { status: { text: "Enabled by default" } } } as any,
      standards: { maturity: { short_text: "ED" } } as any,
      stage_types: []
    },
    {
      id: 25,
      name: "Split Feature",
      summary: "Summary",
      web_feature: "single-color-gradients",
      category: "CSS",
      blink_components: [],
      star_count: 0,
      is_released: true,
      browsers: { chrome: { status: { text: "Enabled by default" } } } as any,
      standards: { maturity: { short_text: "ED" } } as any,
      stage_types: []
    },
    {
      id: 30,
      name: "Drifting Feature",
      summary: "Summary",
      web_feature: "grid",
      category: "CSS",
      blink_components: [],
      star_count: 0,
      is_released: true,
      browsers: { chrome: { status: { text: "Enabled in Chrome 50" } } } as any,
      standards: { maturity: { short_text: "ED" } } as any,
      stage_types: []
    },
    {
      id: 41,
      name: "Collision Feature 1",
      summary: "Summary",
      web_feature: "flexbox",
      category: "CSS",
      blink_components: [],
      star_count: 0,
      is_released: true,
      browsers: { chrome: { status: { text: "Enabled by default" } } } as any,
      standards: { maturity: { short_text: "ED" } } as any,
      stage_types: []
    },
    {
      id: 42,
      name: "Collision Feature 2",
      summary: "Summary",
      web_feature: "flexbox",
      category: "CSS",
      blink_components: [],
      star_count: 0,
      is_released: true,
      browsers: { chrome: { status: { text: "Enabled by default" } } } as any,
      standards: { maturity: { short_text: "ED" } } as any,
      stage_types: []
    }
  ];

  const report = AlignmentAuditor.run(mockFeatures);

  assert.deepEqual({
    orphans: report.orphans.map(({ featureId, ...rest }) => rest),
    redirects: report.redirects.map(({ featureId, ...rest }) => rest),
    milestoneDrift: report.milestoneDrift.map(({ featureId, ...rest }) => rest),
    collisions: report.collisions.map(({ featureIds, ...rest }) => rest),
  }, {
    orphans: [
      { featureName: "Orphan Feature", staleSymbol: "non-existent-symbol" },
    ],
    redirects: [
      { featureName: "Moved Feature", fromSymbol: "display-grid-lanes", kind: "moved", target: "grid-lanes" },
      { featureName: "Split Feature", fromSymbol: "single-color-gradients", kind: "split", target: ["gradients", "conic-gradients"] },
    ],
    milestoneDrift: [
      { featureName: "Drifting Feature", symbol: "grid", csMilestone: "M50", wfMilestone: "M57" },
    ],
    collisions: [
      { symbol: "flexbox", featureNames: ["Collision Feature 1", "Collision Feature 2"] },
    ],
  });
});
