import { features as defaultWebFeatures } from 'web-features';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from './overrides.ts';

/**
 * Extracts the baseline implementation year for a given WebDX symbol.
 */
export function resolveWebFeatureBaselineYear(symbol: string, webFeaturesCatalog: any = defaultWebFeatures): number | undefined {
  const webData: any = Object.hasOwn(webFeaturesCatalog, symbol) ? webFeaturesCatalog[symbol] : undefined;
  if (!webData) return undefined;

  let targetData = webData;
  if (webData.kind === 'moved' && typeof webData.redirect_target === 'string') {
    targetData = Object.hasOwn(webFeaturesCatalog, webData.redirect_target) ? webFeaturesCatalog[webData.redirect_target] : undefined;
  }

  if (targetData?.status?.baseline_low_date && typeof targetData.status.baseline_low_date === 'string') {
    const yearStr = targetData.status.baseline_low_date.split('-')[0];
    const y = parseInt(yearStr, 10);
    if (!isNaN(y)) return y;
  }
  return undefined;
}

/**
 * Evaluates whether a feature is genuinely active in Chrome's Origin Trials.
 */
export function evaluateActiveOriginTrial(
  f: any,
  activeStableMilestone: number,
  otApiActiveFeatureIds: Set<number>,
  otApiActiveTrialNames: Set<string>,
  baselineYearResolver: (symbol: string) => number | undefined = resolveWebFeatureBaselineYear
): boolean {
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
  if (isGenuinelyActive && f && typeof f.name === 'string') {
    const targetSym = CUSTOM_WEB_FEATURE_OVERRIDES[f.name.trim()] || (typeof f.web_feature === 'string' ? f.web_feature.trim() : '');
    if (targetSym) {
      const baselineYear = baselineYearResolver(targetSym);
      if (baselineYear !== undefined && baselineYear < 2024) {
        isGenuinelyActive = false;
      }
    }
  }

  return isGenuinelyActive;
}

/**
 * Evaluates whether a feature is gated behind an active browser flag.
 */
export function evaluateBehindFlag(
  f: any,
  baselineYearResolver: (symbol: string) => number | undefined = resolveWebFeatureBaselineYear
): boolean {
  let isBehindFlag = false;
  const statusText = typeof f.browsers?.chrome?.status?.text === 'string' ? f.browsers.chrome.status.text.toLowerCase() : '';
  const intentStage = typeof f.intent_stage === 'string' ? f.intent_stage.toLowerCase() : '';

  if (f.browsers?.chrome?.flag === true || statusText.includes('behind a flag')) {
    isBehindFlag = true;
  }

  // Validate flag list: explicitly drop universally shipped or legacy baseline standard features
  if (isBehindFlag) {
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
        const baselineYear = baselineYearResolver(targetSym);
        if (baselineYear !== undefined && baselineYear < 2024) {
          isBehindFlag = false;
        }
      }
    }
  }

  return isBehindFlag;
}

/**
 * Appends semantic phase suffixes to resolve duplicate feature names.
 */
export function disambiguateFeatureNames(features: any[]): void {
  const seenNames = new Set<string>();
  for (const f of features) {
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
}

/**
 * Maps WebDX symbols and resolves max baseline support years.
 */
export function assignWebFeaturesAndBaselineYears(
  features: any[],
  baselineYearResolver: (symbol: string) => number | undefined = resolveWebFeatureBaselineYear
): Map<number, string> {
  const webFeatureMap = new Map<number, string>();
  for (const f of features) {
    if (f && typeof f.name === 'string') {
      const overrideSym = CUSTOM_WEB_FEATURE_OVERRIDES[f.name.trim()];
      if (overrideSym) {
        f.web_feature = overrideSym;
        webFeatureMap.set(f.id, overrideSym);
      } else if (f.web_feature && typeof f.web_feature === 'string') {
        const cleanSym = f.web_feature.trim();
        if (cleanSym !== '' && cleanSym !== 'Missing feature' && cleanSym.toLowerCase() !== 'none') {
          f.web_feature = cleanSym;
          webFeatureMap.set(f.id, cleanSym);
        } else {
          delete f.web_feature;
        }
      } else {
        delete f.web_feature;
      }

      const sym = f.web_feature;
      if (sym) {
        const syms = sym.split(',').map((s: string) => s.trim()).filter(Boolean);
        let maxYear: number | undefined = undefined;
        for (const s of syms) {
          const year = baselineYearResolver(s);
          if (year !== undefined) {
            if (maxYear === undefined || year > maxYear) {
              maxYear = year;
            }
          }
        }
        if (maxYear !== undefined) {
          f.baseline_year = maxYear;
        } else {
          delete f.baseline_year;
        }
      } else {
        delete f.baseline_year;
      }
    }
  }
  return webFeatureMap;
}
