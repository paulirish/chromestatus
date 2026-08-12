import { test } from 'node:test';
import assert from 'node:assert';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { tokenize, jaccardIndex, overlapCoefficient } from '../src/text-analyzer.ts';
import { normalizeBaseUrl, extractAnchor, isSpecMatch } from '../src/spec-matcher.ts';
import { EmpiricalSupportIndex } from '../src/empirical-index.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('Centralized Mapping Overrides', () => {
  assert.ok(CUSTOM_WEB_FEATURE_OVERRIDES);
  assert.equal(CUSTOM_WEB_FEATURE_OVERRIDES['HTML-in-canvas'], 'canvas-html');
  assert.equal(CUSTOM_WEB_FEATURE_OVERRIDES['Numeric separators'], 'numeric-separators');
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

test('Empirical Support Index Chronological Loading', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empirical-index-test-'));
  
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
    const index = EmpiricalSupportIndex.loadFromDir(tempDir);

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
