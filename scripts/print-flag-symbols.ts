import { ChromeStatusClient } from '../src/index.ts';

async function main() {
  const client = await ChromeStatusClient.create();
  
  console.log("==================================================================");
  console.log("   AUTHORITATIVE RUNTIME FLAG INVENTORY");
  console.log("==================================================================\n");

  const flagFeatures = client.getFlagFeatures();
  const mappedRecords = flagFeatures.filter(f => f.web_feature && f.web_feature.trim() !== '' && f.web_feature.toLowerCase() !== 'none' && f.web_feature !== 'Missing feature');
  const unmappedRecords = flagFeatures.filter(f => !f.web_feature || f.web_feature.trim() === '' || f.web_feature.toLowerCase() === 'none' || f.web_feature === 'Missing feature');

  const flagWebFeatureIds = client.getFlagWebFeatureIds();
  
  console.log(`[Section 1]: Verified Mapped Web Feature IDs (${flagWebFeatureIds.length} unique identifiers mapped across ${mappedRecords.length} feature records):\n`);
  console.log(JSON.stringify(flagWebFeatureIds, null, 2));
  
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
