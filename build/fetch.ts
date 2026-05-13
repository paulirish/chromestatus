import fs from 'node:fs/promises';
import path from 'node:path';

async function fetchCleanJson(url: string): Promise<any> {
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status} fetching ${url}`);
  }
  let text = await res.text();
  if (text.startsWith(")]}'")) {
    text = text.replace(/^\)\]\}'\n?/, '');
  }
  return JSON.parse(text);
}

async function main() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const featuresDir = path.join(dataDir, 'features');
  
  await fs.mkdir(featuresDir, { recursive: true });

  console.log("Starting Option 1 verbose data collection...");
  const initialData = await fetchCleanJson('https://chromestatus.com/api/v0/features?num=1');
  const totalCount: number = initialData.total_count;
  console.log(`Total features reported by API: ${totalCount}`);

  const option1Features: any[] = [];
  const pageSize = 1000;
  for (let start = 0; start < totalCount; start += pageSize) {
    const pageData = await fetchCleanJson(`https://chromestatus.com/api/v0/features?num=${pageSize}&start=${start}`);
    if (pageData?.features && Array.isArray(pageData.features)) {
      option1Features.push(...pageData.features);
    }
  }

  // Deduplicate and sort by ID
  const seenIds = new Set<number>();
  const uniqueOption1: any[] = [];
  const activeOtIds: number[] = [];

  console.log("Fetching live Chromium release schedule milestone metadata to define current browser release thresholds...");
  let activeStableMilestone = 148; // robust static default fallback baseline
  try {
    const scheduleData = await fetchCleanJson('https://chromiumdash.appspot.com/fetch_milestones');
    if (Array.isArray(scheduleData)) {
      const stableObj = scheduleData.find((m: any) => m && m.schedule_phase === 'stable');
      if (stableObj && typeof stableObj.milestone === 'number') {
        activeStableMilestone = stableObj.milestone;
      }
    }
  } catch {
    console.log(`Warning: Failed to fetch dynamic release milestones from Chromium schedule API. Utilizing default baseline stable threshold M${activeStableMilestone}.`);
  }
  console.log(`Authoritative current active Stable Release Milestone threshold evaluated as: M${activeStableMilestone}`);

  for (const f of option1Features) {
    if (f && f.id && !seenIds.has(f.id)) {
      seenIds.add(f.id);
      uniqueOption1.push(f);

      // Evaluate if feature configures a genuinely active Origin Trial stage timeline
      let isGenuinelyActive = false;
      const statusText = f.browsers?.chrome?.status?.text?.toLowerCase() || '';

      // Explicitly exclude globally shipped, enabled, or removed features from active evaluation sets
      const isShippedOrDead = statusText.includes('enabled by default') || 
                              statusText.includes('shipped') || 
                              statusText.includes('removed') ||
                              statusText.includes('no longer pursuing');

      if (!isShippedOrDead) {
        if (f.stages && Array.isArray(f.stages)) {
          for (const s of f.stages) {
            if (s && s.stage_type === 150) {
              // If an ending desktop milestone is declared, verify if it meets or exceeds live release thresholds
              if (s.desktop_last !== null && s.desktop_last !== undefined) {
                if (Number(s.desktop_last) >= activeStableMilestone) {
                  isGenuinelyActive = true;
                  break;
                }
              } else {
                // If desktop_last is null/absent, ensure the overarching feature status explicitly confirms active experimentation
                if (statusText.includes('origin trial') || statusText.includes('in development') || f.browsers?.chrome?.origintrial === true) {
                  isGenuinelyActive = true;
                  break;
                }
              }
            }
          }
        }

        // Fallback logic: if browser status text explicitly asserts active trial, check if stages contradict
        if (!isGenuinelyActive && statusText.includes('origin trial')) {
          const hasCompletedOt = f.stages?.some((s: any) => s.stage_type === 150 && s.desktop_last !== null && Number(s.desktop_last) < activeStableMilestone);
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

  console.log(`Writing ${uniqueOption1.length} granular verbose JSON chunks to data/features/...`);
  for (const f of uniqueOption1) {
    await fs.writeFile(
      path.join(featuresDir, `${f.id}.json`), 
      JSON.stringify(f)
    );
  }

  console.log(`Writing ${activeOtIds.length} Active Origin Trial index IDs to data/active-ot-index.json...`);
  await fs.writeFile(
    path.join(dataDir, 'active-ot-index.json'),
    JSON.stringify(activeOtIds)
  );

  console.log("\nStarting Option 2 Lite array fetch...");
  const option2Data = await fetchCleanJson('https://chromestatus.com/features.json');
  const option2Features: any[] = Array.isArray(option2Data) ? option2Data : option2Data.features || [];
  
  const cleanOption2 = option2Features.filter(f => f && f.id);
  cleanOption2.sort((a, b) => Number(a.id) - Number(b.id));

  // Pre-map web_feature identifiers onto Lite instances for synchronous querying
  const webFeatureMap = new Map<number, string>();
  for (const f of uniqueOption1) {
    if (f?.web_feature && typeof f.web_feature === 'string' && f.web_feature !== 'Missing feature') {
      webFeatureMap.set(f.id, f.web_feature);
    }
  }

  for (const f of cleanOption2) {
    if (webFeatureMap.has(f.id)) {
      f.web_feature = webFeatureMap.get(f.id);
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

  console.log("\nData collection and compilation complete.");
}

main().catch(err => {
  console.error("Fatal error fetching data:", err);
  process.exit(1);
});
