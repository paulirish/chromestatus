import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';

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

  // Explicit compile-time overrides dictionary correcting upstream ChromeStatus datastore entry anomalies
  // Keyed by exact descriptive feature name strings to ensure highly readable, self-documenting code maintenance
  const CUSTOM_WEB_FEATURE_OVERRIDES: Record<string, string> = {
    // Maps HTML-in-canvas feature directly to its authentic canonical identifier "canvas-html"
    "HTML-in-canvas": "canvas-html",
    // Correct upstream datastore typo mapping to canonical identifier
    "Numeric separators": "numeric-separators",
    // Migrate deprecated symbol to active canonical target identifier
    "CSS :open pseudo-class": "open-pseudo",
    // Map experimental prompt API parameters onto authentic verified base symbol
    "Prompt API Sampling Parameters": "languagemodel",
    // Multi-agent verified absolute canonical mapping assignments for unmapped Origin Trials
    "Web app HTML install element": "install",
    "Digital Credentials API (issuance support)": "digital-credentials",
    "Prerendering cross-origin iframes": "speculation-rules",
    "Proofreader API": "languagemodel",
    // Connect proposed WebMCP incubation directly to authoritative dictionary capability string
    "WebMCP": "navigator-modelcontext"
  };

  // Internal helper extracting authoritative baseline implementation support year from web-features dictionary
  function resolveWebFeatureBaselineYear(symbol: string): number | undefined {
    const webData: any = Object.hasOwn(webFeatures, symbol) ? webFeatures[symbol] : undefined;
    if (!webData) return undefined;

    let targetData = webData;
    if (webData.kind === 'moved' && typeof webData.redirect_target === 'string') {
      targetData = Object.hasOwn(webFeatures, webData.redirect_target) ? webFeatures[webData.redirect_target] : undefined;
    }

    if (targetData?.status?.baseline_low_date && typeof targetData.status.baseline_low_date === 'string') {
      const yearStr = targetData.status.baseline_low_date.split('-')[0];
      const y = parseInt(yearStr, 10);
      if (!isNaN(y)) return y;
    }
    return undefined;
  }



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

      // ==============================================================================
      // CRITICAL EMPIRICAL FILTERING HEURISTICS: EVALUATING GENUINE ACTIVE ORIGIN TRIALS
      // ==============================================================================
      // Upstream database architecture exhibits specific historical nuances and process gaps:
      // 1. Historical Legacy Persistence: Stage 150 objects are permanently retained inside a feature's
      //    timeline array. Ancient trials launched half a decade ago permanently record `desktop_last: null`
      //    due to database evolution gaps. Naively scanning for Stage 150 without checking overarching release
      //    states sweeps in hundreds of universally supported foundational web standards (e.g., Pointer Events).
      // 2. Overarching Status Precedence: If an overarching record asserts released states ("Shipped",
      //    "Enabled by default", or "Removed"), it definitively supersedes open legacy stage parameters.
      // 3. Future-Scheduled Trials: Experiments mapping `desktop_first` integers targeting future browser releases
      //    hold ending bounds >= stable, but remain hidden from public active dashboard interfaces until launch.
      // 4. Private Evaluations: Confidential partner tests enforce `unlisted: true` and must be safely dropped.
      // 5. Authoritative OT API Synchronization: If Google's active developer API explicitly tracks a feature ID
      //    or trial flag string, it provides mathematical confirmation overriding heuristic ambiguities.
      // ==============================================================================
      let isGenuinelyActive = false;
      const statusText = typeof f.browsers?.chrome?.status?.text === 'string' ? f.browsers.chrome.status.text.toLowerCase() : '';
      const intentStage = typeof f.intent_stage === 'string' ? f.intent_stage.toLowerCase() : '';

      // Check 1: Absolute alignment verification against live Google OT API mappings
      if (otApiActiveFeatureIds.has(f.id)) {
        isGenuinelyActive = true;
      } else if (f.stages && Array.isArray(f.stages)) {
        for (const s of f.stages) {
          if (s && s.stage_type === 150 && typeof s.ot_chromium_trial_name === 'string' && otApiActiveTrialNames.has(s.ot_chromium_trial_name)) {
            isGenuinelyActive = true;
            break;
          }
        }
      }

      // Check 2: If absent from OT API feeds, evaluate strict empirical scheduling limits
      if (!isGenuinelyActive) {
        const isShippedOrDead = f.is_released === true ||
                                f.unlisted === true ||
                                statusText.includes('enabled by default') || 
                                statusText.includes('shipped') || 
                                statusText.includes('removed') ||
                                statusText.includes('no longer pursuing') ||
                                intentStage.includes('shipped') ||
                                intentStage.includes('removed');

        if (!isShippedOrDead) {
          if (f.stages && Array.isArray(f.stages)) {
            for (const s of f.stages) {
              if (s && s.stage_type === 150) {
                const startM = s.desktop_first !== null && s.desktop_first !== undefined ? Number(s.desktop_first) : 0;
                if (!isNaN(startM) && startM > activeStableMilestone) {
                  continue;
                }

                if (s.desktop_last !== null && s.desktop_last !== undefined) {
                  const endM = Number(s.desktop_last);
                  if (!isNaN(endM) && endM >= activeStableMilestone) {
                    isGenuinelyActive = true;
                    break;
                  }
                } else {
                  if (statusText.includes('origin trial') || statusText.includes('in development') || f.browsers?.chrome?.origintrial === true) {
                    isGenuinelyActive = true;
                    break;
                  }
                }
              }
            }
          }

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
      }

      // Final validation bound 1: if Google's OT API feeds were actively extracted but omit this feature,
      // strictly drop speculative fallback marking to lock output alignment natively.
      if (isGenuinelyActive && (otApiActiveFeatureIds.size > 0 || otApiActiveTrialNames.size > 0)) {
        if (!otApiActiveFeatureIds.has(f.id)) {
          const hasTrialStr = f.stages?.some((s: any) => s.stage_type === 150 && typeof s.ot_chromium_trial_name === 'string' && otApiActiveTrialNames.has(s.ot_chromium_trial_name));
          if (!hasTrialStr) {
            isGenuinelyActive = false;
          }
        }
      }

      // Final validation bound 2: Evaluate absolute calendar baseline support year
      // If a feature is marked as active but its baseline support threshold landed in a legacy calendar year (< 2024),
      // it is highly implausible that it remains an active experimental Origin Trial today.
      if (isGenuinelyActive && f && typeof f.name === 'string') {
        const targetSym = CUSTOM_WEB_FEATURE_OVERRIDES[f.name.trim()] || (typeof f.web_feature === 'string' ? f.web_feature.trim() : '');
        if (targetSym) {
          const baselineYear = resolveWebFeatureBaselineYear(targetSym);
          if (baselineYear !== undefined && baselineYear < 2024) {
            isGenuinelyActive = false;
          }
        }
      }

      if (isGenuinelyActive) {
        activeOtIds.push(f.id);
      }

      // ==============================================================================
      // EXPERIMENTAL WEB PLATFORM FEATURES FLAG GATING EVALUATION & VALIDATION
      // ==============================================================================
      // Evaluates items configured behind active developer trial flag switches
      let isBehindFlag = false;
      if (f.browsers?.chrome?.flag === true || statusText.includes('behind a flag')) {
        isBehindFlag = true;
      }

      // Validate flag list: explicitly drop universally shipped or legacy baseline standard features
      if (isBehindFlag) {
        // Omit global f.is_released check to prevent overly aggressive masking of valid incubation features
        const isShippedOrDead = f.unlisted === true ||
                                statusText.includes('enabled by default') || 
                                statusText.includes('shipped') || 
                                statusText.includes('removed') ||
                                statusText.includes('no longer pursuing') ||
                                intentStage.includes('shipped') ||
                                intentStage.includes('removed');

        if (isShippedOrDead) {
          isBehindFlag = false;
        } else if (f && typeof f.name === 'string') {
          const targetSym = CUSTOM_WEB_FEATURE_OVERRIDES[f.name.trim()] || (typeof f.web_feature === 'string' ? f.web_feature.trim() : '');
          if (targetSym) {
            const baselineYear = resolveWebFeatureBaselineYear(targetSym);
            if (baselineYear !== undefined && baselineYear < 2024) {
              // Highly implausible that an ancient standard remains exclusively behind an experimental flag today
              isBehindFlag = false;
            }
          }
        }
      }

      if (isBehindFlag) {
        experimentalFlagIds.push(f.id);
      }
    }
  }
  uniqueOption1.sort((a, b) => Number(a.id) - Number(b.id));
  activeOtIds.sort((a, b) => a - b);
  experimentalFlagIds.sort((a, b) => a - b);

  // Systematic Title Disambiguation Phase: ensure f.name is entirely unique across the complete catalog set
  // Appends intuitive semantic phase qualifiers to colliding base names to suppress forbidden numerical IDs natively
  const seenNames = new Set<string>();
  for (const f of uniqueOption1) {
    if (f && typeof f.name === 'string') {
      let cleanName = f.name.trim();
      const baseName = cleanName;
      let counter = 2;
      while (seenNames.has(cleanName.toLowerCase())) {
        cleanName = `${baseName} (Phase ${counter})`;
        counter++;
      }
      seenNames.add(cleanName.toLowerCase());
      f.name = cleanName;
    }
  }

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
    if (f && typeof f.name === 'string') {
      const overrideSym = CUSTOM_WEB_FEATURE_OVERRIDES[f.name.trim()];
      if (overrideSym) {
        webFeatureMap.set(f.id, overrideSym);
      } else if (f.web_feature && typeof f.web_feature === 'string') {
        const cleanSym = f.web_feature.trim();
        if (cleanSym !== '' && cleanSym !== 'Missing feature' && cleanSym.toLowerCase() !== 'none') {
          webFeatureMap.set(f.id, cleanSym);
        }
      }
    }
  }

  for (const f of cleanOption2) {
    if (webFeatureMap.has(f.id)) {
      const sym = webFeatureMap.get(f.id);
      f.web_feature = sym;
      if (sym) {
        const year = resolveWebFeatureBaselineYear(sym);
        if (year !== undefined) {
          f.baseline_year = year;
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
