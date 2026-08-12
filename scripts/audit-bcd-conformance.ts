import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { EmpiricalSupportIndex } from '../src/empirical-index.ts';
import { ConformanceAuditor } from '../src/conformance.ts';
import type { ChromeStatusFeatureDetailed } from '../src/types.ts';

const projectRoot = process.cwd();

console.log('Scanning mdn-bcd-results for Windows Chrome Desktop support milestones...');
const bcdResultsDir = path.resolve(projectRoot, 'submodules/mdn-bcd-results');
const empiricalIndex = EmpiricalSupportIndex.loadFromDir(bcdResultsDir);

console.log('Reading ChromeStatus feature cache files...');
const csFeaturesDir = path.resolve(projectRoot, 'data/features');
const csFiles = fs.readdirSync(csFeaturesDir).filter(f => f.endsWith('.json'));

const featuresList: ChromeStatusFeatureDetailed[] = [];
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
const auditor = new ConformanceAuditor(empiricalIndex);
const auditResult = auditor.audit(featuresList);

const { aligned, bcdLagging, csStale, flagGaps, noEmpiricalData, noBcdKeys } = auditResult;

// Generate the report
const artifactPath = path.resolve(projectRoot, 'bcd_conformance_report.md');

let markdown = `# BCD and ChromeStatus Conformance Audit Report\n\n`;
markdown += `This report analyzes the alignment between **ChromeStatus** milestones, **static BCD (web-features)** support records, and **empirical browser test results** (compiled from \`mdn-bcd-results\` for Chrome Desktop on Windows).\n\n`;

const totalAudited = aligned.length + bcdLagging.length + csStale.length + flagGaps.length + noEmpiricalData.length + noBcdKeys.length;

markdown += `## Summary Metrics\n\n`;
markdown += `- **Total Features Audited**: ${totalAudited}\n`;
markdown += `- **Perfect Conformance** (CS = BCD = Empirical): ${aligned.length}\n`;
markdown += `- **Static BCD Lagging** (Empirical passes at CS milestone, BCD is later): ${bcdLagging.length}\n`;
markdown += `- **ChromeStatus Stale** (Empirical passes at BCD milestone, CS is earlier/incorrect): ${csStale.length}\n`;
markdown += `- **Flag Gaps / Collector Late Tests** (Empirical tests pass later than CS & BCD records): ${flagGaps.length}\n`;
markdown += `- **No Empirical Test Data** (BCD keys present but none passed in collector logs): ${noEmpiricalData.length}\n`;
markdown += `- **No BCD Keys Mapped** (WebDX symbol exists but has no BCD compat keys): ${noBcdKeys.length}\n\n`;

markdown += `---\n\n`;

markdown += `## 1. Static BCD Lagging (${bcdLagging.length} features)\n`;
markdown += `Features where empirical test results match the ChromeStatus milestone, indicating that the static BCD entry needs to be updated to match the earlier support version:\n\n`;
markdown += `| Feature Name | Symbol | CS Milestone | Static BCD | Empirical Passing | BCD Keys | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of bcdLagging.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | M${entry.csMilestone} | ${entry.wfMilestone} | **${entry.empirical}** | \`${entry.keys}\` | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

markdown += `\n## 2. ChromeStatus Stale (${csStale.length} features)\n`;
markdown += `Features where empirical test results align with BCD, indicating ChromeStatus records an earlier milestone than when it actually shipped/passed tests:\n\n`;
markdown += `| Feature Name | Symbol | CS Milestone | Static BCD | Empirical Passing | BCD Keys | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of csStale.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | **M${entry.csMilestone}** | ${entry.wfMilestone} | ${entry.empirical} | \`${entry.keys}\` | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

markdown += `\n## 3. Flag Gating or Late Test Gaps (${flagGaps.length} features)\n`;
markdown += `Features where empirical tests passed *later* than both ChromeStatus and BCD records. This typically suggests the feature was initially flag-gated (and the test collector ran without the flag), or that test cases were only added to the collector at a later version:\n\n`;
markdown += `| Feature Name | Symbol | CS Milestone | Static BCD | Empirical Passing | BCD Keys | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of flagGaps.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | M${entry.csMilestone} | ${entry.wfMilestone} | **${entry.empirical}** | \`${entry.keys}\` | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

markdown += `\n## 4. No Empirical Test Data (${noEmpiricalData.length} features)\n`;
markdown += `Features that have mapped BCD keys, but none of those keys have passing results in the collector logs:\n\n`;
markdown += `| Feature Name | Symbol | CS Milestone | Static BCD | BCD Keys | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of noEmpiricalData.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | M${entry.csMilestone} | ${entry.wfMilestone ? `M${entry.wfMilestone}` : 'unsupported'} | \`${entry.keys}\` | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

markdown += `\n## 5. No BCD Keys Mapped (${noBcdKeys.length} features)\n`;
markdown += `Features that are mapped to a WebDX symbol, but that symbol contains no BCD compat keys:\n\n`;
markdown += `| Feature Name | Symbol | CS Milestone | Static BCD | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of noBcdKeys.sort((a, b) => a.name.localeCompare(b.name))) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | M${entry.csMilestone} | ${entry.wfMilestone ? `M${entry.wfMilestone}` : 'unsupported'} | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

fs.writeFileSync(artifactPath, markdown);
console.log(`Saved BCD conformance report to ${artifactPath}`);
