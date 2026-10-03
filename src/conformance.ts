import { features as webFeatures } from 'web-features';
import type { ChromeStatusFeatureVerbose } from './types.ts';
import type { CollectorResultsIndex } from './collector-results-index.ts';
import { tokenize } from './text-analyzer.ts';

export type ConformanceBucket = 'conformant' | 'bcdLagging' | 'csStale' | 'flagGaps' | 'coarseMapping' | 'noCollectorData' | 'noBcdKeys';

export interface ConformanceRecord {
  id: number;
  name: string;
  webFeatureId: string;
  csMilestone: number;
  /** `M<n>` from web-features `status.support.chrome`, or 'unsupported'. */
  wfMilestone: string;
  collector: string;
  keys: string;
}

export type ConformanceAuditResult = Record<ConformanceBucket, ConformanceRecord[]>;

/** Only features ChromeStatus says shipped on desktop after this milestone are audited; collector results start at M109. */
const FIRST_COLLECTOR_MILESTONE = 108;

function keysMentioning(keys: string[], text: string): string[] {
  const tokens = [...tokenize(text)];
  return keys.filter(key => tokens.some(t => key.toLowerCase().includes(t)));
}

/** Narrows a web feature's BCD keys to those named by the ChromeStatus feature's name, else its summary, else all. */
function filterRelevantBcdKeys(keys: string[], csName: string, csSummary: string): string[] {
  if (tokenize(csName).size === 0) return keys;
  const byName = keysMentioning(keys, csName);
  if (byName.length) return byName;
  const bySummary = keysMentioning(keys, csSummary);
  return bySummary.length ? bySummary : keys;
}

/** Buckets a feature by how ChromeStatus (cs), web-features (wf), and the collector's earliest passing milestone relate. */
export function classifyConformance(cs: number, wf: number | null, minCollector: number): ConformanceBucket {
  if (wf === null) return minCollector <= cs ? 'bcdLagging' : 'flagGaps';
  if (wf < minCollector) return 'coarseMapping';
  if (cs === wf) return 'conformant';
  if (minCollector <= cs && cs < wf) return 'bcdLagging';
  return 'csStale';
}

function abbreviate(keys: string[], shown: number): string {
  return keys.length > shown ? `${keys.slice(0, shown).join(', ')} (+${keys.length - shown} more)` : keys.join(', ');
}

/**
 * Features without collector evidence (no collector data or no BCD keys) where ChromeStatus and web-features
 * disagree on the shipping milestone. Without collector results, the report can't say which source is wrong.
 */
export function findMilestoneDrift(result: Pick<ConformanceAuditResult, 'noCollectorData' | 'noBcdKeys'>): ConformanceRecord[] {
  return [...result.noCollectorData, ...result.noBcdKeys].filter(r => r.wfMilestone !== `M${r.csMilestone}`);
}

/** Compares ChromeStatus shipping milestones with web-features support data and collector results from mdn-bcd-results. */
export class ConformanceAuditor {
  private readonly collectorIndex: CollectorResultsIndex;
  constructor(collectorIndex: CollectorResultsIndex) {
    this.collectorIndex = collectorIndex;
  }

  audit(features: ReadonlyArray<ChromeStatusFeatureVerbose>): ConformanceAuditResult {
    const result: ConformanceAuditResult = {
      conformant: [], bcdLagging: [], csStale: [], flagGaps: [], coarseMapping: [], noCollectorData: [], noBcdKeys: [],
    };

    for (const feature of features) {
      const csMilestone = feature.browsers.chrome.desktop;
      if (typeof csMilestone !== 'number' || csMilestone <= FIRST_COLLECTOR_MILESTONE) continue;

      for (const webFeatureId of feature.web_feature_ids) {
        const wf = Object.hasOwn(webFeatures, webFeatureId) ? webFeatures[webFeatureId] : undefined;
        if (wf?.kind !== 'feature') continue;

        // Support values can be ranged, e.g. "≤80".
        const wfSupport = wf.status.support.chrome?.match(/\d+/)?.[0];
        const wfMilestone = wfSupport ? Number(wfSupport) : null;
        const base = { id: feature.id, name: feature.name, webFeatureId, csMilestone, wfMilestone: wfMilestone ? `M${wfMilestone}` : 'unsupported' };

        const allKeys = wf.compat_features ?? [];
        if (!allKeys.length) {
          result.noBcdKeys.push({ ...base, collector: 'N/A', keys: '' });
          continue;
        }

        const keys = filterRelevantBcdKeys(allKeys, feature.name, feature.summary);
        const passed = keys.flatMap(k => this.collectorIndex.getSupport(k)?.majorVersion ?? []);
        if (!passed.length) {
          result.noCollectorData.push({ ...base, collector: 'No collector data', keys: abbreviate(keys, 3) });
          continue;
        }

        const min = Math.min(...passed);
        const max = Math.max(...passed);
        const range = min === max ? `M${min}` : `M${min} - M${max}`;
        const note = min !== max ? ` (Key mismatch: ${passed.length}/${keys.length} pass)`
          : passed.length < keys.length ? ` (Partial: ${passed.length}/${keys.length} pass)` : '';
        result[classifyConformance(csMilestone, wfMilestone, min)].push({ ...base, collector: range + note, keys: abbreviate(keys, 1) });
      }
    }
    return result;
  }
}
