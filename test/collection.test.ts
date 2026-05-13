import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../src/index.ts';
import type { ChromeStatusFeatureStub, ChromeStatusFeatureDetailed } from '../src/types.ts';

test('ChromeStatusClient - Synchronous indexing and Set filtering', async () => {
  const stubs: ChromeStatusFeatureStub[] = [
    {
      id: 1,
      name: 'Canvas Feature',
      summary: 'Draw element rendering',
      category: 'Graphics',
      blink_components: ['Blink>Canvas'],
      star_count: 10,
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
      id: 2,
      name: 'WebGPU Subgroup',
      summary: 'Parallel compute primitives',
      category: 'Graphics',
      blink_components: ['Blink>WebGPU'],
      star_count: 20,
      is_released: true,
      browsers: {
        chrome: {
          origintrial: false,
          flag: false,
          status: { text: 'Enabled by default', val: 1 },
          owners: ['cwallez@chromium.org']
        }
      },
      standards: { maturity: { short_text: 'CR', val: 3 } },
      stage_types: [160]
    },
    {
      id: 3,
      name: 'View Transitions',
      summary: 'SPA animated layouts',
      category: 'CSS',
      blink_components: ['Blink>CSS'],
      star_count: 50,
      is_released: true,
      browsers: {
        chrome: {
          origintrial: false,
          flag: false,
          status: { text: 'Enabled by default', val: 1 },
          owners: ['khush@chromium.org']
        }
      },
      standards: { maturity: { short_text: 'CR', val: 3 } },
      stage_types: [160]
    }
  ];

  const mockVerboseData: ChromeStatusFeatureDetailed = {
    ...stubs[0],
    stages: [],
    markdown_fields: [],
    created: { by: 'user', when: '2024' },
    updated: { by: 'user', when: '2025' },
    browsers: {
      chrome: { ...stubs[0].browsers.chrome, announced: true, devrel: [], blink_components: ['Blink>Canvas'], bug: null, prefixed: null },
      ff: { view: { text: 'No signal', val: 5, url: null, notes: null } },
      safari: { view: { text: 'No signal', val: 5, url: null, notes: null } },
      webdev: { view: { text: 'Positive', val: 2, url: null, notes: null } },
      other: { view: { text: null, val: null, url: null, notes: null } }
    },
    standards: { spec: null, maturity: { short_text: 'WD', text: null, val: 2 } },
    feature_notes: null,
    web_feature: 'canvas',
    is_official_web_feature: true,
    enterprise_impact: 1,
    breaking_change: false,
    confidential: false,
    shipping_year: 2026,
    resources: { samples: [], docs: [] }
  };

  const client = await createClient({
    stubDataSource: async () => stubs,
    verboseDataProvider: async (id) => {
      if (id === 1) return mockVerboseData;
      throw new Error(`Not found: ${id}`);
    }
  });

  // 1. Verify direct retrieval
  assert.equal(client.features.size, 3);
  assert.equal(client.features.get(1)?.name, 'Canvas Feature');

  // 2. Verify intersection filtering via builder chain
  const graphicsOt = client.features.where({ isOriginTrial: true, category: 'Graphics' }).toArray();
  assert.equal(graphicsOt.length, 1);
  assert.equal(graphicsOt[0].id, 1);

  // 3. Verify custom predicates mapping
  const highStars = client.features.where(f => f.star_count > 15).toArray();
  assert.equal(highStars.length, 2);

  // 4. Verify native Object.groupBy outcome
  const grouped = client.groupBy(f => f.category);
  assert.equal(grouped['Graphics']?.length, 2);
  assert.equal(grouped['CSS']?.length, 1);

  // 5. Verify lazy detailed data evaluation hydration
  const detailed = await client.features.getDetailed(1);
  assert.equal(detailed?.web_feature, 'canvas');
  assert.equal(detailed?.browsers.webdev.view.text, 'Positive');
});
