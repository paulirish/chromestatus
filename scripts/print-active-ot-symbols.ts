import { ChromeStatusClient } from '../src/index.ts';

async function main() {
  const client = await ChromeStatusClient.create();
  
  console.log("=== Authoritative Active Origin Trial WebFeature Symbols ===");
  const activeSymbols = client.getActiveOriginTrialWebFeatureIds();
  
  console.log(`Total unique active string identifiers: ${activeSymbols.length}\n`);
  console.log(JSON.stringify(activeSymbols, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
