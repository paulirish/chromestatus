import type { ChromeStatusFeatureVerbose } from './types.ts';
import { CollectorResultsIndex } from './collector-results-index.ts';
import { tokenize } from './text-analyzer.ts';
import { features as webFeatures } from 'web-features';

export interface ConformanceRecord {
  id: number;
  name: string;
  webFeatureId: string;
  csMilestone: number;
  wfMilestone: string;
  collector: string;
  keys: string;
}

export interface ConformanceAuditResult {
  conformant: ConformanceRecord[];
  bcdLagging: ConformanceRecord[];
  csStale: ConformanceRecord[];
  flagGaps: ConformanceRecord[];
  coarseMapping: ConformanceRecord[];
  noCollectorData: ConformanceRecord[];
  noBcdKeys: ConformanceRecord[];
}

function filterRelevantBcdKeys(keys: string[], csName: string, csSummary: string): string[] {
  const nameTokens = tokenize(csName);
  if (nameTokens.size === 0) return keys;

  const matched: string[] = [];
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    let isMatched = false;
    for (const token of nameTokens) {
      if (lowerKey.includes(token)) {
        isMatched = true;
        break;
      }
    }
    if (isMatched) {
      matched.push(key);
    }
  }

  if (matched.length > 0) {
    return matched;
  }

  const summaryTokens = tokenize(csSummary);
  for (const key of keys) {
    const lowerKey = key.toLowerCase();
    let isMatched = false;
    for (const token of summaryTokens) {
      if (lowerKey.includes(token)) {
        isMatched = true;
        break;
      }
    }
    if (isMatched) {
      matched.push(key);
    }
  }

  return matched.length > 0 ? matched : keys;
}

export class ConformanceAuditor {
  private collectorIndex: CollectorResultsIndex;
  constructor(collectorIndex: CollectorResultsIndex) {
    this.collectorIndex = collectorIndex;
  }

  audit(featuresList: ChromeStatusFeatureVerbose[]): ConformanceAuditResult {
    const conformant: ConformanceRecord[] = [];
    const bcdLagging: ConformanceRecord[] = [];
    const csStale: ConformanceRecord[] = [];
    const flagGaps: ConformanceRecord[] = [];
    const coarseMapping: ConformanceRecord[] = [];
    const noCollectorData: ConformanceRecord[] = [];
    const noBcdKeys: ConformanceRecord[] = [];

    for (const data of featuresList) {
      // Check if the feature is shipped/enabled on desktop
      const csMilestone = data.browsers?.chrome?.desktop;
      if (csMilestone && typeof csMilestone === 'number' && csMilestone > 108) {
        const webFeatureId = data.web_feature?.trim();
        
        if (webFeatureId && webFeatureId !== 'Missing feature' && webFeatureId !== '') {
          let wfFeature = (webFeatures as any)[webFeatureId];
          if (wfFeature && wfFeature.kind === 'moved' && typeof wfFeature.redirect_target === 'string') {
            wfFeature = (webFeatures as any)[wfFeature.redirect_target];
          }
          
          if (wfFeature && wfFeature.kind === 'feature') {
            const wfChromeSupport = wfFeature.status?.support?.chrome;
            const wfMilestone = wfChromeSupport ? parseInt(wfChromeSupport, 10) : null;
            
            const allKeys = wfFeature.compat_features || [];
            const recordBase = {
              id: data.id,
              name: data.name,
              webFeatureId,
              csMilestone,
              wfMilestone: wfMilestone ? `M${wfMilestone}` : 'unsupported',
            };

            if (allKeys.length === 0) {
              noBcdKeys.push({
                ...recordBase,
                collector: 'N/A',
                keys: ''
              });
              continue;
            }

            const keys = filterRelevantBcdKeys(allKeys, data.name, data.summary || '');

            const keyResults = (keys as string[]).map((k: string) => {
              const collectorSupport = this.collectorIndex.getSupport(k);
              return { key: k, version: collectorSupport ? collectorSupport.majorVersion : null };
            });

            const passedKeys = keyResults.filter((r: { key: string, version: number | null }) => r.version !== null);
            
            if (passedKeys.length === 0) {
              noCollectorData.push({
                ...recordBase,
                collector: 'No collector data',
                keys: keys.length > 3
                  ? `${keys.slice(0, 3).join(', ')} ... (+${keys.length - 3} more)`
                  : keys.join(', ')
              });
              continue;
            }

            const collectorVersions = passedKeys.map((r: { key: string, version: number | null }) => r.version as number);
            const minCollectorVersion = Math.min(...collectorVersions);
            const maxCollectorVersion = Math.max(...collectorVersions);
            
            const collectorDisplay = minCollectorVersion === maxCollectorVersion 
              ? `M${minCollectorVersion}` 
              : `M${minCollectorVersion} - M${maxCollectorVersion}`;

            const hasMismatch = minCollectorVersion !== maxCollectorVersion;
            const hasMissingKeys = passedKeys.length < keys.length;
            
            let displayNote = '';
            if (hasMismatch) {
              displayNote = ` (Key mismatch: ${passedKeys.length}/${keys.length} pass)`;
            } else if (hasMissingKeys) {
              displayNote = ` (Partial: ${passedKeys.length}/${keys.length} pass)`;
            }

            const record: ConformanceRecord = {
              ...recordBase,
              collector: `${collectorDisplay}${displayNote}`,
              keys: keys.length > 1
                ? `${keys[0]} (+${keys.length - 1} more)`
                : keys[0] || ''
            };

            const isMilestoneInCollectorRange = wfMilestone !== null && wfMilestone >= minCollectorVersion && wfMilestone <= maxCollectorVersion;
            const isEarlyCollectorPass = wfMilestone !== null && minCollectorVersion < wfMilestone;

            // Categorize based on conformance
            if (wfMilestone !== null) {
              // 1. Conformant: CS and BCD agree, and collector tests confirm support at/before that milestone
              if (csMilestone === wfMilestone && (isMilestoneInCollectorRange || isEarlyCollectorPass)) {
                conformant.push(record);
              }
              // 2. ChromeStatus Stale: BCD and collector agree (or collector is earlier), but CS is different
              else if ((wfMilestone === minCollectorVersion || isEarlyCollectorPass) && csMilestone !== wfMilestone) {
                csStale.push(record);
              }
              // 3. Coarse Mapping: BCD is earlier than the earliest collector passing test
              else if (wfMilestone < minCollectorVersion) {
                coarseMapping.push(record);
              }
              // 4. Static BCD Lagging: Collector tests passed at/before CS milestone, but BCD is later
              else if (minCollectorVersion <= csMilestone && wfMilestone > csMilestone) {
                bcdLagging.push(record);
              }
              // 5. Flag Gaps / Collector Late Tests: Collector tests passed later than both CS and BCD records
              else if (minCollectorVersion > csMilestone && minCollectorVersion > wfMilestone) {
                flagGaps.push(record);
              }
              // 6. Fallback/Complex cases
              else {
                if (wfMilestone > maxCollectorVersion) {
                  bcdLagging.push(record);
                } else {
                  flagGaps.push(record);
                }
              }
            } else {
              // BCD has no support recorded (wfMilestone === null)
              if (minCollectorVersion <= csMilestone) {
                bcdLagging.push(record);
              } else {
                flagGaps.push(record);
              }
            }
          }
        }
      }
    }

    return {
      conformant,
      bcdLagging,
      csStale,
      flagGaps,
      coarseMapping,
      noCollectorData,
      noBcdKeys
    };
  }
}
