import { ChromeStatusClient } from '../src/index.ts';
import fs from 'node:fs/promises';

async function main() {
  if (process.argv.includes('--json')) {
    try {
      const mappingPath = new URL('../data/ot-mapping.json', import.meta.url);
      const content = await fs.readFile(mappingPath, 'utf8');
      console.log(content);
    } catch (err) {
      console.error("Error reading data/ot-mapping.json. Ensure data is compiled.");
      process.exit(1);
    }
    return;
  }

  const client = await ChromeStatusClient.create();
  
  console.log("==================================================================");
  console.log("       AUTHORITATIVE ACTIVE ORIGIN TRIAL INVENTORY");
  console.log("==================================================================\n");

  const activeFeatures = client.getActiveOriginTrials();
  const mappedRecords = activeFeatures.filter(f => f.web_feature && f.web_feature.trim() !== '' && f.web_feature.toLowerCase() !== 'none' && f.web_feature !== 'Missing feature');
  const unmappedRecords = activeFeatures.filter(f => !f.web_feature || f.web_feature.trim() === '' || f.web_feature.toLowerCase() === 'none' || f.web_feature === 'Missing feature');

  const activeWebFeatureIds = client.getActiveOriginTrialWebFeatureIds();
  
  console.log(`[Section 1]: Verified Mapped Web Feature IDs (${activeWebFeatureIds.length} unique identifiers mapped across ${mappedRecords.length} feature records):\n`);
  console.log(JSON.stringify(activeWebFeatureIds, null, 2));
  
  console.log(`\n------------------------------------------------------------------\n`);
  
  console.log(`[Section 2]: Unmapped Granular Platform Extensions (${unmappedRecords.length} specific features currently lacking dedicated web feature IDs):\n`);
  for (const f of unmappedRecords) {
    console.log(`- ${f.name}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
