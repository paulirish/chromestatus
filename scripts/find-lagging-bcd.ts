import process from 'process';
import fs from 'fs';
import path from 'path';

const projectRoot = process.cwd();
process.chdir('submodules/web-features');

console.log('Loading submodule web-features...');
const webFeatures = await import('../submodules/web-features/index.ts');

console.log('Reading ChromeStatus features...');
const featuresDir = path.resolve(projectRoot, 'data/features');
const files = fs.readdirSync(featuresDir).filter(f => f.endsWith('.json'));

const bcdLag: any[] = [];
const missingOrNoSupport: any[] = [];

for (const file of files) {
  const filePath = path.join(featuresDir, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Check if the feature is shipped/enabled on desktop
    const csMilestone = data.browsers?.chrome?.desktop;
    if (csMilestone && typeof csMilestone === 'number') {
      const symbol = data.web_feature?.trim();
      
      // If we have a web_feature mapping symbol
      if (symbol && symbol !== 'Missing feature' && symbol !== '') {
        const wfFeature = webFeatures.features[symbol];
        
        if (!wfFeature) {
          missingOrNoSupport.push({
            id: data.id,
            name: data.name,
            symbol,
            csMilestone,
            type: 'Missing Symbol'
          });
        } else {
          const wfChromeSupport = wfFeature.status?.support?.chrome;
          if (!wfChromeSupport) {
            missingOrNoSupport.push({
              id: data.id,
              name: data.name,
              symbol,
              csMilestone,
              type: 'No Chrome Support Listed'
            });
          } else {
            const wfMilestone = parseInt(wfChromeSupport, 10);
            if (!isNaN(wfMilestone)) {
              if (wfMilestone > csMilestone) {
                bcdLag.push({
                  id: data.id,
                  name: data.name,
                  symbol,
                  csMilestone,
                  wfMilestone
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    // Ignore invalid JSONs or read errors
  }
}

// Write markdown report
const artifactPath = '/Users/paulirish/.gemini/jetski/brain/a04bacf8-8001-4f02-9f38-44df4c3bbbe0/bcd_lag_report.md';

let markdown = `# Browser Compat Data (BCD) Lag Report\n\n`;
markdown += `This report compares ChromeStatus feature entries against the web-features (BCD) submodule database to identify lagging entries or missing support data.\n\n`;

markdown += `## 1. Milestone Lag (${bcdLag.length} features)\n`;
markdown += `Features that are marked as shipped in ChromeStatus at an earlier milestone than what is recorded in BCD/web-features:\n\n`;
markdown += `| Feature Name | Symbol | ChromeStatus Milestone | BCD/web-features Milestone | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of bcdLag) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | M${entry.csMilestone} | M${entry.wfMilestone} | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

markdown += `\n## 2. Missing/Unsupported in BCD (${missingOrNoSupport.length} features)\n`;
markdown += `Features marked as shipped in ChromeStatus, but have no Chrome support or symbol listed in BCD/web-features:\n\n`;
markdown += `| Feature Name | Symbol | ChromeStatus Milestone | Type | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of missingOrNoSupport) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | M${entry.csMilestone} | ${entry.type} | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

fs.writeFileSync(artifactPath, markdown);
console.log(`Saved report to ${artifactPath}`);
