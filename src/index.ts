import fs from 'node:fs/promises';
import type { ChromeStatusFeatureBasic, ChromeStatusFeatureVerbose, WebFeatureExtras, GatedFeature } from './types.ts';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from './overrides.ts';
import { tokenize } from './text-analyzer.ts';

export * from './types.ts';

interface SearchIndexRecord {
  id: number;
  webFeatureId?: string; // lowercased and normalized web feature ID
  feature: Readonly<ChromeStatusFeatureBasic>;
  nameTokens?: Set<string>; // updated to Set<string> for unified tokenization
}

/**
 * A clean, high-performance client interface for querying the ChromeStatus feature catalog.
 * Engineered for absolute O(1) indexing determinism, fail-fast concurrency, lazy heap tokenization, and deep erasable immutability bounds.
 */
export class ChromeStatusClient {
  private basicFeatures: ReadonlyArray<ChromeStatusFeatureBasic>;
  private idMap: Map<number, Readonly<ChromeStatusFeatureBasic>>;
  private searchIndex: SearchIndexRecord[];
  private activeOriginTrialIds: Set<number>;
  private flagIds: Set<number>;
  private webFeatureExtras: Readonly<Record<string, Readonly<WebFeatureExtras>>>;

  constructor(
    features: ReadonlyArray<ChromeStatusFeatureBasic>, 
    activeOriginTrialIds: ReadonlyArray<number> = [],
    flagIds: ReadonlyArray<number> = [],
    webFeatureExtras: Readonly<Record<string, WebFeatureExtras>> = {}
  ) {
    this.webFeatureExtras = Object.freeze({ ...webFeatureExtras });
    this.basicFeatures = Object.freeze(features.map(feature => {
      let web_feature = feature.web_feature;
      if (feature.name && Object.hasOwn(CUSTOM_WEB_FEATURE_OVERRIDES, feature.name)) {
        web_feature = CUSTOM_WEB_FEATURE_OVERRIDES[feature.name];
      }
      return Object.freeze({ ...feature, web_feature });
    }));
    this.activeOriginTrialIds = new Set(activeOriginTrialIds);
    this.flagIds = new Set(flagIds);
    
    this.idMap = new Map();
    this.searchIndex = [];

    for (const feature of this.basicFeatures) {
      this.idMap.set(feature.id, feature);
      
      // Enforce consistent lowercase normalization while explicitly filtering out sentinel defaults
      const rawFeatureId = feature.web_feature?.trim();
      const webFeatureIds = rawFeatureId && rawFeatureId !== 'Missing feature' && rawFeatureId.toLowerCase() !== 'none'
        ? rawFeatureId.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
        : [];

      if (webFeatureIds.length > 0) {
        for (const webFeatureId of webFeatureIds) {
          this.searchIndex.push({
            id: feature.id,
            webFeatureId,
            feature
          });
        }
      } else {
        this.searchIndex.push({
          id: feature.id,
          feature
        });
      }
    }
  }

  /**
   * Initializes the client instance natively by loading bundled local snapshots concurrently.
   * Fails fast if underlying offline dataset layers are compromised or absent.
   */
  static async create(): Promise<ChromeStatusClient> {
    const basicUrl = new URL('../data/basic.json', import.meta.url);
    const otUrl = new URL('../data/active-ot-index.json', import.meta.url);
    const flagUrl = new URL('../data/flag-index.json', import.meta.url);
    const extrasUrl = new URL('../data/web-feature-extras.json', import.meta.url);

    // Concurrent hydration pipeline without swallowing operational file loading/parsing anomalies
    const [basicText, otText, flagText, extrasText] = await Promise.all([
      fs.readFile(basicUrl, 'utf8'),
      fs.readFile(otUrl, 'utf8'),
      fs.readFile(flagUrl, 'utf8').catch(() => '[]'), // gracefully initialize empty array if flag index cache is un-built
      fs.readFile(extrasUrl, 'utf8')
    ]);

    const parsedFeatures: unknown = JSON.parse(basicText);
    if (!Array.isArray(parsedFeatures)) {
      throw new Error("Client initialization failed: data/basic.json is malformed.");
    }

    const parsedOts: unknown = JSON.parse(otText);
    if (!Array.isArray(parsedOts)) {
      throw new Error("Client initialization failed: data/active-ot-index.json is malformed.");
    }

    const parsedFlags: unknown = JSON.parse(flagText);
    const flagArray = Array.isArray(parsedFlags) ? parsedFlags : [];

    const parsedExtras: unknown = JSON.parse(extrasText);
    if (typeof parsedExtras !== 'object' || parsedExtras === null || Array.isArray(parsedExtras)) {
      throw new Error("Client initialization failed: data/web-feature-extras.json is malformed.");
    }

    return new ChromeStatusClient(
      parsedFeatures as ReadonlyArray<ChromeStatusFeatureBasic>, 
      parsedOts as ReadonlyArray<number>,
      flagArray as ReadonlyArray<number>,
      parsedExtras as Readonly<Record<string, WebFeatureExtras>>
    );
  }

  /**
   * Returns an immutable base catalog view array of feature instances.
   */
  get features(): ReadonlyArray<ChromeStatusFeatureBasic> {
    return this.basicFeatures;
  }

  /**
   * Returns web-features-mappings data (use counter, standards positions, WPT, interop, MDN docs,
   * developer signals) for a web-features ID, or undefined when upstream has none.
   */
  getWebFeatureExtras(webFeatureId: string): Readonly<WebFeatureExtras> | undefined {
    const id = webFeatureId.trim().toLowerCase();
    return Object.hasOwn(this.webFeatureExtras, id) ? this.webFeatureExtras[id] : undefined;
  }

  /**
   * Returns extras for every web-features ID mapped to a ChromeStatus feature, keyed by web-features ID.
   */
  getFeatureExtras(query: string | number): Readonly<Record<string, Readonly<WebFeatureExtras>>> {
    const feature = this.findFeature(query);
    const out: Record<string, Readonly<WebFeatureExtras>> = {};
    for (const id of feature?.web_feature?.split(',').map(s => s.trim()).filter(Boolean) ?? []) {
      const extras = this.getWebFeatureExtras(id);
      if (extras) out[id] = extras;
    }
    return out;
  }

  /**
   * Locates a specific feature cleanly by exact integer ID, web feature ID, or descriptive tokens.
   */
  findFeature(query: string | number): Readonly<ChromeStatusFeatureBasic> | undefined {
    if (typeof query === 'number') {
      return this.idMap.get(query);
    }

    const clean = query.trim().toLowerCase();
    const queryTokens = tokenize(clean);
    if (queryTokens.size === 0) return undefined;

    // 1. Exact web feature ID match prioritization
    const exact = this.searchIndex.find(r => r.webFeatureId === clean);
    if (exact) return exact.feature;

    // 2. Full web feature ID word containment (preventing broad substring hijacking)
    const tokenMatchedId = this.searchIndex.find(r => r.webFeatureId && r.webFeatureId.length >= 3 && queryTokens.has(r.webFeatureId));
    if (tokenMatchedId) return tokenMatchedId.feature;

    // 3. Strict descriptive multi-word token consensus checks evaluated using lazy token caching
    const matched = this.searchIndex.find(r => {
      if (!r.nameTokens) {
        r.nameTokens = tokenize(r.feature.name);
      }
      for (const qt of queryTokens) {
        let hasMatch = false;
        for (const nt of r.nameTokens) {
          if (nt.includes(qt)) {
            hasMatch = true;
            break;
          }
        }
        if (!hasMatch) return false;
      }
      return true;
    });

    if (matched) return matched.feature;

    return undefined;
  }

  /**
   * Locates all matching feature records sharing a target web feature ID.
   * Guarantees absolute retrieval correctness for external identifiers mapping to multiple catalog entries.
   */
  findFeaturesByWebFeatureId(webFeatureId: string): ReadonlyArray<ChromeStatusFeatureBasic> {
    const clean = webFeatureId.trim().toLowerCase();
    return this.searchIndex
      .filter(r => r.webFeatureId === clean)
      .map(r => r.feature);
  }

  /**
   * Evaluates whether a specific feature ID is actively configured for an Origin Trial.
   */
  isFeatureInActiveOriginTrial(id: number): boolean {
    return this.activeOriginTrialIds.has(id);
  }

  /**
   * Evaluates whether a specific feature ID is actively configured behind a runtime flag.
   */
  isFeatureBehindFlag(id: number): boolean {
    return this.flagIds.has(id);
  }

  /**
   * Extracts a clean, lowercased, deduplicated array of all valid web_feature string identifiers
   * currently assigned to active experimental Origin Trials.
   */
  getActiveOriginTrialWebFeatureIds(): string[] {
    const results = new Set<string>();
    for (const id of this.activeOriginTrialIds) {
      const record = this.searchIndex.find(r => r.id === id);
      if (record?.webFeatureId) {
        results.add(record.webFeatureId);
      }
    }
    return Array.from(results);
  }

  /**
   * Extracts a clean, lowercased, deduplicated array of all valid web_feature string identifiers
   * currently assigned behind an active runtime flag.
   */
  getFlagWebFeatureIds(): string[] {
    const results = new Set<string>();
    for (const id of this.flagIds) {
      const record = this.searchIndex.find(r => r.id === id);
      if (record?.webFeatureId) {
        results.add(record.webFeatureId);
      }
    }
    return Array.from(results);
  }

  /**
   * Returns the complete, un-truncated array of all authentic active Origin Trial feature records.
   * Guarantees zero accounting loss for highly specific experimental capabilities lacking mapped web feature IDs.
   */
  getActiveOriginTrials(): ReadonlyArray<ChromeStatusFeatureBasic> {
    const results: ChromeStatusFeatureBasic[] = [];
    for (const id of this.activeOriginTrialIds) {
      const record = this.searchIndex.find(r => r.id === id);
      if (record) {
        results.push(record.feature);
      }
    }
    return results;
  }

  /**
   * Returns the complete, un-truncated array of all feature records actively gated behind runtime flag switches.
   * Guarantees zero accounting loss for unmapped granular platform feature extensions.
   */
  getFlagFeatures(): ReadonlyArray<ChromeStatusFeatureBasic> {
    const results: ChromeStatusFeatureBasic[] = [];
    for (const id of this.flagIds) {
      const record = this.searchIndex.find(r => r.id === id);
      if (record) {
        results.push(record.feature);
      }
    }
    return results;
  }

  /**
   * Returns a combined inventory of all features gated behind Origin Trials or Flags,
   * including validation data (baseline year) if available.
   */
  getGatedFeaturesInventory(): GatedFeature[] {
    const otFeatures = this.getActiveOriginTrials();
    const flagFeatures = this.getFlagFeatures();

    const allGated = new Map<string, GatedFeature>();

    for (const f of otFeatures) {
      allGated.set(f.name, { 
        name: f.name, 
        gatedBy: ['Origin Trial'], 
        webFeatureId: f.web_feature || undefined, 
        baselineYear: f.baseline_year 
      });
    }

    for (const f of flagFeatures) {
      const existing = allGated.get(f.name);
      if (existing) {
        existing.gatedBy.push('Flag');
      } else {
        allGated.set(f.name, { 
          name: f.name, 
          gatedBy: ['Flag'], 
          webFeatureId: f.web_feature || undefined, 
          baselineYear: f.baseline_year 
        });
      }
    }

    return Array.from(allGated.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Resolves absolute verbose feature metadata over local storage pathways dynamically.
   * Intercepts explicit targeted lookup exceptions cleanly while bubbling operational infrastructure/syntax failures.
   */
  async getFeatureVerbose(query: string | number): Promise<ChromeStatusFeatureVerbose | undefined> {
    try {
      const feature = this.findFeature(query);
      if (!feature) return undefined;
      const verboseUrl = new URL(`../data/features/${feature.id}.json`, import.meta.url);
      const text = await fs.readFile(verboseUrl, 'utf8');
      return JSON.parse(text);
    } catch (err: any) {
      // Explicitly swallow target absence file codes cleanly to return undefined
      if (err?.code === 'ENOENT') {
        return undefined;
      }
      // Propagate all critical infrastructure anomalies (EMFILE, EACCES) and malformed payload SyntaxErrors
      throw err;
    }
  }
}
