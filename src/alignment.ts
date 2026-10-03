import { features as webFeatures } from 'web-features';
import type { ChromeStatusFeatureBasic } from './types.ts';

export interface AlignmentReport {
  orphans: { featureId: number; featureName: string; webFeatureId: string }[];
  redirects: { featureId: number; featureName: string; fromWebFeatureId: string; kind: 'moved' | 'split'; target: string | string[] }[];
  milestoneDrift: { featureId: number; featureName: string; webFeatureId: string; csMilestone: string; wfMilestone: string }[];
  collisions: { webFeatureId: string; featureIds: number[]; featureNames: string[] }[];
}

export class AlignmentAuditor {
  static run(features: ChromeStatusFeatureBasic[]): AlignmentReport {
    const candidateFeatures = features.filter(f => 
      f.web_feature && typeof f.web_feature === 'string' && f.web_feature.trim() !== '' && f.web_feature !== 'Missing feature'
    );

    const report: AlignmentReport = {
      orphans: [],
      redirects: [],
      milestoneDrift: [],
      collisions: []
    };

    const webFeatureIdGroupings = new Map<string, ChromeStatusFeatureBasic[]>();

    for (const feature of candidateFeatures) {
      const webFeatureId = feature.web_feature!.trim();
      
      if (!webFeatureIdGroupings.has(webFeatureId)) {
        webFeatureIdGroupings.set(webFeatureId, []);
      }
      webFeatureIdGroupings.get(webFeatureId)!.push(feature);

      // Heuristic 1: Orphaned / Dead Identifiers
      if (!Object.hasOwn(webFeatures, webFeatureId)) {
        report.orphans.push({
          featureId: feature.id,
          featureName: feature.name,
          webFeatureId
        });
        continue;
      }

      const webData: any = webFeatures[webFeatureId];

      // Heuristic 2: Stale / Redirected Identifiers
      if (webData?.kind === 'moved') {
        report.redirects.push({
          featureId: feature.id,
          featureName: feature.name,
          fromWebFeatureId: webFeatureId,
          kind: 'moved',
          target: webData.redirect_target
        });
      } else if (webData?.kind === 'split') {
        report.redirects.push({
          featureId: feature.id,
          featureName: feature.name,
          fromWebFeatureId: webFeatureId,
          kind: 'split',
          target: webData.redirect_targets
        });
      }

      // Heuristic 3: Temporal Implementation Divergence
      const csMilestoneStr = feature.browsers?.chrome?.status?.text || '';
      const wfSupportChrome = webData?.status?.support?.chrome;
      if (wfSupportChrome && typeof wfSupportChrome === 'string') {
        const wfM = parseInt(wfSupportChrome, 10);
        const csMatch = csMilestoneStr.match(/\b(\d{2,3})\b/);
        if (csMatch && csMatch[1] && !isNaN(wfM)) {
          const csM = parseInt(csMatch[1], 10);
          if (Math.abs(csM - wfM) > 4) {
            report.milestoneDrift.push({
              featureId: feature.id,
              featureName: feature.name,
              webFeatureId,
              csMilestone: `M${csM}`,
              wfMilestone: `M${wfM}`
            });
          }
        }
      }
    }

    // Heuristic 4: Capability Collisions
    for (const [webFeatureId, list] of webFeatureIdGroupings) {
      if (list.length > 1) {
        report.collisions.push({
          webFeatureId,
          featureIds: list.map(f => f.id),
          featureNames: list.map(f => f.name)
        });
      }
    }

    report.orphans.sort((a, b) => a.webFeatureId.localeCompare(b.webFeatureId));
    report.redirects.sort((a, b) => a.fromWebFeatureId.localeCompare(b.fromWebFeatureId));
    report.milestoneDrift.sort((a, b) => a.webFeatureId.localeCompare(b.webFeatureId));
    report.collisions.sort((a, b) => b.featureIds.length - a.featureIds.length);

    return report;
  }
}
