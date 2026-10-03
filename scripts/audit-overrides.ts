import fs from 'node:fs/promises';
import { features as webFeatures } from 'web-features';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { loadUpstreamMappings } from '../src/upstream-mappings.ts';
import { auditOverrides, type RawFeatureLike, type WebFeaturesCatalog } from '../src/mapping-audit.ts';

export async function loadRawFeatures(): Promise<RawFeatureLike[]> {
  const url = new URL('../data/raw/features-verbose.json', import.meta.url);
  const parsed = JSON.parse(await fs.readFile(url, 'utf8'));
  if (!Array.isArray(parsed?.features)) {
    throw new Error('data/raw/features-verbose.json is malformed. Run `pnpm run download`.');
  }
  return parsed.features;
}

async function main() {
  const [features, upstream] = await Promise.all([loadRawFeatures(), loadUpstreamMappings()]);
  const audit = auditOverrides(CUSTOM_WEB_FEATURE_OVERRIDES, features, upstream, webFeatures as WebFeaturesCatalog);

  for (const o of audit) {
    console.log(`[${o.status.toUpperCase()}] ${o.featureName}`);
    console.log(`  override:      ${o.overrideIds.join(',')}`);
    console.log(`  chromestatus:  ${o.chromeStatusIds.join(',') || '(none)'}`);
    console.log(`  upstream:      ${o.upstreamIds.join(',') || '(none)'}`);
    if (o.chromestatusUrl) console.log(`  ${o.chromestatusUrl}`);
    for (const n of o.notes) console.log(`  note: ${n}`);
  }

  const counts = Object.groupBy(audit, o => o.status);
  console.log('\nSummary:', Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v?.length ?? 0])));
  if (audit.some(o => o.status === 'redundant' || o.status === 'broken' || o.status === 'orphaned')) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch(err => { console.error(err); process.exit(1); });
}
