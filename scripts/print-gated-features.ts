import { ChromeStatusClient } from '../src/index.ts';
import { features as webFeatures } from 'web-features';

function resolveWebFeatureBaselineYear(symbol: string): number | undefined {
  const webData: any = Object.hasOwn(webFeatures, symbol) ? webFeatures[symbol] : undefined;
  if (!webData) return undefined;

  let targetData = webData;
  if (webData.kind === 'moved' && typeof webData.redirect_target === 'string') {
    targetData = Object.hasOwn(webFeatures, webData.redirect_target) ? webFeatures[webData.redirect_target] : undefined;
  }

  if (targetData?.status?.baseline_low_date && typeof targetData.status.baseline_low_date === 'string') {
    const yearStr = targetData.status.baseline_low_date.split('-')[0];
    const y = parseInt(yearStr, 10);
    if (!isNaN(y)) return y;
  }
  return undefined;
}

async function main() {
  const client = await ChromeStatusClient.create();
  
  console.log("==================================================================");
  console.log("       GATED FEATURES INVENTORY & VALIDATION");
  console.log("==================================================================\n");

  const otStubs = client.getActiveOriginTrials();
  const flagStubs = client.getExperimentalFlagFeatures();

  const allGated = new Map<string, { name: string, type: string[], webFeature?: string, suspicious?: string }>();
  
  for (const f of otStubs) {
    allGated.set(f.name, { name: f.name, type: ['Origin Trial'], webFeature: f.web_feature });
  }
  
  for (const f of flagStubs) {
    const existing = allGated.get(f.name);
    if (existing) {
      existing.type.push('Experimental Flag');
    } else {
      allGated.set(f.name, { name: f.name, type: ['Experimental Flag'], webFeature: f.web_feature });
    }
  }
  
  const sortedGated = Array.from(allGated.values()).sort((a, b) => a.name.localeCompare(b.name));
  
  // Validation
  for (const item of sortedGated) {
    if (item.webFeature && item.webFeature !== 'Missing feature' && item.webFeature.toLowerCase() !== 'none') {
      const year = resolveWebFeatureBaselineYear(item.webFeature);
      if (year !== undefined && year < 2024) {
        item.suspicious = `Yes (Shipped ${year})`;
      }
    }
  }

  console.log('| Feature Name | Gated By | Web Feature ID | Suspicious (Old)? |');
  console.log('| :--- | :--- | :--- | :--- |');
  
  for (const item of sortedGated) {
    const webFeatureStr = item.webFeature && item.webFeature !== 'Missing feature' && item.webFeature.toLowerCase() !== 'none'
      ? `\`${item.webFeature}\``
      : 'Unmapped';
    console.log(`| ${item.name} | ${item.type.join(', ')} | ${webFeatureStr} | ${item.suspicious ?? 'No'} |`);
  }
  
  const suspiciousItems = sortedGated.filter(item => item.suspicious);
  if (suspiciousItems.length > 0) {
    console.log(`\n⚠️ Found ${suspiciousItems.length} suspicious items that appear to have shipped long ago.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
