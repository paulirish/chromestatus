import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';

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

  // Compile-time overrides dictionary to identify already mapped features
  const CUSTOM_WEB_FEATURE_OVERRIDES: Record<string, string> = {
    "HTML-in-canvas": "canvas-html",
    "Numeric separators": "numeric-separators",
    "CSS :open pseudo-class": "open-pseudo",
    "Prompt API Sampling Parameters": "languagemodel",
    "Web app HTML install element": "install",
    "Digital Credentials API (issuance support)": "digital-credentials",
    "Prerendering cross-origin iframes": "speculation-rules",
    "Proofreader API": "languagemodel",
    "WebMCP": "navigator-modelcontext"
  };

  // Systematic Title Disambiguation logic matching compile-data.ts
  // Ensures unique feature names across the catalog
  const seenNames = new Set<string>();
  for (const f of allFeatures) {
    if (f && typeof f.name === 'string') {
      let cleanName = f.name.trim();
      const baseName = cleanName;
      let counter = 2;
      while (seenNames.has(cleanName.toLowerCase())) {
        cleanName = `${baseName} (Phase ${counter})`;
        counter++;
      }
      seenNames.add(cleanName.toLowerCase());
      f.name = cleanName;
    }
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

  // Exclude broad monolithic specs from matching granular entries
  const monolithicSymbols = new Set(['html', 'dom', 'css', 'fetch', 'xhr', 'svg', 'webappsec']);

  const verifiedMappings: {
    featureName: string;
    documentedSpecs: string[];
    verifiedWebFeatureSymbol: string;
  }[] = [];

  const overridesDictionary: Record<string, string> = {};

  for (const feature of allFeatures) {
    if (!feature || !feature.name) continue;

    const cleanName = feature.name.trim();
    const overrideSym = CUSTOM_WEB_FEATURE_OVERRIDES[cleanName];
    
    let isUnmapped = false;
    if (!overrideSym) {
      const currentWebFeature = feature.web_feature;
      if (!currentWebFeature || 
          currentWebFeature === 'Missing feature' || 
          currentWebFeature.toLowerCase() === 'none' || 
          currentWebFeature.trim() === '') {
        isUnmapped = true;
      }
    }

    if (!isUnmapped) continue;

    // Extract absolute specification links
    const specs = new Set<string>();
    if (feature.standards?.spec) specs.add(feature.standards.spec.trim());
    if (feature.spec_link) specs.add(feature.spec_link.trim());
    const documentedSpecs = Array.from(specs).filter(Boolean);

    if (!documentedSpecs.length) continue;

    let granularSymbolMatched: string | null = null;

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
            // For broad standard web URLs, enforce tight alignment to prevent mapping standard base pages to granular entries
            if (baseDSpec.includes('html.spec.whatwg.org') || baseDSpec.includes('w3.org')) {
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
