import fs from 'node:fs/promises';
import path from 'node:path';
import { loadUpstreamMappings, buildWebFeatureExtras } from '../src/upstream-mappings.ts';
import {
  resolveWebFeatureIds,
  resolveBaselineYear,
  resolveGatedBy,
  disambiguateFeatureNames,
  type GatingInput,
  type OriginTrialContext,
} from '../src/compile-helpers.ts';
import type { CompiledFeatureFields } from '../src/types.ts';

type RawFeature = GatingInput & { name: string; web_feature?: string | null };

const dataDir = path.resolve(process.cwd(), 'data');
const rawDir = path.join(dataDir, 'raw');
const featuresDir = path.join(dataDir, 'features');

async function readRawJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path.join(rawDir, file), 'utf8'));
}

function isRawFeature(x: unknown): x is RawFeature {
  return typeof x === 'object' && x !== null && 'id' in x && Number.isInteger(x.id) && 'name' in x && typeof x.name === 'string';
}

async function loadVerboseFeatures(): Promise<RawFeature[]> {
  const data = await readRawJson('features-verbose.json');
  if (typeof data !== 'object' || data === null || !('features' in data) || !Array.isArray(data.features) || !('total_count' in data)) {
    throw new Error('data/raw/features-verbose.json is malformed. Run `pnpm run download`.');
  }
  const totalCount = Number(data.total_count);
  if (!(totalCount >= 3000)) throw new Error(`Integrity check failed: total_count (${data.total_count}) is below 3000.`);

  const byId = new Map<number, RawFeature>();
  for (const f of data.features) {
    if (!isRawFeature(f)) throw new Error(`Malformed verbose feature: ${JSON.stringify(f).slice(0, 200)}`);
    if (!byId.has(f.id)) byId.set(f.id, f);
  }
  const features = [...byId.values()].sort((a, b) => a.id - b.id);
  if (features.length !== totalCount) {
    throw new Error(`Integrity check failed: ${features.length} unique verbose features but total_count is ${totalCount}.`);
  }
  return features;
}

async function loadOriginTrialContext(): Promise<OriginTrialContext> {
  const schedule = await readRawJson('milestones.json');
  const stable = Array.isArray(schedule) ? schedule.find(m => m?.schedule_phase === 'stable') : undefined;
  if (typeof stable?.milestone !== 'number') throw new Error('data/raw/milestones.json has no stable milestone. Run `pnpm run download`.');

  const feed = await readRawJson('ot-api-trials.json');
  if (typeof feed !== 'object' || feed === null || !('trials' in feed) || !Array.isArray(feed.trials)) {
    throw new Error('data/raw/ot-api-trials.json is malformed. Run `pnpm run download`.');
  }
  const otApiActiveFeatureIds = new Set<number>();
  const otApiActiveTrialNames = new Set<string>();
  for (const trial of feed.trials) {
    if (trial?.status !== 'ACTIVE' || trial.isPublic !== true || trial.enabled !== true) continue;
    if (typeof trial.originTrialFeatureName === 'string') otApiActiveTrialNames.add(trial.originTrialFeatureName);
    const match = typeof trial.chromestatusUrl === 'string' ? trial.chromestatusUrl.match(/\/feature\/(\d+)/) : null;
    if (match) otApiActiveFeatureIds.add(Number(match[1]));
  }
  console.log(`Stable milestone M${stable.milestone}; Origin Trials API lists ${otApiActiveFeatureIds.size} features and ${otApiActiveTrialNames.size} trial names as active.`);
  return { activeStableMilestone: stable.milestone, otApiActiveFeatureIds, otApiActiveTrialNames };
}

function compileFields(f: RawFeature, ctx: OriginTrialContext): CompiledFeatureFields {
  const web_feature_ids = resolveWebFeatureIds(f);
  const baseline_year = resolveBaselineYear(web_feature_ids);
  const gated_by = resolveGatedBy(f, ctx, baseline_year);
  return baseline_year === undefined ? { web_feature_ids, gated_by } : { web_feature_ids, baseline_year, gated_by };
}

async function main() {
  const verbose = await loadVerboseFeatures();
  disambiguateFeatureNames(verbose);
  const ctx = await loadOriginTrialContext();

  const compiled = new Map(verbose.map(f => [f.id, { name: f.name, ...compileFields(f, ctx) }]));

  console.log(`Writing ${verbose.length} verbose feature files to data/features/...`);
  await fs.rm(featuresDir, { recursive: true, force: true });
  await fs.mkdir(featuresDir, { recursive: true });
  const batchSize = 100;
  for (let i = 0; i < verbose.length; i += batchSize) {
    await Promise.all(verbose.slice(i, i + batchSize).map(f =>
      fs.writeFile(path.join(featuresDir, `${f.id}.json`), JSON.stringify({ ...f, ...compiled.get(f.id) }, null, 2))
    ));
  }

  const rawBasic = await readRawJson('features-basic.json');
  if (!Array.isArray(rawBasic)) throw new Error('data/raw/features-basic.json is not an array. Run `pnpm run download`.');
  const basic = rawBasic.map(f => {
    const fields = isRawFeature(f) ? compiled.get(f.id) : undefined;
    if (!fields) throw new Error(`Basic feature has no verbose counterpart: ${JSON.stringify(f).slice(0, 200)}`);
    return { ...f, ...fields };
  }).sort((a, b) => a.id - b.id);
  if (basic.length !== verbose.length) {
    throw new Error(`Integrity check failed: ${basic.length} basic features but ${verbose.length} verbose features.`);
  }
  console.log(`Writing ${basic.length} basic features to data/basic.json...`);
  await fs.writeFile(path.join(dataDir, 'basic.json'), JSON.stringify(basic, null, 2));

  const referencedIds = [...compiled.values()].flatMap(c => c.web_feature_ids);
  const extras = buildWebFeatureExtras(referencedIds, await loadUpstreamMappings());
  console.log(`Writing extras for ${Object.keys(extras).length} web feature IDs to data/web-feature-extras.json...`);
  await fs.writeFile(path.join(dataDir, 'web-feature-extras.json'), JSON.stringify(extras, null, 2));
}

main().catch(err => {
  console.error('Fatal error compiling data:', err);
  process.exit(1);
});
