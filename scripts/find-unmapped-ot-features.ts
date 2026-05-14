import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import type { ChromeStatusFeatureDetailed } from '../src/types.ts';

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

  const normalizeBaseUrl = (url: string | null | undefined) => {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
    } catch {
      return url.trim().replace(/\/$/, '').split('#')[0];
    }
  };

  const extractAnchor = (url: string | null | undefined) => {
    if (!url || !url.includes('#')) return null;
    return url.split('#')[1];
  };

  // Exclude broad monolithic specs
  const monolithicSymbols = new Set(['html', 'dom', 'css', 'fetch', 'xhr', 'svg', 'webappsec']);

  const finalVerifiedMappings: {
    id: number;
    name: string;
    documentedSpecs: string[];
    verifiedWebFeatureSymbol: string;
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

    const feature: ChromeStatusFeatureDetailed = JSON.parse(featureText);
    
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

    let granularSymbolMatched: string | null = null;
    let matchType: 'spec_cross_reference' | 'semantic_keyword' = 'spec_cross_reference';

    for (const [symbol, wfData] of Object.entries(webFeatures)) {
      if (wfData.kind !== 'feature' || monolithicSymbols.has(symbol) || symbol.length <= 2) continue;
      const wfSpecs = wfData.spec || [];
      
      for (const dSpec of documentedSpecs) {
        const baseDSpec = normalizeBaseUrl(dSpec);
        const anchorDSpec = extractAnchor(dSpec);
        if (!baseDSpec) continue;

        for (const wSpec of wfSpecs) {
          const baseWSpec = normalizeBaseUrl(wSpec);
          const anchorWSpec = extractAnchor(wSpec);
          if (!baseWSpec) continue;

          if (baseDSpec === baseWSpec || baseWSpec.startsWith(baseDSpec) || baseDSpec.startsWith(baseWSpec)) {
            // For broad standard web URLs, enforce extremely tight alignment to prevent mapping standard base pages to granular entries
            if (baseDSpec.includes('html.spec.whatwg.org') || baseDSpec.includes('w3.org')) {
              // Require both to define hash anchors and for those anchors to perfectly match, or symbol to match anchor tokens
              if (!anchorDSpec || !anchorWSpec || anchorDSpec !== anchorWSpec) {
                continue;
              }
            }
            granularSymbolMatched = symbol;
            break;
          }
        }
        if (granularSymbolMatched) break;
      }
      if (granularSymbolMatched) break;
    }

    // Fallback keyword search if no granular spec matched
    if (!granularSymbolMatched) {
      const query = feature.name.toLowerCase();
      for (const [symbol, wfData] of Object.entries(webFeatures)) {
        if (wfData.kind !== 'feature' || monolithicSymbols.has(symbol) || symbol.length <= 2) continue;
        const wfName = (wfData.name || '').toLowerCase();
        
        if (
          (query.includes('zstandard') && (symbol.includes('zstd') || wfName.includes('zstandard'))) ||
          (query.includes('compression dictionary') && (symbol.includes('compression') || wfName.includes('dictionary')))
        ) {
          granularSymbolMatched = symbol;
          matchType = 'semantic_keyword';
          break;
        }
      }
    }

    if (granularSymbolMatched) {
      finalVerifiedMappings.push({
        id: feature.id,
        name: feature.name,
        documentedSpecs,
        verifiedWebFeatureSymbol: granularSymbolMatched,
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
