import test from 'node:test';
import assert from 'node:assert/strict';
import { ChromeStatusClient } from '../src/index.ts';
import type { ChromeStatusFeatureBasic } from '../src/types.ts';

test('ChromeStatusClient - Synchronous querying and Origin Trial indexing validation', async () => {
  const mockFeatures: ChromeStatusFeatureBasic[] = [
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

  const client = new ChromeStatusClient(mockFeatures, [5172548013916160, 5117755740913664], [5117755740913664]);

  // 1. Find HTML-in-canvas via exact/embedded web feature ID or fuzzy heuristics
  const canvasFeature = client.findFeature('canvas-html');
  assert.notEqual(canvasFeature, undefined, 'Must resolve target HTML-in-canvas feature record');
  assert.equal(canvasFeature?.name, 'HTML-in-canvas');
  
  assert.equal(client.isFeatureInActiveOriginTrial(canvasFeature!.id), true);

  // 2. Find WebMCP using descriptive name containment forwarders
  const webmcpFeature = client.findFeature('webmcp');
  assert.notEqual(webmcpFeature, undefined, 'Must locate target WebMCP feature instance');
  assert.equal(webmcpFeature?.name, 'WebMCP');

  assert.equal(client.isFeatureInActiveOriginTrial(webmcpFeature!.id), true);
  assert.equal(client.isFeatureBehindFlag(webmcpFeature!.id), true);

  // 3. Verify top-level active Origin Trial web_feature IDs extraction helper
  const activeIds = client.getActiveOriginTrialWebFeatureIds();
  assert.equal(activeIds.includes('canvas-html'), true, 'Active OT web_feature list must include canvas-html');

  // 4. Verify complete un-truncated active feature objects accounting retrieval
  const activeFeatures = client.getActiveOriginTrials();
  assert.equal(activeFeatures.length, 2, 'getActiveOriginTrials must faithfully return all active feature objects natively');
  assert.equal(activeFeatures[0].name, 'HTML-in-canvas', 'Output collection entry matches authoritative descriptive feature name string');

  // 5. Verify Flag gating SDK retrieval interfaces
  const flagWebFeatureIds = client.getFlagWebFeatureIds();
  const flagFeatures = client.getFlagFeatures();
  assert.equal(flagFeatures.length, 1, 'getFlagFeatures returns full un-truncated flag objects set natively');
  assert.equal(flagFeatures[0].name, 'WebMCP');

  // 6. Verify Gated Features Inventory
  const inventory = client.getGatedFeaturesInventory();
  assert.equal(inventory.length, 2);
  const canvasGated = inventory.find(i => i.name === 'HTML-in-canvas');
  assert.deepEqual(canvasGated?.gatedBy, ['Origin Trial']);
  const webmcpGated = inventory.find(i => i.name === 'WebMCP');
  assert.deepEqual(webmcpGated?.gatedBy, ['Origin Trial', 'Flag']);
});

test('ChromeStatusClient - Static factory initializer loads snapshot archives dynamically', async () => {
  const client = await ChromeStatusClient.create();
  
  if (client.features.length > 0) {
    assert.equal(client.features.length > 3000, true, 'Compiled catalog array size must exceed baseline bounds');
    
    const verbose = await client.getFeatureVerbose(client.features[0].name);
    assert.notEqual(verbose, undefined, 'Must resolve granular verbose feature over local storage paths');
  }
});

test('Origin Trial Expiration Filtering - Purges completed historical legacy experiments from active maps', async () => {
  const client = await ChromeStatusClient.create();
  if (client.features.length === 0) return;

  // Locate AudioWorklet feature cleanly via descriptive string lookup
  const audioWorklet = client.findFeature('audioworklet');
  assert.notEqual(audioWorklet, undefined, 'Must resolve target AudioWorklet basic feature');
  
  // Upstream trial stage ended in Chrome 65. Must evaluate as completed/inactive.
  assert.equal(
    client.isFeatureInActiveOriginTrial(audioWorklet!.id), 
    false, 
    'AudioWorklet completed its Origin Trial in milestone 65. Must evaluate as inactive.'
  );

  // Locate Interest Invokers feature cleanly via descriptive string lookup
  const interestInvokers = client.findFeature('interest invokers');
  assert.notEqual(interestInvokers, undefined, 'Must resolve target Interest Invokers basic feature');

  // Upstream trial stage ended in Chrome 137. Must evaluate as completed/inactive.
  assert.equal(
    client.isFeatureInActiveOriginTrial(interestInvokers!.id), 
    false, 
    'Interest Invokers completed its Origin Trial in milestone 137. Must evaluate as inactive.'
  );
});

test('ChromeStatusClient - Static Compilation Overrides Map Integration', async () => {
  const client = await ChromeStatusClient.create();
  if (client.features.length === 0) return;

  // Find HTML-in-canvas feature explicitly via its corrected override web feature ID "canvas-html"
  const feature = client.findFeature('canvas-html');
  assert.notEqual(feature, undefined, 'Must resolve target HTML-in-canvas feature record via corrected override web feature ID');
  assert.equal(feature?.web_feature, 'canvas-html', 'Output web_feature key must map strictly to override web feature ID canvas-html');

  // Ensure active Origin Trial extraction helper reflects the overridden key instead of legacy web feature ID
  const activeWebFeatureIds = client.getActiveOriginTrialWebFeatureIds();
  if (client.isFeatureInActiveOriginTrial(feature!.id)) {
    assert.equal(activeWebFeatureIds.includes('canvas-html'), true, 'Active OT web feature IDs list must contain corrected key canvas-html');
    assert.equal(activeWebFeatureIds.includes('canvas'), false, 'Active OT web feature IDs list must omit legacy un-overridden web feature ID canvas');
  }

  // Find WebMCP feature explicitly via its corrected override capability web feature ID "document-modelcontext"
  const webmcpOverride = client.findFeature('document-modelcontext');
  assert.notEqual(webmcpOverride, undefined, 'Must resolve proposed WebMCP feature record via corrected override capability web feature ID');
  assert.equal(webmcpOverride?.web_feature, 'declarative-webmcp,document-modelcontext');

  // Also find it via the new "declarative-webmcp" web feature ID
  const webmcpOverride2 = client.findFeature('declarative-webmcp');
  assert.notEqual(webmcpOverride2, undefined, 'Must resolve proposed WebMCP feature record via new declarative-webmcp web feature ID');
  assert.equal(webmcpOverride2?.id, webmcpOverride?.id);
});

test('ChromeStatusClient - web-features-mappings extras', async () => {
  const client = await ChromeStatusClient.create();
  if (client.features.length === 0) return;

  const vt = client.getWebFeatureExtras('view-transitions');
  assert.ok(vt, 'view-transitions must have compiled extras');
  assert.equal(typeof vt.useCounter?.percentageOfPageLoad, 'number');
  assert.match(vt.useCounter?.url ?? '', /^https:\/\/chromestatus\.com\/metrics\//);
  assert.match(vt.wpt?.url ?? '', /^https:\/\/wpt\.fyi\//);
  assert.equal(client.getWebFeatureExtras('non-existent-fantasy-feature-id'), undefined);

  const byFeature = client.getFeatureExtras('view-transitions');
  assert.deepEqual(byFeature['view-transitions'], vt);
});
