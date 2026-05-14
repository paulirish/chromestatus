import { ChromeStatusClient } from '../src/index.ts';

async function main() {
  const client = await ChromeStatusClient.create();
  
  console.log("==================================================================");
  console.log("   AUTHORITATIVE EXPERIMENTAL WEB PLATFORM FLAG INVENTORY");
  console.log("==================================================================\n");

  const flagStubs = client.getExperimentalFlagFeatures();
  const mappedRecords = flagStubs.filter(f => f.web_feature && f.web_feature.trim() !== '' && f.web_feature.toLowerCase() !== 'none' && f.web_feature !== 'Missing feature');
  const unmappedRecords = flagStubs.filter(f => !f.web_feature || f.web_feature.trim() === '' || f.web_feature.toLowerCase() === 'none' || f.web_feature === 'Missing feature');

  const flagSymbols = client.getExperimentalFlagWebFeatureIds();
  
  console.log(`[Section 1]: Verified Mapped WebDX Symbols (${flagSymbols.length} unique identifiers mapped across ${mappedRecords.length} feature records):\n`);
  console.log(JSON.stringify(flagSymbols, null, 2));
  
  console.log(`\n------------------------------------------------------------------\n`);
  
  console.log(`[Section 2]: Unmapped Granular Platform Extensions (${unmappedRecords.length} specific ChromeStatus proposals currently lacking dedicated WebDX shortcodes):\n`);
  for (const f of unmappedRecords) {
    console.log(`- ${f.name}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
