import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import type { ChromeStatusFeatureStub } from '../src/types.ts';

interface AuditReport {
  orphans: { featureId: number; featureName: string; staleSymbol: string }[];
  redirects: { featureId: number; featureName: string; fromSymbol: string; kind: string; target: string | string[] }[];
  milestoneDrift: { featureId: number; featureName: string; symbol: string; csMilestone: string; wfMilestone: string }[];
  collisions: { symbol: string; featureIds: number[]; featureNames: string[] }[];
}

async function main() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const litePath = path.join(dataDir, 'lite.json');
  
  let stubs: ChromeStatusFeatureStub[] = [];
  try {
    const text = await fs.readFile(litePath, 'utf8');
    stubs = JSON.parse(text);
  } catch {
    console.error('Error: Compiled snapshot data/lite.json not found. Run compilation first.');
    process.exit(1);
  }

  const candidateStubs = stubs.filter(f => 
    f.web_feature && typeof f.web_feature === 'string' && f.web_feature.trim() !== '' && f.web_feature !== 'Missing feature'
  );

  const report: AuditReport = {
    orphans: [],
    redirects: [],
    milestoneDrift: [],
    collisions: []
  };

  const symbolGroupings = new Map<string, ChromeStatusFeatureStub[]>();

  for (const feature of candidateStubs) {
    const symbol = feature.web_feature!.trim();
    
    if (!symbolGroupings.has(symbol)) {
      symbolGroupings.set(symbol, []);
    }
    symbolGroupings.get(symbol)!.push(feature);

    // Heuristic 1: Orphaned / Dead Identifiers
    if (!Object.hasOwn(webFeatures, symbol)) {
      report.orphans.push({
        featureId: feature.id,
        featureName: feature.name,
        staleSymbol: symbol
      });
      continue;
    }

    const webData: any = webFeatures[symbol];

    // Heuristic 2: Stale / Redirected Identifiers
    if (webData?.kind === 'moved') {
      report.redirects.push({
        featureId: feature.id,
        featureName: feature.name,
        fromSymbol: symbol,
        kind: 'moved',
        target: webData.redirect_target
      });
    } else if (webData?.kind === 'split') {
      report.redirects.push({
        featureId: feature.id,
        featureName: feature.name,
        fromSymbol: symbol,
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
            symbol,
            csMilestone: `M${csM}`,
            wfMilestone: `M${wfM}`
          });
        }
      }
    }
  }

  // Heuristic 4: Capability Collisions
  for (const [symbol, list] of symbolGroupings) {
    if (list.length > 1) {
      report.collisions.push({
        symbol,
        featureIds: list.map(f => f.id),
        featureNames: list.map(f => f.name)
      });
    }
  }

  report.orphans.sort((a, b) => a.staleSymbol.localeCompare(b.staleSymbol));
  report.redirects.sort((a, b) => a.fromSymbol.localeCompare(b.fromSymbol));
  report.milestoneDrift.sort((a, b) => a.symbol.localeCompare(b.symbol));
  report.collisions.sort((a, b) => b.featureIds.length - a.featureIds.length);

  console.log("==================================================================");
  console.log("   WEB-FEATURES SYSTEMATIC ALIGNMENT AUDIT REPORT");
  console.log("==================================================================\n");
  
  console.log(`[Heuristic 1]: Orphaned/Dead Identifiers Detected: ${report.orphans.length}`);
  console.log(`[Heuristic 2]: Stale/Redirected Symbols Detected: ${report.redirects.length}`);
  console.log(`[Heuristic 3]: Milestone Divergence Drift Detected: ${report.milestoneDrift.length}`);
  console.log(`[Heuristic 4]: Multi-Mapping Capability Collisions Detected: ${report.collisions.length}\n`);

  const reportPath = path.join(dataDir, 'web-features-alignment-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Saved granular programmatic audit report to data/web-features-alignment-report.json`);
}

main().catch(err => console.error(err));
