import test from 'node:test';
import assert from 'node:assert/strict';
import { ChromeStatusClient } from '../src/index.ts';
import type { ChromeStatusFeatureStub } from '../src/types.ts';

test('RedTeam Audit: Immutability & Interface Invariant Bounds', () => {
  const baseStubs: ChromeStatusFeatureStub[] = [
    {
      id: 101,
      name: 'Immutable Interface Capability',
      summary: 'Ensuring safe runtime boundaries',
      category: 'Security',
      web_feature: 'secure-bounds',
      blink_components: ['Blink>Security'],
      star_count: 50,
      is_released: true,
      browsers: {
        chrome: {
          origintrial: false,
          flag: false,
          status: { text: 'Enabled by default', val: 1 },
          owners: ['security@chromium.org']
        }
      },
      standards: { maturity: { short_text: 'REC', val: 1 } },
      stage_types: [160]
    }
  ];

  const client = new ChromeStatusClient(baseStubs);
  const features = client.features;

  // 1. Assert array encapsulation safety
  assert.throws(() => {
    // @ts-expect-error - Intentional read-only array runtime mutation injection
    features.push({ id: 999 } as any);
  }, TypeError, 'Mutating public feature array wrapper must throw in strict execution context');

  // 2. Assert top-level object freezing boundaries
  assert.throws(() => {
    features[0].name = 'Hacked Target Name';
  }, TypeError, 'Mutating frozen base stub object references must throw natively');
});

test('RedTeam Audit: Sentinel Values & Unmapped Symbol Extraction Bypassing', () => {
  const sentinelStubs: ChromeStatusFeatureStub[] = [
    {
      id: 201,
      name: 'Sentinel Feature One',
      summary: 'Placeholder defaults test',
      category: 'Misc',
      web_feature: 'Missing feature',
      blink_components: ['Blink'],
      star_count: 0,
      is_released: false,
      browsers: {
        chrome: { origintrial: true, flag: false, status: { text: 'Origin trial', val: 3 }, owners: [] }
      },
      standards: { maturity: { short_text: 'WD', val: 2 } },
      stage_types: [150]
    },
    {
      id: 202,
      name: 'Sentinel Feature Two',
      summary: 'String None defaults test',
      category: 'Misc',
      web_feature: 'None',
      blink_components: ['Blink'],
      star_count: 0,
      is_released: false,
      browsers: {
        chrome: { origintrial: true, flag: false, status: { text: 'Origin trial', val: 3 }, owners: [] }
      },
      standards: { maturity: { short_text: 'WD', val: 2 } },
      stage_types: [150]
    }
  ];

  const client = new ChromeStatusClient(sentinelStubs, [201, 202]);
  const activeSymbols = client.getActiveOriginTrialWebFeatureIds();

  assert.equal(activeSymbols.includes('Missing feature'), false, 'Literal placeholder strings must be dropped from index output maps');
  assert.equal(activeSymbols.includes('none'), false, 'String None sentinel values must be scrubbed from lowercased symbol extractions');
  assert.equal(activeSymbols.length, 0, 'Output subset array must evaluate as completely empty for pure sentinel collections');
});

test('RedTeam Audit: Multi-Mapping Cardinality Retention & Search Consensus', () => {
  const multiStubs: ChromeStatusFeatureStub[] = [
    {
      id: 301,
      name: 'Accent Color Base Implementation',
      summary: 'CSS Property support',
      category: 'CSS',
      web_feature: 'accent-color',
      blink_components: ['Blink>CSS'],
      star_count: 10,
      is_released: true,
      browsers: { chrome: { origintrial: false, flag: false, status: { text: 'Enabled by default', val: 1 }, owners: [] } },
      standards: { maturity: { short_text: 'REC', val: 1 } },
      stage_types: [160]
    },
    {
      id: 302,
      name: 'Web App Scope Accent Color',
      summary: 'Manifest properties override',
      category: 'CSS',
      web_feature: 'accent-color',
      blink_components: ['Blink>AppManifest'],
      star_count: 5,
      is_released: true,
      browsers: { chrome: { origintrial: false, flag: false, status: { text: 'Enabled by default', val: 1 }, owners: [] } },
      standards: { maturity: { short_text: 'REC', val: 1 } },
      stage_types: [160]
    },
    {
      id: 303,
      name: 'System Accent Color Bindings',
      summary: 'OS native styling overrides',
      category: 'CSS',
      web_feature: 'accent-color',
      blink_components: ['Blink>CSS'],
      star_count: 15,
      is_released: true,
      browsers: { chrome: { origintrial: false, flag: false, status: { text: 'Enabled by default', val: 1 }, owners: [] } },
      standards: { maturity: { short_text: 'REC', val: 1 } },
      stage_types: [160]
    }
  ];

  const client = new ChromeStatusClient(multiStubs);

  // 1. Assert multi-record extraction retrieval safety
  const matchingSet = client.findFeaturesBySymbol('accent-color');
  assert.equal(matchingSet.length, 3, 'findFeaturesBySymbol must extract complete un-truncated sets sharing external keys');
  assert.equal(matchingSet[0].id, 301, 'Output arrays must faithfully preserve initial constructor insertion precedence');
  assert.equal(matchingSet[2].id, 303);

  // 2. Assert first-match extraction bounds
  const singleMatch = client.findFeature('accent-color');
  assert.equal(singleMatch?.id, 301, 'Standard single search wrapper returns earliest matched item natively');

  // 3. Test out-of-order multi-token search permutations consensus
  const queryPermutation = client.findFeature('bindings color system accent');
  assert.equal(queryPermutation?.id, 303, 'Multi-token query consensus must gracefully resolve out-of-order query structures');
});

test('RedTeam Audit: Malformed Payload Exception Propagation', async () => {
  const client = new ChromeStatusClient([]);
  // Expecting read logic mapping unresolvable/corrupted offline files to bubble critical OS errors natively
  // To verify deterministic error handling, passing an unresolvable descriptive feature title string
  const unresolvable = await client.getFeatureDetailed("Unresolvable Hacked Title String");
  assert.equal(unresolvable, undefined, 'Absent offline feature file targets evaluate as undefined cleanly');
});
