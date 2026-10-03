import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { loadUpstreamMappings, buildWebFeatureExtras, parseWebFeatureValue } from '../src/upstream-mappings.ts';
import {
  resolveWebFeatureBaselineYear,
  evaluateActiveOriginTrial,
  evaluateBehindFlag,
  disambiguateFeatureNames,
  assignWebFeaturesAndBaselineYears
} from '../src/compile-helpers.ts';

async function main() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const rawDir = path.join(dataDir, 'raw');
  const featuresDir = path.join(dataDir, 'features');

  await fs.mkdir(featuresDir, { recursive: true });

  console.log("Starting data compilation from raw cache...");

  // 1. Load verbose features
  console.log("Reading cached verbose features...");
  const verboseContent = await fs.readFile(path.join(rawDir, 'features-verbose.json'), 'utf8');
  const verboseData = JSON.parse(verboseContent);
  const totalCount = Number(verboseData?.total_count);
  if (!totalCount || isNaN(totalCount)) {
    throw new Error(`Cache corrupted: total_count evaluates to invalid metrics.`);
  }
  const verboseFeatures: any[] = Array.isArray(verboseData.features) ? verboseData.features : [];

  console.log(`Total features expected from cache: ${totalCount}`);

  // Deduplicate and sort by ID
  const seenIds = new Set<number>();
  const uniqueVerbose: any[] = [];
  const activeOtIds: number[] = [];
  const flagIds: number[] = [];

  // Centralized compile-time overrides are imported from src/overrides.ts

  console.log("Evaluating release thresholds from cached milestones...");
  let activeStableMilestone = 148; // robust static default fallback baseline
  try {
    const scheduleContent = await fs.readFile(path.join(rawDir, 'milestones.json'), 'utf8');
    const scheduleData = JSON.parse(scheduleContent);
    if (Array.isArray(scheduleData)) {
      const stableObj = scheduleData.find((m: any) => m && m.schedule_phase === 'stable');
      if (stableObj && typeof stableObj.milestone === 'number') {
        activeStableMilestone = stableObj.milestone;
      }
    }
  } catch {
    console.log(`Warning: Failed to read cached milestones from data/raw/milestones.json. Utilizing default baseline stable threshold M${activeStableMilestone}.`);
  }
  console.log(`Authoritative current active Stable Release Milestone threshold evaluated as: M${activeStableMilestone}`);

  console.log("Fetching cached Google Chrome Origin Trials API feed metadata to map authoritative live trial configurations...");
  const otApiActiveFeatureIds = new Set<number>();
  const otApiActiveTrialNames = new Set<string>();
  try {
    const otApiContent = await fs.readFile(path.join(rawDir, 'ot-api-trials.json'), 'utf8');
    const otApiData = JSON.parse(otApiContent);
    if (otApiData?.trials && Array.isArray(otApiData.trials)) {
      for (const trial of otApiData.trials) {
        if (trial && trial.status === 'ACTIVE' && trial.isPublic === true && trial.enabled === true) {
          if (typeof trial.originTrialFeatureName === 'string') {
            otApiActiveTrialNames.add(trial.originTrialFeatureName);
          }
          if (typeof trial.chromestatusUrl === 'string') {
            const match = trial.chromestatusUrl.match(/\/feature\/(\d+)/);
            if (match && match[1]) {
              const fid = Number(match[1]);
              if (!isNaN(fid)) {
                otApiActiveFeatureIds.add(fid);
              }
            }
          }
        }
      }
    }
    console.log(`Authoritative Google OT API mapping extracted ${otApiActiveFeatureIds.size} unique feature IDs and ${otApiActiveTrialNames.size} specific trial strings.`);
  } catch {
    console.log("Warning: Failed to read cached ot-api-trials.json. Continuing heuristic evaluation paths.");
  }

  for (const f of verboseFeatures) {
    if (f && Number.isInteger(Number(f.id)) && !seenIds.has(f.id)) {
      seenIds.add(f.id);
      uniqueVerbose.push(f);

      const isGenuinelyActive = evaluateActiveOriginTrial(
        f,
        activeStableMilestone,
        otApiActiveFeatureIds,
        otApiActiveTrialNames,
        resolveWebFeatureBaselineYear
      );

      if (isGenuinelyActive) {
        activeOtIds.push(f.id);
      }

      const isBehindFlag = evaluateBehindFlag(f, resolveWebFeatureBaselineYear);
      if (isBehindFlag) {
        flagIds.push(f.id);
      }
    }
  }
  uniqueVerbose.sort((a, b) => Number(a.id) - Number(b.id));
  activeOtIds.sort((a, b) => a - b);
  flagIds.sort((a, b) => a - b);

  // Systematic Title Disambiguation Phase
  disambiguateFeatureNames(uniqueVerbose);

  // Pre-map web_feature identifiers and resolve baseline years
  const webFeatureMap = assignWebFeaturesAndBaselineYears(uniqueVerbose, resolveWebFeatureBaselineYear);

  // Strict Integrity Pre-checks: guarantee downloaded snapshot states are absolute and whole
  if (totalCount < 3000) {
    throw new Error(`Integrity validation failed: Reported total feature count (${totalCount}) is below acceptable historical baseline limits.`);
  }
  if (uniqueVerbose.length !== totalCount) {
    throw new Error(`Integrity validation failed: Processed granular verbose feature count (${uniqueVerbose.length}) does not perfectly equal reported catalog total (${totalCount}). Snapshot mapping is partial or corrupted.`);
  }

  console.log(`Writing ${uniqueVerbose.length} granular verbose JSON files using persistent numeric database primary keys concurrently...`);
  await fs.rm(featuresDir, { recursive: true, force: true });
  await fs.mkdir(featuresDir, { recursive: true });

  const batchSize = 100;
  for (let i = 0; i < uniqueVerbose.length; i += batchSize) {
    const batch = uniqueVerbose.slice(i, i + batchSize);
    await Promise.all(batch.map(f =>
      fs.writeFile(path.join(featuresDir, `${f.id}.json`), JSON.stringify(f, null, 2))
    ));
  }

  console.log(`Writing ${activeOtIds.length} Active Origin Trial index IDs to data/active-ot-index.json...`);
  await fs.writeFile(
    path.join(dataDir, 'active-ot-index.json'),
    JSON.stringify(activeOtIds)
  );

  console.log(`Writing ${flagIds.length} flag index IDs to data/flag-index.json...`);
  await fs.writeFile(
    path.join(dataDir, 'flag-index.json'),
    JSON.stringify(flagIds)
  );

  // Generate active OT mapping JSON
  console.log("Generating active OT mapping JSON...");
  const otMapping: Record<string, any> = {
    unmapped: []
  };

  for (const id of activeOtIds) {
    const f = uniqueVerbose.find(item => item.id === id);
    if (!f) continue;

    const rawId = f.web_feature;
    const webFeatureIds = rawId && rawId !== 'Missing feature' && rawId.toLowerCase() !== 'none'
      ? rawId.toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (webFeatureIds.length > 0) {
      for (const webFeatureId of webFeatureIds) {
        otMapping[webFeatureId] = {
          chromestatus_url: `https://chromestatus.com/feature/${f.id}`
        };
      }
    } else {
      otMapping.unmapped.push({
        name: f.name,
        chromestatus_url: `https://chromestatus.com/feature/${f.id}`
      });
    }
  }

  // Sort web feature ID keys and build sorted mapped object
  const mappedKeys = Object.keys(otMapping).filter(k => k !== 'unmapped').sort();
  const sortedOtMapping: Record<string, any> = {};
  for (const key of mappedKeys) {
    sortedOtMapping[key] = otMapping[key];
  }
  // Sort unmapped array by name
  otMapping.unmapped.sort((a: any, b: any) => a.name.localeCompare(b.name));
  sortedOtMapping.unmapped = otMapping.unmapped;

  console.log(`Writing active Origin Trial mapping to data/ot-mapping.json...`);
  await fs.writeFile(
    path.join(dataDir, 'ot-mapping.json'),
    JSON.stringify(sortedOtMapping, null, 2)
  );

  console.log("Compiling web-features-mappings extras for referenced web-features IDs...");
  const referencedIds = [...webFeatureMap.values()].flatMap(v => parseWebFeatureValue(v));
  const extras = buildWebFeatureExtras(referencedIds, await loadUpstreamMappings());
  console.log(`Writing extras for ${Object.keys(extras).length} web-features IDs to data/web-feature-extras.json...`);
  await fs.writeFile(
    path.join(dataDir, 'web-feature-extras.json'),
    JSON.stringify(extras, null, 2)
  );

  console.log("\nProcessing basic feature array data from cache...");
  const basicContent = await fs.readFile(path.join(rawDir, 'features-lite.json'), 'utf8');
  const basicData = JSON.parse(basicContent);
  const basicFeatures: any[] = Array.isArray(basicData) ? basicData : basicData.features || [];

  const cleanBasic = basicFeatures.filter(f => f && Number.isInteger(Number(f.id)));
  cleanBasic.sort((a, b) => Number(a.id) - Number(b.id));

  for (const f of cleanBasic) {
    if (webFeatureMap.has(f.id)) {
      const webFeatureStr = webFeatureMap.get(f.id);
      f.web_feature = webFeatureStr;
      if (webFeatureStr) {
        const webFeatureIds = webFeatureStr.split(',').map((s: string) => s.trim()).filter(Boolean);
        let maxYear: number | undefined = undefined;
        for (const id of webFeatureIds) {
          const year = resolveWebFeatureBaselineYear(id);
          if (year !== undefined) {
            if (maxYear === undefined || year > maxYear) {
              maxYear = year;
            }
          }
        }
        if (maxYear !== undefined) {
          f.baseline_year = maxYear;
        }
      }
    } else {
      // Strip pre-existing unmapped/stale keys to enforce consistency
      delete f.web_feature;
      delete f.baseline_year;
    }
  }

  if (cleanBasic.length !== totalCount) {
    throw new Error(`Integrity validation failed: Processed basic feature flat record array count (${cleanBasic.length}) does not perfectly equal reported catalog total (${totalCount}). Base list output is partial or corrupted.`);
  }

  console.log(`Writing ${cleanBasic.length} basic feature records to data/basic.json...`);
  await fs.writeFile(
    path.join(dataDir, 'basic.json'),
    JSON.stringify(cleanBasic, null, 2)
  );

  console.log("\nData compilation complete.");
}

main().catch(err => {
  console.error("Fatal error compiling data:", err);
  process.exit(1);
});
