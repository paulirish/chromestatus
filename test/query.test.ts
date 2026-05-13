import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '../src/index.ts';
import type { ChromeStatusFeatureStub } from '../src/types.ts';

test('WebFeature Symbol Querying - Resolves specific requested feature states cleanly', async () => {
  // Define fallback test stubs mapping precisely to target query states
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

  let activeOtIds = [5172548013916160];
  try {
    const otPath = path.resolve(process.cwd(), 'data', 'active-ot-index.json');
    activeOtIds = JSON.parse(await fs.readFile(otPath, 'utf8'));
  } catch {}

  const client = await createClient({
    stubDataSource: async () => {
      try {
        const litePath = path.resolve(process.cwd(), 'data', 'lite.json');
        const text = await fs.readFile(litePath, 'utf8');
        return JSON.parse(text);
      } catch {
        return mockStubs;
      }
    },
    verboseDataProvider: async () => {
      throw new Error('Unrequested detailed mapping block');
    },
    activeOriginTrialIds: activeOtIds
  });

  // 1. Query for HTML-in-canvas using exact or embedded fuzzy strings
  const canvasResults = client.query('canvas-html');
  assert.equal(Array.isArray(canvasResults), true, 'Query interface must emit absolute stub array structures');
  
  const canvasFeature = canvasResults.find(f => f.id === 5172548013916160 || f.name.includes('HTML-in-canvas'));
  assert.notEqual(canvasFeature, undefined, 'Array output must successfully contain HTML-in-canvas entity record');
  
  // Verify Origin Trial assignment state directly using collection builder index checks
  const activeTrials = client.features.where({ isOriginTrial: true }).toArray();
  const isCanvasOt = activeTrials.some(f => f.id === canvasFeature?.id);
  assert.equal(isCanvasOt, true, 'HTML-in-canvas must be evaluated as actively assigned to an Origin Trial');

  // 2. Query for WebMCP using fuzzy string resolution forwarders
  const webmcpResults = client.query('declarative-webmcp');
  const webmcpFeature = webmcpResults.find(f => f.id === 5117755740913664 || f.name.toLowerCase().includes('webmcp'));
  assert.notEqual(webmcpFeature, undefined, 'Array output must successfully contain target WebMCP entity record');

  // Verify Origin Trial assignment state directly
  const isWebmcpOt = activeTrials.some(f => f.id === webmcpFeature?.id);
  assert.equal(isWebmcpOt, true, 'WebMCP configures an active Origin Trial stage parameter natively');

  // 3. Verify top-level active Origin Trial web_feature IDs extraction helper
  const activeIds = client.getActiveOriginTrialWebFeatureIds();
  assert.equal(activeIds.includes('canvas'), true, 'Authoritative list of active OT web_feature symbols must include canvas');
});
