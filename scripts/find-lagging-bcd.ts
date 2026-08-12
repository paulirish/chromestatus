import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { features } from 'web-features';

const projectRoot = process.cwd();

console.log('Loading web-features package...');

console.log('Reading ChromeStatus features...');
const featuresDir = path.resolve(projectRoot, 'data/features');
const files = fs.readdirSync(featuresDir).filter(f => f.endsWith('.json'));

const bcdLag: any[] = [];
const missingOrNoSupport: any[] = [];

// Helper to check if a symbol string is structured like a BCD path
function isBcdPath(symbol: string): boolean {
  const prefixes = ['api.', 'css.', 'html.', 'svg.', 'javascript.', 'http.'];
  return prefixes.some(p => symbol.startsWith(p));
}

for (const file of files) {
  const filePath = path.join(featuresDir, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Check if the feature is shipped/enabled on desktop
    const csMilestone = data.browsers?.chrome?.desktop;
    if (csMilestone && typeof csMilestone === 'number' && csMilestone > 120) {
      const symbol = data.web_feature?.trim();
      
      if (symbol && symbol !== 'Missing feature' && symbol !== '') {
        let wfFeature = features[symbol];
        if (wfFeature && wfFeature.kind === 'moved' && typeof wfFeature.redirect_target === 'string') {
          wfFeature = features[wfFeature.redirect_target];
        }
        
        if (!wfFeature) {
          missingOrNoSupport.push({
            id: data.id,
            name: data.name,
            symbol,
            csMilestone,
            type: 'Missing Symbol',
            matchingKeys: isBcdPath(symbol) ? symbol : 'N/A'
          });
        } else if (wfFeature.kind === 'feature') {
          const wfChromeSupport = wfFeature.status?.support?.chrome;
          if (!wfChromeSupport) {
            const compatFeatures = wfFeature.compat_features || [];
            missingOrNoSupport.push({
              id: data.id,
              name: data.name,
              symbol,
              csMilestone,
              type: 'No Chrome Support Listed',
              matchingKeys: compatFeatures.length > 3
                ? `${compatFeatures.slice(0, 3).join(', ')} ... (+${compatFeatures.length - 3} more)`
                : compatFeatures.join(', ') || 'N/A'
            });
          } else {
            const wfMilestone = parseInt(wfChromeSupport, 10);
            if (!isNaN(wfMilestone)) {
              if (wfMilestone > csMilestone) {
                // Find BCD keys matching the milestone
                const matchingKeys: string[] = [];
                const byCompatKey = wfFeature.status.by_compat_key as Record<string, { support: { chrome?: string } }> | undefined;
                if (byCompatKey) {
                  for (const [key, detail] of Object.entries(byCompatKey)) {
                    if (detail.support?.chrome === wfChromeSupport) {
                      matchingKeys.push(key);
                    }
                  }
                }
                
                bcdLag.push({
                  id: data.id,
                  name: data.name,
                  symbol,
                  csMilestone,
                  wfMilestone,
                  matchingKeys: matchingKeys.length > 3 
                    ? `${matchingKeys.slice(0, 3).join(', ')} ... (+${matchingKeys.length - 3} more)`
                    : matchingKeys.join(', ') || 'unknown'
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
markdown += `| Feature Name | Chrome Feature Symbol | ChromeStatus Milestone | BCD/web-features Milestone | BCD Key Source | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of bcdLag) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | M${entry.csMilestone} | M${entry.wfMilestone} | \`${entry.matchingKeys}\` | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

markdown += `\n## 2. Missing/Unsupported in BCD (${missingOrNoSupport.length} features)\n`;
markdown += `Features marked as shipped in ChromeStatus, but have no Chrome support or symbol listed in BCD/web-features:\n\n`;
markdown += `| Feature Name | Chrome Feature Symbol | ChromeStatus Milestone | Type | BCD Keys | Link |\n`;
markdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
for (const entry of missingOrNoSupport) {
  markdown += `| ${entry.name} | \`${entry.symbol}\` | M${entry.csMilestone} | ${entry.type} | \`${entry.matchingKeys}\` | [ChromeStatus](https://chromestatus.com/feature/${entry.id}) |\n`;
}

fs.writeFileSync(artifactPath, markdown);
console.log(`Saved report to ${artifactPath}`);
