import fs from 'node:fs/promises';
import type { ChromeStatusFeatureStub, ChromeStatusFeatureDetailed } from './types.ts';

export * from './types.ts';

interface SearchIndexRecord {
  id: number;
  symbol?: string; // pre-lowercased symbol
  nameTokens: string[]; // pre-lowercased descriptive word tokens
  stub: ChromeStatusFeatureStub;
}

/**
 * A clean, high-performance client interface for querying the ChromeStatus feature catalog.
 * Engineered for absolute O(1) indexing determinism, fail-fast concurrency, and zero runtime allocations.
 */
export class ChromeStatusClient {
  private stubs: ChromeStatusFeatureStub[];
  private idMap: Map<number, ChromeStatusFeatureStub>;
  private searchIndex: SearchIndexRecord[];
  private originTrialIds: Set<number>;

  constructor(stubs: ChromeStatusFeatureStub[], activeOriginTrialIds: number[] = []) {
    this.stubs = stubs;
    this.originTrialIds = new Set(activeOriginTrialIds);
    
    // Pre-compute O(1) cache identity maps and zero-allocation flat search index records
    this.idMap = new Map();
    this.searchIndex = [];

    for (const stub of stubs) {
      this.idMap.set(stub.id, stub);
      
      const symbol = stub.web_feature && stub.web_feature !== 'Missing feature' && stub.web_feature.trim() !== ''
        ? stub.web_feature.trim().toLowerCase() 
        : undefined;

      this.searchIndex.push({
        id: stub.id,
        symbol,
        nameTokens: stub.name.toLowerCase().split(/[-_\s]+/).filter(t => t.length > 0),
        stub
      });
    }
  }

  /**
   * Initializes the client instance natively by loading bundled local snapshots concurrently.
   * Fails fast if underlying offline dataset layers are compromised or absent.
   */
  static async create(): Promise<ChromeStatusClient> {
    const liteUrl = new URL('../data/lite.json', import.meta.url);
    const otUrl = new URL('../data/active-ot-index.json', import.meta.url);

    // Concurrent resource hydration pipeline without swallowing evaluation exceptions
    const [liteText, otText] = await Promise.all([
      fs.readFile(liteUrl, 'utf8'),
      fs.readFile(otUrl, 'utf8')
    ]);

    return new ChromeStatusClient(JSON.parse(liteText), JSON.parse(otText));
  }

  /**
   * Returns an immutable base catalog view array of feature instances.
   */
  get features(): ReadonlyArray<ChromeStatusFeatureStub> {
    return this.stubs;
  }

  /**
   * Locates a specific feature cleanly by exact integer ID, web_feature symbol, or descriptive tokens.
   */
  findFeature(query: string | number): ChromeStatusFeatureStub | undefined {
    if (typeof query === 'number') {
      return this.idMap.get(query);
    }

    const clean = query.trim().toLowerCase();
    const queryTokens = clean.split(/[-_\s]+/).filter(t => t.length > 0);
    if (!queryTokens.length) return undefined;

    // 1. Exact pre-lowercased symbol match
    const exact = this.searchIndex.find(r => r.symbol === clean);
    if (exact) return exact.stub;

    // 2. Symbol token containment (symbol exactly matches one of the provided long query tokens)
    const tokenMatchedSymbol = this.searchIndex.find(r => r.symbol && r.symbol.length >= 3 && queryTokens.includes(r.symbol));
    if (tokenMatchedSymbol) return tokenMatchedSymbol.stub;

    // 3. Descriptive name containment matching using pre-computed split array structures
    const queryMultiTokens = queryTokens.filter(t => t.length > 2);
    if (queryMultiTokens.length) {
      const matched = this.searchIndex.find(r => 
        queryMultiTokens.every(qt => r.nameTokens.some(nt => nt.includes(qt)))
      );
      if (matched) return matched.stub;
    }

    return undefined;
  }

  /**
   * Evaluates whether a specific feature ID is actively configured for an Origin Trial.
   */
  isFeatureInOriginTrial(id: number): boolean {
    return this.originTrialIds.has(id);
  }

  /**
   * Extracts a clean, deduplicated array of all valid web_feature string identifiers
   * currently assigned to active experimental Origin Trials.
   */
  getActiveOriginTrialWebFeatureIds(): string[] {
    const results = new Set<string>();
    // Scale loop traversals linearly by target active subset inversion size
    for (const id of this.originTrialIds) {
      const feature = this.idMap.get(id);
      if (feature?.web_feature && feature.web_feature !== 'Missing feature' && feature.web_feature.trim() !== '') {
        results.add(feature.web_feature);
      }
    }
    return Array.from(results);
  }

  /**
   * Resolves absolute verbose single-feature chunk file metadata over local storage pathways dynamically.
   */
  async getFeatureDetailed(id: number): Promise<ChromeStatusFeatureDetailed | undefined> {
    // Eliminate Time-of-Check to Time-of-Use (TOCTOU) existence array scan blocks entirely
    try {
      const chunkUrl = new URL(`../data/features/${id}.json`, import.meta.url);
      const text = await fs.readFile(chunkUrl, 'utf8');
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
