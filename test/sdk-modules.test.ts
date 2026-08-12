import { test } from 'node:test';
import assert from 'node:assert';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { tokenize, jaccardIndex, overlapCoefficient } from '../src/text-analyzer.ts';

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
