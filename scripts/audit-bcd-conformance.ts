import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { CollectorResultsIndex } from '../src/collector-results-index.ts';
import { ConformanceAuditor } from '../src/conformance.ts';
import type { ChromeStatusFeatureVerbose } from '../src/types.ts';

const projectRoot = process.cwd();

console.log('Scanning mdn-bcd-results for Windows Chrome Desktop support milestones...');
const bcdResultsDir = path.resolve(projectRoot, 'submodules/mdn-bcd-results');
const collectorIndex = CollectorResultsIndex.loadFromDir(bcdResultsDir);

console.log('Reading ChromeStatus feature cache files...');
const csFeaturesDir = path.resolve(projectRoot, 'data/features');
const csFiles = fs.readdirSync(csFeaturesDir).filter(f => f.endsWith('.json'));

const featuresList: ChromeStatusFeatureVerbose[] = [];
for (const file of csFiles) {
  const filePath = path.join(csFeaturesDir, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    featuresList.push(data);
  } catch {
    // Ignore invalid files
  }
}

console.log(`Loaded ${featuresList.length} features. Running conformance audit...`);
const auditor = new ConformanceAuditor(collectorIndex);
const auditResult = auditor.audit(featuresList);

const { conformant, bcdLagging, csStale, flagGaps, coarseMapping, noCollectorData, noBcdKeys } = auditResult;

// Generate the report
const artifactPath = path.resolve(projectRoot, 'bcd_conformance_report.md');

let markdown = `# BCD and ChromeStatus Conformance Audit Report\n\n`;
markdown += `This report analyzes the alignment between **ChromeStatus** milestones, **static BCD (web-features)** support records, and **Collector test results** (compiled chronologically from \`mdn-bcd-results\` browser tests for Chrome Desktop on Windows).\n\n`;

const totalAudited = conformant.length + bcdLagging.length + csStale.length + flagGaps.length + coarseMapping.length + noCollectorData.length + noBcdKeys.length;

markdown += `## Summary Metrics\n\n`;
markdown += `- **Total Features Audited**: ${totalAudited}\n`;
markdown += `- **Conformant** (CS = BCD = Collector): ${conformant.length}\n`;
markdown += `- **Static BCD Lagging** (Collector passes at CS milestone, BCD is later): ${bcdLagging.length}\n`;
markdown += `- **ChromeStatus Stale** (Collector passes at BCD milestone, CS is earlier/incorrect): ${csStale.length}\n`;
markdown += `- **Coarse Mapping** (BCD milestone is earlier than Collector tests due to shared broad web feature ID): ${coarseMapping.length}\n`;
markdown += `- **Flag Gaps / Collector Late Tests** (Collector tests pass later than CS & BCD records): ${flagGaps.length}\n`;
markdown += `- **No Collector Test Data** (BCD keys present but none passed in collector logs): ${noCollectorData.length}\n`;
markdown += `- **No BCD Keys Mapped** (web feature ID exists but has no BCD compat keys): ${noBcdKeys.length}\n\n`;

markdown += `---\n\n`;

markdown += `## 1. Static BCD Lagging (${bcdLagging.length} features)\n`;
markdown += `Features where Collector test results match the ChromeStatus milestone, indicating that the static BCD entry needs to be updated to match the earlier support version:\n\n`;
for (const entry of bcdLagging.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `- **${entry.name}** (\`${entry.webFeatureId}\`)\n`;
  markdown += `  * Milestones: CS \`M${entry.csMilestone}\` • BCD \`${entry.wfMilestone}\` • Collector **${entry.collector}**\n`;
  markdown += `  * Keys: \`${entry.keys}\` — [ChromeStatus](https://chromestatus.com/feature/${entry.id})\n`;
}

markdown += `\n## 2. ChromeStatus Stale (${csStale.length} features)\n`;
markdown += `Features where Collector test results align with BCD, indicating ChromeStatus records an earlier milestone than when it actually shipped/passed tests:\n\n`;
for (const entry of csStale.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `- **${entry.name}** (\`${entry.webFeatureId}\`)\n`;
  markdown += `  * Milestones: CS **M${entry.csMilestone}** • BCD \`${entry.wfMilestone}\` • Collector \`${entry.collector}\`\n`;
  markdown += `  * Keys: \`${entry.keys}\` — [ChromeStatus](https://chromestatus.com/feature/${entry.id})\n`;
}

markdown += `\n## 3. Coarse Mapping (${coarseMapping.length} features)\n`;
markdown += `Features where the static BCD / web feature entry uses a broad web feature ID mapped to an earlier release milestone, making the sub-feature appear supported earlier than when the Collector test suite first recorded passes:\n\n`;
for (const entry of coarseMapping.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `- **${entry.name}** (\`${entry.webFeatureId}\`)\n`;
  markdown += `  * Milestones: CS \`M${entry.csMilestone}\` • BCD \`${entry.wfMilestone}\` • Collector **${entry.collector}**\n`;
  markdown += `  * Keys: \`${entry.keys}\` — [ChromeStatus](https://chromestatus.com/feature/${entry.id})\n`;
}

markdown += `\n## 4. Flag Gating or Late Test Gaps (${flagGaps.length} features)\n`;
markdown += `Features where Collector tests passed *later* than both ChromeStatus and BCD records. This typically suggests the feature was initially behind a flag (and the test collector ran without the flag), or that test cases were only added to the collector at a later version:\n\n`;
for (const entry of flagGaps.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `- **${entry.name}** (\`${entry.webFeatureId}\`)\n`;
  markdown += `  * Milestones: CS \`M${entry.csMilestone}\` • BCD \`${entry.wfMilestone}\` • Collector **${entry.collector}**\n`;
  markdown += `  * Keys: \`${entry.keys}\` — [ChromeStatus](https://chromestatus.com/feature/${entry.id})\n`;
}

markdown += `\n## 5. No Collector Test Data (${noCollectorData.length} features)\n`;
markdown += `Features that have mapped BCD keys, but none of those keys have passing results in the collector logs:\n\n`;
for (const entry of noCollectorData.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `- **${entry.name}** (\`${entry.webFeatureId}\`)\n`;
  markdown += `  * Milestones: CS \`M${entry.csMilestone}\` • BCD \`${entry.wfMilestone ? `M${entry.wfMilestone}` : 'unsupported'}\`\n`;
  markdown += `  * Keys: \`${entry.keys}\` — [ChromeStatus](https://chromestatus.com/feature/${entry.id})\n`;
}

markdown += `\n## 6. No BCD Keys Mapped (${noBcdKeys.length} features)\n`;
markdown += `Features that are mapped to a web feature ID, but that ID contains no BCD compat keys:\n\n`;
for (const entry of noBcdKeys.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `- **${entry.name}** (\`${entry.webFeatureId}\`)\n`;
  markdown += `  * Milestones: CS \`M${entry.csMilestone}\` • BCD \`${entry.wfMilestone ? `M${entry.wfMilestone}` : 'unsupported'}\` — [ChromeStatus](https://chromestatus.com/feature/${entry.id})\n`;
}

fs.writeFileSync(artifactPath, markdown);
console.log(`Saved BCD conformance report to ${artifactPath}`);
