import fs from 'node:fs/promises';
import path from 'node:path';
import { AlignmentAuditor } from '../src/alignment.ts';
import type { ChromeStatusFeatureBasic } from '../src/types.ts';

async function main() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const basicPath = path.join(dataDir, 'basic.json');
  
  let features: ChromeStatusFeatureBasic[] = [];
  try {
    const text = await fs.readFile(basicPath, 'utf8');
    features = JSON.parse(text);
  } catch {
    console.error('Error: Compiled snapshot data/basic.json not found. Run compilation first.');
    process.exit(1);
  }

  console.log(`Loaded ${features.length} basic features. Running web-features alignment audit...`);
  const report = AlignmentAuditor.run(features);

  console.log("==================================================================");
  console.log("   WEB-FEATURES SYSTEMATIC ALIGNMENT AUDIT REPORT");
  console.log("==================================================================\n");
  
  console.log(`[Heuristic 1]: Orphaned/Dead Identifiers Detected: ${report.orphans.length}`);
  console.log(`[Heuristic 2]: Stale/Redirected Web Feature IDs Detected: ${report.redirects.length}`);
  console.log(`[Heuristic 3]: Milestone Divergence Drift Detected: ${report.milestoneDrift.length}`);
  console.log(`[Heuristic 4]: Multi-Mapping Capability Collisions Detected: ${report.collisions.length}\n`);

  const reportPath = path.join(dataDir, 'web-features-alignment-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Saved granular programmatic audit report to data/web-features-alignment-report.json`);
}

main().catch(err => console.error(err));
