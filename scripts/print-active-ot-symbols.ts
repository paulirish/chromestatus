import { ChromeStatusClient } from '../src/index.ts';

async function main() {
  const client = await ChromeStatusClient.create();
  
  if (process.argv.includes('--json')) {
    const activeStubs = client.getActiveOriginTrials();
    const otMapping: Record<string, any> = {
      unmapped: []
    };

    for (const f of activeStubs) {
      const rawSym = f.web_feature;
      const symbols = rawSym && rawSym !== 'Missing feature' && rawSym.toLowerCase() !== 'none'
        ? rawSym.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      if (symbols.length > 0) {
        for (const symbol of symbols) {
          otMapping[symbol] = {
            chromestatus_url: `https://chromestatus.com/feature/${f.id}`
          };
        }
      } else {
        otMapping.unmapped.push({
          name: f.name,
          chromestatus_url: `https://chromestatus.com/feature/${f.id}`
        });
      }
    }

    const mappedKeys = Object.keys(otMapping).filter(k => k !== 'unmapped').sort();
    const sortedOtMapping: Record<string, any> = {};
    for (const key of mappedKeys) {
      sortedOtMapping[key] = otMapping[key];
    }
    otMapping.unmapped.sort((a: any, b: any) => a.name.localeCompare(b.name));
    sortedOtMapping.unmapped = otMapping.unmapped;

    console.log(JSON.stringify(sortedOtMapping, null, 2));
    return;
  }
  
  console.log("==================================================================");
  console.log("       AUTHORITATIVE ACTIVE ORIGIN TRIAL INVENTORY");
  console.log("==================================================================\n");

  const activeStubs = client.getActiveOriginTrials();
  const mappedRecords = activeStubs.filter(f => f.web_feature && f.web_feature.trim() !== '' && f.web_feature.toLowerCase() !== 'none' && f.web_feature !== 'Missing feature');
  const unmappedRecords = activeStubs.filter(f => !f.web_feature || f.web_feature.trim() === '' || f.web_feature.toLowerCase() === 'none' || f.web_feature === 'Missing feature');

  const activeSymbols = client.getActiveOriginTrialWebFeatureIds();
  
  console.log(`[Section 1]: Verified Mapped WebDX Symbols (${activeSymbols.length} unique identifiers mapped across ${mappedRecords.length} feature records):\n`);
  console.log(JSON.stringify(activeSymbols, null, 2));
  
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
