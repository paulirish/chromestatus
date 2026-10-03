import fs from 'node:fs';
import path from 'node:path';
import { CollectorResultsIndex } from '../src/collector-results-index.ts';
import { ConformanceAuditor, type ConformanceBucket, type ConformanceRecord } from '../src/conformance.ts';
import type { ChromeStatusFeatureVerbose } from '../src/types.ts';

/** Writes bcd_conformance_report.md: ChromeStatus milestones vs web-features support vs mdn-bcd-results collector results. */
const projectRoot = process.cwd();
const collectorIndex = CollectorResultsIndex.loadFromDir(path.resolve(projectRoot, 'submodules/mdn-bcd-results'));

const featuresDir = path.resolve(projectRoot, 'data/features');
const features: ChromeStatusFeatureVerbose[] = fs.readdirSync(featuresDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(featuresDir, f), 'utf8')));

const result = new ConformanceAuditor(collectorIndex).audit(features);

const SECTIONS: ReadonlyArray<{ bucket: ConformanceBucket; title: string; summary: string; description: string }> = [
  { bucket: 'bcdLagging', title: 'Static BCD Lagging', summary: 'Collector passes at CS milestone, BCD is later',
    description: 'Features where Collector test results match the ChromeStatus milestone, indicating that the static BCD entry needs to be updated to match the earlier support version.' },
  { bucket: 'csStale', title: 'ChromeStatus Stale', summary: 'Collector passes at BCD milestone, CS is earlier/incorrect',
    description: 'Features where Collector test results align with BCD, indicating ChromeStatus records a different milestone than when it actually shipped/passed tests.' },
  { bucket: 'coarseMapping', title: 'Coarse Mapping', summary: 'BCD milestone is earlier than Collector tests due to shared broad web feature ID',
    description: 'Features where the static BCD / web feature entry uses a broad web feature ID mapped to an earlier release milestone, making the sub-feature appear supported earlier than when the Collector test suite first recorded passes.' },
  { bucket: 'flagGaps', title: 'Flag Gating or Late Test Gaps', summary: 'Collector tests pass later than CS & BCD records',
    description: 'Features where Collector tests passed *later* than ChromeStatus and BCD has no support recorded. This typically suggests the feature was initially behind a flag (and the test collector ran without the flag), or that test cases were only added to the collector at a later version.' },
  { bucket: 'noCollectorData', title: 'No Collector Test Data', summary: 'BCD keys present but none passed in collector logs',
    description: 'Features that have mapped BCD keys, but none of those keys have passing results in the collector logs.' },
  { bucket: 'noBcdKeys', title: 'No BCD Keys Mapped', summary: 'web feature ID exists but has no BCD compat keys',
    description: 'Features that are mapped to a web feature ID, but that ID contains no BCD compat keys.' },
];

function entry(r: ConformanceRecord, bucket: ConformanceBucket): string {
  const link = `[ChromeStatus](https://chromestatus.com/feature/${r.id})`;
  const collector = bucket === 'noCollectorData' || bucket === 'noBcdKeys' ? '' : ` • Collector **${r.collector}**`;
  const keys = r.keys ? `  * Keys: \`${r.keys}\` — ${link}` : `  * ${link}`;
  return `- **${r.name}** (\`${r.webFeatureId}\`)\n  * Milestones: CS \`M${r.csMilestone}\` • BCD \`${r.wfMilestone}\`${collector}\n${keys}\n`;
}

const total = Object.values(result).reduce((n, records) => n + records.length, 0);
let markdown = `# BCD and ChromeStatus Conformance Audit Report

This report analyzes the alignment between **ChromeStatus** milestones, **static BCD (web-features)** support records, and **Collector test results** (compiled chronologically from \`mdn-bcd-results\` browser tests for Chrome Desktop on Windows).

## Summary Metrics

- **Total Features Audited**: ${total}
- **Conformant** (CS = BCD = Collector): ${result.conformant.length}
${SECTIONS.map(s => `- **${s.title}** (${s.summary}): ${result[s.bucket].length}`).join('\n')}

---
`;
SECTIONS.forEach((s, i) => {
  const records = result[s.bucket].toSorted((a, b) => a.name.localeCompare(b.name));
  markdown += `\n## ${i + 1}. ${s.title} (${records.length} features)\n${s.description}\n\n${records.map(r => entry(r, s.bucket)).join('')}`;
});

const reportPath = path.resolve(projectRoot, 'bcd_conformance_report.md');
fs.writeFileSync(reportPath, markdown);
console.log(`Audited ${features.length} features. Saved BCD conformance report to ${reportPath}`);
