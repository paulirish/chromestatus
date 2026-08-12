import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
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
  const option1Features: any[] = Array.isArray(verboseData.features) ? verboseData.features : [];

  console.log(`Total features expected from cache: ${totalCount}`);

  // Deduplicate and sort by ID
  const seenIds = new Set<number>();
  const uniqueOption1: any[] = [];
  const activeOtIds: number[] = [];
  const experimentalFlagIds: number[] = [];

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

  for (const f of option1Features) {
    if (f && Number.isInteger(Number(f.id)) && !seenIds.has(f.id)) {
      seenIds.add(f.id);
      uniqueOption1.push(f);

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
        experimentalFlagIds.push(f.id);
      }
    }
  }
  uniqueOption1.sort((a, b) => Number(a.id) - Number(b.id));
  activeOtIds.sort((a, b) => a - b);
  experimentalFlagIds.sort((a, b) => a - b);

  // Systematic Title Disambiguation Phase
  disambiguateFeatureNames(uniqueOption1);

  // Pre-map web_feature identifiers and resolve baseline years
  const webFeatureMap = assignWebFeaturesAndBaselineYears(uniqueOption1, resolveWebFeatureBaselineYear);

  // Strict Integrity Pre-checks: guarantee downloaded snapshot states are absolute and whole
  if (totalCount < 3000) {
    throw new Error(`Integrity validation failed: Reported total feature count (${totalCount}) is below acceptable historical baseline limits.`);
  }
  if (uniqueOption1.length !== totalCount) {
    throw new Error(`Integrity validation failed: Processed granular verbose feature count (${uniqueOption1.length}) does not perfectly equal reported catalog total (${totalCount}). Snapshot mapping is partial or corrupted.`);
  }

  console.log(`Writing ${uniqueOption1.length} granular verbose JSON chunks using persistent numeric database primary keys concurrently...`);
  await fs.rm(featuresDir, { recursive: true, force: true });
  await fs.mkdir(featuresDir, { recursive: true });

  const batchSize = 100;
  for (let i = 0; i < uniqueOption1.length; i += batchSize) {
    const batch = uniqueOption1.slice(i, i + batchSize);
    await Promise.all(batch.map(f => 
      fs.writeFile(path.join(featuresDir, `${f.id}.json`), JSON.stringify(f, null, 2))
    ));
  }

  console.log(`Writing ${activeOtIds.length} Active Origin Trial index IDs to data/active-ot-index.json...`);
  await fs.writeFile(
    path.join(dataDir, 'active-ot-index.json'),
    JSON.stringify(activeOtIds)
  );

  console.log(`Writing ${experimentalFlagIds.length} Experimental Flag index IDs to data/experimental-flag-index.json...`);
  await fs.writeFile(
    path.join(dataDir, 'experimental-flag-index.json'),
    JSON.stringify(experimentalFlagIds)
  );

  // Generate OT Symbol Mapping JSON
  console.log("Generating OT symbol mapping JSON...");
  const otMapping: Record<string, any> = {
    unmapped: []
  };

  for (const id of activeOtIds) {
    const f = uniqueOption1.find(item => item.id === id);
    if (!f) continue;

    const rawSym = f.web_feature;
    const symbols = rawSym && rawSym !== 'Missing feature' && rawSym.toLowerCase() !== 'none'
      ? rawSym.toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    if (symbols.length > 0) {
      for (const symbol of symbols) {
        otMapping[symbol] = {
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

  // Sort WebDX keys and build sorted mapped object
  const mappedKeys = Object.keys(otMapping).filter(k => k !== 'unmapped').sort();
  const sortedOtMapping: Record<string, any> = {};
  for (const key of mappedKeys) {
    sortedOtMapping[key] = otMapping[key];
  }
  // Sort unmapped array by name
  otMapping.unmapped.sort((a: any, b: any) => a.name.localeCompare(b.name));
  sortedOtMapping.unmapped = otMapping.unmapped;

  console.log(`Writing active Origin Trial symbol mapping to data/ot-mapping.json...`);
  await fs.writeFile(
    path.join(dataDir, 'ot-mapping.json'),
    JSON.stringify(sortedOtMapping, null, 2)
  );

  console.log("\nProcessing Lite array data from cache...");
  const option2Content = await fs.readFile(path.join(rawDir, 'features-lite.json'), 'utf8');
  const option2Data = JSON.parse(option2Content);
  const option2Features: any[] = Array.isArray(option2Data) ? option2Data : option2Data.features || [];
  
  const cleanOption2 = option2Features.filter(f => f && Number.isInteger(Number(f.id)));
  cleanOption2.sort((a, b) => Number(a.id) - Number(b.id));

  for (const f of cleanOption2) {
    if (webFeatureMap.has(f.id)) {
      const sym = webFeatureMap.get(f.id);
      f.web_feature = sym;
      if (sym) {
        const syms = sym.split(',').map((s: string) => s.trim()).filter(Boolean);
        let maxYear: number | undefined = undefined;
        for (const s of syms) {
          const year = resolveWebFeatureBaselineYear(s);
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

  if (cleanOption2.length !== totalCount) {
    throw new Error(`Integrity validation failed: Processed Lite flat record array count (${cleanOption2.length}) does not perfectly equal reported catalog total (${totalCount}). Base list output is partial or corrupted.`);
  }

  console.log(`Writing ${cleanOption2.length} flattened base records to data/lite.json...`);
  await fs.writeFile(
    path.join(dataDir, 'lite.json'),
    JSON.stringify(cleanOption2, null, 2)
  );

  console.log("\nData compilation complete.");
}

main().catch(err => {
  console.error("Fatal error compiling data:", err);
  process.exit(1);
});
