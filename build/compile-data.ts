import fs from 'node:fs/promises';
import path from 'node:path';

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

  for (const f of option1Features) {
    if (f && Number.isInteger(Number(f.id)) && !seenIds.has(f.id)) {
      seenIds.add(f.id);
      uniqueOption1.push(f);

      // Evaluate if feature configures a genuinely active Origin Trial stage timeline
      let isGenuinelyActive = false;
      const statusText = typeof f.browsers?.chrome?.status?.text === 'string' ? f.browsers.chrome.status.text.toLowerCase() : '';

      // Explicitly exclude globally shipped, enabled, or removed features from active evaluation sets
      const isShippedOrDead = statusText.includes('enabled by default') || 
                              statusText.includes('shipped') || 
                              statusText.includes('removed') ||
                              statusText.includes('no longer pursuing');

      if (!isShippedOrDead) {
        if (f.stages && Array.isArray(f.stages)) {
          for (const s of f.stages) {
            if (s && s.stage_type === 150) {
              // Validate that ending desktop milestone strings evaluate to clean integer comparisons
              if (s.desktop_last !== null && s.desktop_last !== undefined) {
                const m = Number(s.desktop_last);
                if (!isNaN(m) && m >= activeStableMilestone) {
                  isGenuinelyActive = true;
                  break;
                }
              } else {
                // If desktop_last is null/absent, ensure overarching feature status explicitly confirms active experimentation
                if (statusText.includes('origin trial') || statusText.includes('in development') || f.browsers?.chrome?.origintrial === true) {
                  isGenuinelyActive = true;
                  break;
                }
              }
            }
          }
        }

        // Fallback logic
        if (!isGenuinelyActive && statusText.includes('origin trial')) {
          const hasCompletedOt = f.stages?.some((s: any) => {
            if (s.stage_type === 150 && s.desktop_last !== null && s.desktop_last !== undefined) {
              const m = Number(s.desktop_last);
              return !isNaN(m) && m < activeStableMilestone;
            }
            return false;
          });
          if (!hasCompletedOt) {
            isGenuinelyActive = true;
          }
        }
      }

      if (isGenuinelyActive) {
        activeOtIds.push(f.id);
      }
    }
  }
  uniqueOption1.sort((a, b) => Number(a.id) - Number(b.id));
  activeOtIds.sort((a, b) => a - b);

  // Strict Integrity Pre-checks: guarantee downloaded snapshot states are absolute and whole
  if (totalCount < 3000) {
    throw new Error(`Integrity validation failed: Reported total feature count (${totalCount}) is below acceptable historical baseline limits.`);
  }
  if (uniqueOption1.length !== totalCount) {
    throw new Error(`Integrity validation failed: Processed granular verbose feature count (${uniqueOption1.length}) does not perfectly equal reported catalog total (${totalCount}). Snapshot mapping is partial or corrupted.`);
  }

  console.log(`Writing ${uniqueOption1.length} granular verbose JSON chunks concurrently in bounded batches...`);
  // Batched execution limiting file descriptor pressuring while maximizing IO multi-threading speed
  const batchSize = 100;
  for (let i = 0; i < uniqueOption1.length; i += batchSize) {
    const batch = uniqueOption1.slice(i, i + batchSize);
    await Promise.all(batch.map(f => 
      fs.writeFile(path.join(featuresDir, `${f.id}.json`), JSON.stringify(f))
    ));
  }

  console.log(`Writing ${activeOtIds.length} Active Origin Trial index IDs to data/active-ot-index.json...`);
  await fs.writeFile(
    path.join(dataDir, 'active-ot-index.json'),
    JSON.stringify(activeOtIds)
  );

  console.log("\nProcessing Lite array data from cache...");
  const option2Content = await fs.readFile(path.join(rawDir, 'features-lite.json'), 'utf8');
  const option2Data = JSON.parse(option2Content);
  const option2Features: any[] = Array.isArray(option2Data) ? option2Data : option2Data.features || [];
  
  const cleanOption2 = option2Features.filter(f => f && Number.isInteger(Number(f.id)));
  cleanOption2.sort((a, b) => Number(a.id) - Number(b.id));

  // Pre-map web_feature identifiers onto Lite instances for synchronous querying
  // Explicitly filter out unmapped sentinels like "None" or "Missing feature"
  const webFeatureMap = new Map<number, string>();
  for (const f of uniqueOption1) {
    if (f?.web_feature && typeof f.web_feature === 'string') {
      const cleanSym = f.web_feature.trim();
      if (cleanSym !== '' && cleanSym !== 'Missing feature' && cleanSym.toLowerCase() !== 'none') {
        webFeatureMap.set(f.id, cleanSym);
      }
    }
  }

  for (const f of cleanOption2) {
    if (webFeatureMap.has(f.id)) {
      f.web_feature = webFeatureMap.get(f.id);
    } else {
      // Strip pre-existing unmapped/stale keys to enforce consistency
      delete f.web_feature;
    }
  }

  if (cleanOption2.length !== totalCount) {
    throw new Error(`Integrity validation failed: Processed Lite flat record array count (${cleanOption2.length}) does not perfectly equal reported catalog total (${totalCount}). Base list output is partial or corrupted.`);
  }

  console.log(`Writing ${cleanOption2.length} flattened base records to data/lite.json...`);
  await fs.writeFile(
    path.join(dataDir, 'lite.json'),
    JSON.stringify(cleanOption2)
  );

  console.log("\nData compilation complete.");
}

main().catch(err => {
  console.error("Fatal error compiling data:", err);
  process.exit(1);
});
