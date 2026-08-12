import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { features } from 'web-features';

const projectRoot = process.cwd();

console.log('Scanning mdn-bcd-results for Windows Chrome Desktop support milestones...');

// Regex to match Chrome on Windows test result files:
// e.g. 10.20.6-chrome-109.0.0.0-windows-10-5172717864.json
const filenameRegex = /^[0-9.]+-chrome-([0-9.]+)-windows-[0-9a-zA-Z.-]+-[0-9a-f]+\.json$/;

interface ResultFile {
  filename: string;
  majorVersion: number;
  fullVersion: string;
}

interface EmpiricalSupport {
  majorVersion: number;
  fullVersion: string;
}

const bcdResultsDir = path.resolve(projectRoot, 'submodules/mdn-bcd-results');
const resultFiles: ResultFile[] = [];

if (fs.existsSync(bcdResultsDir)) {
  const allFiles = fs.readdirSync(bcdResultsDir);
  for (const filename of allFiles) {
    const match = filename.match(filenameRegex);
    if (match) {
      const fullVersion = match[1];
      const majorVersion = parseInt(fullVersion.split('.')[0], 10);
      resultFiles.push({ filename, majorVersion, fullVersion });
    }
  }
}

resultFiles.sort((a, b) => a.majorVersion - b.majorVersion);

const empiricalBcdSupportMap = new Map<string, EmpiricalSupport>();

console.log(`Parsing ${resultFiles.length} Windows Chrome Desktop test result files (M${resultFiles[0]?.majorVersion || '?'} to M${resultFiles[resultFiles.length - 1]?.majorVersion || '?'})...`);

for (const fileInfo of resultFiles) {
  const filePath = path.join(bcdResultsDir, fileInfo.filename);
  try {
    const contentText = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(contentText);
    if (data && data.results) {
      for (const testList of Object.values(data.results)) {
        if (Array.isArray(testList)) {
          for (const testEntry of testList) {
            if (testEntry && typeof testEntry.name === 'string' && testEntry.result === true) {
              const key = testEntry.name;
              // Since files are processed in ascending order of version,
              // the first time we see result: true is the earliest supported version!
              if (!empiricalBcdSupportMap.has(key)) {
                empiricalBcdSupportMap.set(key, {
                  majorVersion: fileInfo.majorVersion,
                  fullVersion: fileInfo.fullVersion
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error reading or parsing ${fileInfo.filename}:`, err);
  }
}

console.log(`Empirically mapped ${empiricalBcdSupportMap.size} BCD keys to their first passing Chrome Desktop version.`);

console.log('Reading ChromeStatus feature cache files...');
const csFeaturesDir = path.resolve(projectRoot, 'data/features');
const csFiles = fs.readdirSync(csFeaturesDir).filter(f => f.endsWith('.json'));

// Discrepancy groupings
const bcdLagging: any[] = [];
const csStale: any[] = [];
const flagGaps: any[] = [];
const aligned: any[] = [];
const noEmpiricalData: any[] = [];
const noBcdKeys: any[] = [];

for (const file of csFiles) {
  const filePath = path.join(csFeaturesDir, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Check if the feature is shipped/enabled on desktop
    const csMilestone = data.browsers?.chrome?.desktop;
    if (csMilestone && typeof csMilestone === 'number' && csMilestone > 108) {
      const symbol = data.web_feature?.trim();
      
      if (symbol && symbol !== 'Missing feature' && symbol !== '') {
        let wfFeature = features[symbol];
        if (wfFeature && wfFeature.kind === 'moved' && typeof wfFeature.redirect_target === 'string') {
          wfFeature = features[wfFeature.redirect_target];
        }
        
        if (wfFeature && wfFeature.kind === 'feature') {
          const wfChromeSupport = wfFeature.status?.support?.chrome;
          const wfMilestone = wfChromeSupport ? parseInt(wfChromeSupport, 10) : null;
          
          const keys = wfFeature.compat_features || [];
          if (keys.length === 0) {
            noBcdKeys.push({ id: data.id, name: data.name, symbol, csMilestone, wfMilestone });
            continue;
          }

          const keyResults = (keys as string[]).map((k: string) => {
            const emp = empiricalBcdSupportMap.get(k);
            return { key: k, version: emp ? emp.majorVersion : null };
          });

          const passedKeys = keyResults.filter((r: { key: string, version: number | null }) => r.version !== null);
          
          if (passedKeys.length === 0) {
            noEmpiricalData.push({
              id: data.id,
              name: data.name,
              symbol,
              csMilestone,
              wfMilestone,
              keys: keys.join(', ')
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

          const record = {
            id: data.id,
            name: data.name,
            symbol,
            csMilestone,
            wfMilestone: wfMilestone ? `M${wfMilestone}` : 'unsupported',
            empirical: `${empiricalDisplay}${displayNote}`,
            keys: keys.length > 3
              ? `${keys.slice(0, 3).join(', ')} ... (+${keys.length - 3} more)`
              : keys.join(', ')
          };

          // Categorize based on alignment
          if (wfMilestone !== null && !hasMismatch) {
            // Perfect match
            if (csMilestone === wfMilestone && wfMilestone === minEmpVersion) {
              aligned.push(record);
            }
            // BCD lagging ChromeStatus & Empirical
            else if (csMilestone === minEmpVersion && wfMilestone > minEmpVersion) {
              bcdLagging.push(record);
            }
            // ChromeStatus stale/wrong (BCD and Empirical align later)
            else if (wfMilestone === minEmpVersion && csMilestone < minEmpVersion) {
              csStale.push(record);
            }
            // Empirical is later than both (Flag gate or late test addition)
            else if (minEmpVersion > csMilestone && minEmpVersion > wfMilestone) {
              flagGaps.push(record);
            }
            // Other discrepancies
            else {
              bcdLagging.push({ ...record, empirical: `${empiricalDisplay}${displayNote} (complex mismatch)` });
            }
          } else {
            // Mismatch or unsupported in static BCD
            if (minEmpVersion <= csMilestone) {
              bcdLagging.push(record);
            } else {
              flagGaps.push(record);
            }
          }
        }
      }
    }
  } catch (err) {
    // Ignore invalid files
  }
}

// Generate the report
const artifactPath = '/Users/paulirish/.gemini/jetski/brain/53ae66da-7804-4064-adca-2daa45702e25/bcd_conformance_report.md';

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
