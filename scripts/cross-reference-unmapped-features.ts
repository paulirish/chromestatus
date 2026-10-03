import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { MONOLITHIC_SYMBOLS, isSpecMatch } from '../src/spec-matcher.ts';
import { disambiguateFeatureNames } from '../src/compile-helpers.ts';
import { parseWebFeatureValue } from '../src/upstream-mappings.ts';

async function main() {
  const rawPath = path.resolve(process.cwd(), 'data', 'raw', 'features-verbose.json');
  let verboseContent = '';
  try {
    verboseContent = await fs.readFile(rawPath, 'utf8');
  } catch (err) {
    console.error("Error reading data/raw/features-verbose.json:", err);
    process.exit(1);
  }

  const verboseData = JSON.parse(verboseContent);
  const allFeatures: any[] = Array.isArray(verboseData?.features) ? verboseData.features : [];

  // Ensures unique feature names across the catalog, matching compile-data.ts
  disambiguateFeatureNames(allFeatures);

  const verifiedMappings: {
    featureName: string;
    documentedSpecs: string[];
    verifiedWebFeatureSymbol: string;
  }[] = [];

  const overridesDictionary: Record<string, string> = {};

  for (const feature of allFeatures) {
    if (!feature || !feature.name) continue;

    const cleanName = feature.name.trim();
    const isUnmapped = !Object.hasOwn(CUSTOM_WEB_FEATURE_OVERRIDES, cleanName) && parseWebFeatureValue(feature.web_feature).length === 0;
    if (!isUnmapped) continue;

    // Extract absolute specification links
    const specs = new Set<string>();
    if (feature.standards?.spec) specs.add(feature.standards.spec.trim());
    if (feature.spec_link) specs.add(feature.spec_link.trim());
    const documentedSpecs = Array.from(specs).filter(Boolean);

    if (!documentedSpecs.length) continue;

    let granularSymbolMatched: string | null = null;

    // Exclude broad monolithic specs from matching granular entries
    for (const [symbol, wfData] of Object.entries(webFeatures)) {
      if (wfData.kind !== 'feature' || MONOLITHIC_SYMBOLS.has(symbol) || symbol.length <= 2) continue;
      const wfSpecs: string[] = [wfData.spec ?? []].flat();
      if (documentedSpecs.some(dSpec => wfSpecs.some(wSpec => isSpecMatch(dSpec, wSpec)))) {
        granularSymbolMatched = symbol;
        break;
      }
    }


    if (granularSymbolMatched) {
      verifiedMappings.push({
        featureName: cleanName,
        documentedSpecs,
        verifiedWebFeatureSymbol: granularSymbolMatched
      });
      overridesDictionary[cleanName] = granularSymbolMatched;
    }
  }

  console.log(JSON.stringify({
    count: verifiedMappings.length,
    mappings: verifiedMappings,
    overridesDictionary
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
