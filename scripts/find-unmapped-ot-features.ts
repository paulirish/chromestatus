import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import type { ChromeStatusFeatureVerbose } from '../src/types.ts';
import { isSpecMatch, MONOLITHIC_SYMBOLS } from '../src/spec-matcher.ts';

async function main() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const otIndexPath = path.join(dataDir, 'active-ot-index.json');
  
  let otIds: number[] = [];
  try {
    const text = await fs.readFile(otIndexPath, 'utf8');
    otIds = JSON.parse(text);
  } catch {
    console.error("Error reading data/active-ot-index.json");
    process.exit(1);
  }

  const finalVerifiedMappings: {
    id: number;
    name: string;
    documentedSpecs: string[];
    verifiedWebFeatureId: string;
    matchType: 'spec_cross_reference' | 'semantic_keyword';
  }[] = [];

  const unmappedWithoutGranularMatch: {
    id: number;
    name: string;
    documentedSpecs: string[];
  }[] = [];

  for (const id of otIds) {
    const featurePath = path.join(dataDir, 'features', `${id}.json`);
    let featureText = '';
    try {
      featureText = await fs.readFile(featurePath, 'utf8');
    } catch {
      continue;
    }

    const feature: ChromeStatusFeatureVerbose = JSON.parse(featureText);
    
    const currentWebFeature = feature.web_feature;
    const isUnmapped = !currentWebFeature || 
                       currentWebFeature === 'Missing feature' || 
                       currentWebFeature.toLowerCase() === 'none' || 
                       currentWebFeature.trim() === '';

    if (!isUnmapped) continue;

    const specs = new Set<string>();
    if (feature.standards?.spec) specs.add(feature.standards.spec.trim());
    if ((feature as any).spec_link) specs.add((feature as any).spec_link.trim());
    const documentedSpecs = Array.from(specs).filter(Boolean);

    let granularWebFeatureIdMatched: string | null = null;
    let matchType: 'spec_cross_reference' | 'semantic_keyword' = 'spec_cross_reference';

    for (const [webFeatureId, wfData] of Object.entries(webFeatures)) {
      if (wfData.kind !== 'feature' || MONOLITHIC_SYMBOLS.has(webFeatureId) || webFeatureId.length <= 2) continue;
      const wfSpecs = wfData.spec || [];
      
      for (const dSpec of documentedSpecs) {
        for (const wSpec of wfSpecs) {
          if (isSpecMatch(dSpec, wSpec)) {
            granularWebFeatureIdMatched = webFeatureId;
            break;
          }
        }
        if (granularWebFeatureIdMatched) break;
      }
      if (granularWebFeatureIdMatched) break;
    }

    // Fallback keyword search if no granular spec matched
    if (!granularWebFeatureIdMatched) {
      const query = feature.name.toLowerCase();
      for (const [webFeatureId, wfData] of Object.entries(webFeatures)) {
        if (wfData.kind !== 'feature' || MONOLITHIC_SYMBOLS.has(webFeatureId) || webFeatureId.length <= 2) continue;
        const wfName = (wfData.name || '').toLowerCase();
        
        if (
          (query.includes('zstandard') && (webFeatureId.includes('zstd') || wfName.includes('zstandard'))) ||
          (query.includes('compression dictionary') && (webFeatureId.includes('compression') || wfName.includes('dictionary')))
        ) {
          granularWebFeatureIdMatched = webFeatureId;
          matchType = 'semantic_keyword';
          break;
        }
      }
    }

    if (granularWebFeatureIdMatched) {
      finalVerifiedMappings.push({
        id: feature.id,
        name: feature.name,
        documentedSpecs,
        verifiedWebFeatureId: granularWebFeatureIdMatched,
        matchType
      });
    } else {
      unmappedWithoutGranularMatch.push({
        id: feature.id,
        name: feature.name,
        documentedSpecs
      });
    }
  }

  console.log("=== Absolute Verified Mapping Results for Unmapped Active Origin Trials ===\n");
  console.log(JSON.stringify(finalVerifiedMappings, null, 2));
  
  console.log("\n=== Unmapped Records Remaining Without Granular Web-Features Counterpart ===\n");
  console.log(JSON.stringify(unmappedWithoutGranularMatch, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
