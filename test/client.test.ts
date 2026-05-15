import test from 'node:test';
import assert from 'node:assert/strict';
import { ChromeStatusClient } from '../src/index.ts';
import type { ChromeStatusFeatureStub } from '../src/types.ts';

test('ChromeStatusClient - Synchronous querying and Origin Trial indexing validation', async () => {
  const mockStubs: ChromeStatusFeatureStub[] = [
    {
      id: 5172548013916160,
      name: 'HTML-in-canvas',
      summary: 'Customizing canvas element rendering',
      category: 'Graphics',
      web_feature: 'canvas',
      blink_components: ['Blink>Canvas'],
      star_count: 74,
      is_released: false,
      browsers: {
        chrome: {
          origintrial: true,
          flag: false,
          status: { text: 'In development', val: 3 },
          owners: ['pdr@chromium.org']
        }
      },
      standards: { maturity: { short_text: 'WD', val: 2 } },
      stage_types: [110, 150]
    },
    {
      id: 5117755740913664,
      name: 'WebMCP',
      summary: 'Imperative agentic registration abstractions',
      category: 'Misc',
      web_feature: 'Missing feature',
      blink_components: ['Blink>DOM'],
      star_count: 12,
      is_released: false,
      browsers: {
        chrome: {
          origintrial: false,
          flag: false,
          status: { text: 'In development', val: 3 },
          owners: ['dturner@chromium.org']
        }
      },
      standards: { maturity: { short_text: 'WD', val: 2 } },
      stage_types: [110]
    }
  ];

  const client = new ChromeStatusClient(mockStubs, [5172548013916160, 5117755740913664], [5117755740913664]);

  // 1. Find HTML-in-canvas via exact/embedded symbol or fuzzy heuristics
  const canvasFeature = client.findFeature('canvas-html');
  assert.notEqual(canvasFeature, undefined, 'Must resolve target HTML-in-canvas feature record');
  assert.equal(canvasFeature?.name, 'HTML-in-canvas');
  
  assert.equal(client.isFeatureInOriginTrial(canvasFeature!.id), true);

  // 2. Find WebMCP using descriptive name containment forwarders
  const webmcpFeature = client.findFeature('webmcp');
  assert.notEqual(webmcpFeature, undefined, 'Must locate target WebMCP feature instance');
  assert.equal(webmcpFeature?.name, 'WebMCP');

  assert.equal(client.isFeatureInOriginTrial(webmcpFeature!.id), true);
  assert.equal(client.isFeatureBehindExperimentalFlag(webmcpFeature!.id), true);

  // 3. Verify top-level active Origin Trial web_feature IDs extraction helper
  const activeIds = client.getActiveOriginTrialWebFeatureIds();
  assert.equal(activeIds.includes('canvas'), true, 'Active OT web_feature list must include canvas');

  // 4. Verify complete un-truncated active feature objects accounting retrieval
  const activeStubs = client.getActiveOriginTrials();
  assert.equal(activeStubs.length, 2, 'getActiveOriginTrials must faithfully return all active feature objects natively');
  assert.equal(activeStubs[0].name, 'HTML-in-canvas', 'Output collection entry matches authoritative descriptive feature name string');

  // 5. Verify Experimental Flag gating SDK retrieval interfaces
  const flagSymbols = client.getExperimentalFlagWebFeatureIds();
  const flagStubs = client.getExperimentalFlagFeatures();
  assert.equal(flagStubs.length, 1, 'getExperimentalFlagFeatures returns full un-truncated flag objects set natively');
  assert.equal(flagStubs[0].name, 'WebMCP');
});

test('ChromeStatusClient - Static factory initializer loads snapshot archives dynamically', async () => {
  const client = await ChromeStatusClient.create();
  
  if (client.features.length > 0) {
    assert.equal(client.features.length > 3000, true, 'Compiled catalog array size must exceed baseline bounds');
    
    const verbose = await client.getFeatureDetailed(client.features[0].name);
    assert.notEqual(verbose, undefined, 'Must resolve granular verbose chunk over local storage paths');
  }
});

test('Origin Trial Expiration Filtering - Purges completed historical legacy experiments from active maps', async () => {
  const client = await ChromeStatusClient.create();
  if (client.features.length === 0) return;

  // Locate AudioWorklet feature cleanly via descriptive string lookup
  const audioWorklet = client.findFeature('audioworklet');
  assert.notEqual(audioWorklet, undefined, 'Must resolve target AudioWorklet feature stub');
  
  // Upstream trial stage ended in Chrome 65. Must evaluate as completed/inactive.
  assert.equal(
    client.isFeatureInOriginTrial(audioWorklet!.id), 
    false, 
    'AudioWorklet completed its Origin Trial in milestone 65. Must evaluate as inactive.'
  );

  // Locate Interest Invokers feature cleanly via descriptive string lookup
  const interestInvokers = client.findFeature('interest invokers');
  assert.notEqual(interestInvokers, undefined, 'Must resolve target Interest Invokers feature stub');

  // Upstream trial stage ended in Chrome 137. Must evaluate as completed/inactive.
  assert.equal(
    client.isFeatureInOriginTrial(interestInvokers!.id), 
    false, 
    'Interest Invokers completed its Origin Trial in milestone 137. Must evaluate as inactive.'
  );
});

test('ChromeStatusClient - Static Compilation Overrides Map Integration', async () => {
  const client = await ChromeStatusClient.create();
  if (client.features.length === 0) return;

  // Find HTML-in-canvas feature explicitly via its corrected override symbol "canvas-html"
  const feature = client.findFeature('canvas-html');
  assert.notEqual(feature, undefined, 'Must resolve target HTML-in-canvas feature record via corrected override symbol');
  assert.equal(feature?.web_feature, 'canvas-html', 'Output web_feature key must map strictly to override symbol canvas-html');

  // Ensure active Origin Trial extraction helper reflects the overridden key instead of legacy symbol
  const activeSymbols = client.getActiveOriginTrialWebFeatureIds();
  if (client.isFeatureInOriginTrial(feature!.id)) {
    assert.equal(activeSymbols.includes('canvas-html'), true, 'Active OT symbols list must contain corrected key canvas-html');
    assert.equal(activeSymbols.includes('canvas'), false, 'Active OT symbols list must omit legacy un-overridden symbol canvas');
  }

  // Find WebMCP feature explicitly via its corrected override capability symbol "navigator-modelcontext"
  const webmcpOverride = client.findFeature('navigator-modelcontext');
  assert.notEqual(webmcpOverride, undefined, 'Must resolve proposed WebMCP feature record via corrected override capability symbol');
  assert.equal(webmcpOverride?.web_feature, 'declarative-webmcp,navigator-modelcontext');

  // Also find it via the new "declarative-webmcp" symbol
  const webmcpOverride2 = client.findFeature('declarative-webmcp');
  assert.notEqual(webmcpOverride2, undefined, 'Must resolve proposed WebMCP feature record via new declarative-webmcp symbol');
  assert.equal(webmcpOverride2?.id, webmcpOverride?.id);
});
