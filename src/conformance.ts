import type { ChromeStatusFeatureDetailed } from './types.ts';
import { EmpiricalSupportIndex } from './empirical-index.ts';
import { tokenize } from './text-analyzer.ts';
import { features as webFeatures } from 'web-features';

export interface ConformanceRecord {
  id: number;
  name: string;
  symbol: string;
  csMilestone: number;
  wfMilestone: string;
  empirical: string;
  keys: string;
}

export interface ConformanceAuditResult {
  aligned: ConformanceRecord[];
  bcdLagging: ConformanceRecord[];
  csStale: ConformanceRecord[];
  flagGaps: ConformanceRecord[];
  coarseMapping: ConformanceRecord[];
  noEmpiricalData: ConformanceRecord[];
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
  private empiricalIndex: EmpiricalSupportIndex;
  constructor(empiricalIndex: EmpiricalSupportIndex) {
    this.empiricalIndex = empiricalIndex;
  }

  audit(featuresList: ChromeStatusFeatureDetailed[]): ConformanceAuditResult {
    const aligned: ConformanceRecord[] = [];
    const bcdLagging: ConformanceRecord[] = [];
    const csStale: ConformanceRecord[] = [];
    const flagGaps: ConformanceRecord[] = [];
    const coarseMapping: ConformanceRecord[] = [];
    const noEmpiricalData: ConformanceRecord[] = [];
    const noBcdKeys: ConformanceRecord[] = [];

    for (const data of featuresList) {
      // Check if the feature is shipped/enabled on desktop
      const csMilestone = data.browsers?.chrome?.desktop;
      if (csMilestone && typeof csMilestone === 'number' && csMilestone > 108) {
        const symbol = data.web_feature?.trim();
        
        if (symbol && symbol !== 'Missing feature' && symbol !== '') {
          let wfFeature = (webFeatures as any)[symbol];
          if (wfFeature && wfFeature.kind === 'moved' && typeof wfFeature.redirect_target === 'string') {
            wfFeature = (webFeatures as any)[wfFeature.redirect_target];
          }
          
          if (wfFeature && wfFeature.kind === 'feature') {
            const wfChromeSupport = wfFeature.status?.support?.chrome;
            const wfMilestone = wfChromeSupport ? parseInt(wfChromeSupport, 10) : null;
            
            const allKeys = wfFeature.compat_features || [];
            const recordStub = {
              id: data.id,
              name: data.name,
              symbol,
              csMilestone,
              wfMilestone: wfMilestone ? `M${wfMilestone}` : 'unsupported',
            };

            if (allKeys.length === 0) {
              noBcdKeys.push({
                ...recordStub,
                empirical: 'N/A',
                keys: ''
              });
              continue;
            }

            const keys = filterRelevantBcdKeys(allKeys, data.name, data.summary || '');

            const keyResults = (keys as string[]).map((k: string) => {
              const emp = this.empiricalIndex.getSupport(k);
              return { key: k, version: emp ? emp.majorVersion : null };
            });

            const passedKeys = keyResults.filter((r: { key: string, version: number | null }) => r.version !== null);
            
            if (passedKeys.length === 0) {
              noEmpiricalData.push({
                ...recordStub,
                empirical: 'No empirical data',
                keys: keys.length > 3
                  ? `${keys.slice(0, 3).join(', ')} ... (+${keys.length - 3} more)`
                  : keys.join(', ')
              });
              continue;
            }

            const empiricalVersions = passedKeys.map((r: { key: string, version: number | null }) => r.version as number);
            const minEmpVersion = Math.min(...empiricalVersions);
            const maxEmpVersion = Math.max(...empiricalVersions);
            
            const empiricalDisplay = minEmpVersion === maxEmpVersion 
              ? `M${minEmpVersion}` 
              : `M${minEmpVersion} - M${maxEmpVersion}`;

            const hasMismatch = minEmpVersion !== maxEmpVersion;
            const hasMissingKeys = passedKeys.length < keys.length;
            
            let displayNote = '';
            if (hasMismatch) {
              displayNote = ` (Key mismatch: ${passedKeys.length}/${keys.length} pass)`;
            } else if (hasMissingKeys) {
              displayNote = ` (Partial: ${passedKeys.length}/${keys.length} pass)`;
            }

            const record: ConformanceRecord = {
              ...recordStub,
              empirical: `${empiricalDisplay}${displayNote}`,
              keys: keys.length > 3
                ? `${keys.slice(0, 3).join(', ')} ... (+${keys.length - 3} more)`
                : keys.join(', ')
            };

            const isMilestoneInEmpiricalRange = wfMilestone !== null && wfMilestone >= minEmpVersion && wfMilestone <= maxEmpVersion;
            const isEarlyEmpiricalPass = wfMilestone !== null && minEmpVersion < wfMilestone;

            // Categorize based on alignment
            if (wfMilestone !== null) {
              // 1. Aligned: CS and BCD agree, and empirical tests confirm support at/before that milestone
              if (csMilestone === wfMilestone && (isMilestoneInEmpiricalRange || isEarlyEmpiricalPass)) {
                aligned.push(record);
              }
              // 2. ChromeStatus Stale: BCD and Empirical agree (or empirical is earlier), but CS is different
              else if ((wfMilestone === minEmpVersion || isEarlyEmpiricalPass) && csMilestone !== wfMilestone) {
                csStale.push(record);
              }
              // 3. WebDX Coarse Mapping: BCD is earlier than the earliest empirical passing test
              else if (wfMilestone < minEmpVersion) {
                coarseMapping.push(record);
              }
              // 4. Static BCD Lagging: Empirical tests passed at/before CS milestone, but BCD is later
              else if (minEmpVersion <= csMilestone && wfMilestone > csMilestone) {
                bcdLagging.push(record);
              }
              // 5. Flag Gaps / Collector Late Tests: Empirical tests passed later than both CS and BCD records
              else if (minEmpVersion > csMilestone && minEmpVersion > wfMilestone) {
                flagGaps.push(record);
              }
              // 6. Fallback/Complex cases
              else {
                if (wfMilestone > maxEmpVersion) {
                  bcdLagging.push(record);
                } else {
                  flagGaps.push(record);
                }
              }
            } else {
              // BCD has no support recorded (wfMilestone === null)
              if (minEmpVersion <= csMilestone) {
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
      aligned,
      bcdLagging,
      csStale,
      flagGaps,
      coarseMapping,
      noEmpiricalData,
      noBcdKeys
    };
  }
}
