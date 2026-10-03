import test from 'node:test';
import assert from 'node:assert/strict';
import { features as webFeatures } from 'web-features';
import { ChromeStatusClient } from '../src/index.ts';

test('compiled web feature IDs resolve to current web-features features', async () => {
  const client = await ChromeStatusClient.create();
  const mapped = client.features.filter(f => f.web_feature_ids.length);
  const isCurrent = (id: string) => Object.hasOwn(webFeatures, id) && webFeatures[id].kind === 'feature';
  const invalid = mapped.filter(f => !f.web_feature_ids.every(isCurrent));

  // Remaining invalid values are ChromeStatus data errors, listed by `pnpm run audit:chromestatus-edits`.
  const validShare = 1 - invalid.length / mapped.length;
  assert.ok(validShare >= 0.99, `${invalid.length} of ${mapped.length} mapped features have invalid IDs: ${invalid.slice(0, 5).map(f => f.name).join('; ')}`);
});
