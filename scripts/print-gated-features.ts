import { ChromeStatusClient } from '../src/index.ts';

async function main() {
  const client = await ChromeStatusClient.create();
  
  console.log("==================================================================");
  console.log("       GATED FEATURES INVENTORY & VALIDATION");
  console.log("==================================================================\n");

  const inventory = client.getGatedFeaturesInventory();

  console.log('| Feature Name | Gated By | Web Feature ID | Suspicious (Old)? |');
  console.log('| :--- | :--- | :--- | :--- |');
  
  let suspiciousCount = 0;
  for (const item of inventory) {
    const webFeatureStr = item.webFeatureId ? `\`${item.webFeatureId}\`` : 'Unmapped';
    const suspicious = item.baselineYear !== undefined && item.baselineYear < 2024 ? `Yes (Shipped ${item.baselineYear})` : 'No';
    if (suspicious !== 'No') suspiciousCount++;
    
    console.log(`| ${item.name} | ${item.gatedBy.join(', ')} | ${webFeatureStr} | ${suspicious} |`);
  }
  
  if (suspiciousCount > 0) {
    console.log(`\n⚠️ Found ${suspiciousCount} suspicious items that appear to have shipped long ago.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
