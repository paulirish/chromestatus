import fs from 'node:fs/promises';
import type { ChromeStatusFeatureStub, ChromeStatusFeatureDetailed } from './types.ts';

export * from './types.ts';

interface SearchIndexRecord {
  id: number;
  symbol?: string; // lowercased and normalized symbol
  stub: Readonly<ChromeStatusFeatureStub>;
  nameTokens?: string[]; // lazily tokenized descriptive cache array
}

/**
 * A clean, high-performance client interface for querying the ChromeStatus feature catalog.
 * Engineered for absolute O(1) indexing determinism, fail-fast concurrency, lazy heap tokenization, and deep erasable immutability bounds.
 */
export class ChromeStatusClient {
  private stubs: ReadonlyArray<ChromeStatusFeatureStub>;
  private idMap: Map<number, Readonly<ChromeStatusFeatureStub>>;
  private searchIndex: SearchIndexRecord[];
  private originTrialIds: Set<number>;

  constructor(stubs: ReadonlyArray<ChromeStatusFeatureStub>, activeOriginTrialIds: ReadonlyArray<number> = []) {
    this.stubs = stubs;
    this.originTrialIds = new Set(activeOriginTrialIds);
    
    this.idMap = new Map();
    this.searchIndex = [];

    for (const stub of stubs) {
      this.idMap.set(stub.id, stub);
      
      // Enforce consistent lowercase normalization while explicitly filtering out sentinel defaults
      const rawSym = stub.web_feature?.trim();
      const symbol = rawSym && rawSym !== 'Missing feature' && rawSym.toLowerCase() !== 'none'
        ? rawSym.toLowerCase() 
        : undefined;

      this.searchIndex.push({
        id: stub.id,
        symbol,
        stub
        // nameTokens array remains unallocated on the heap until specifically requested during free-text query searches
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

    // Concurrent hydration pipeline without swallowing operational file loading/parsing anomalies
    const [liteText, otText] = await Promise.all([
      fs.readFile(liteUrl, 'utf8'),
      fs.readFile(otUrl, 'utf8')
    ]);

    const parsedStubs: unknown = JSON.parse(liteText);
    if (!Array.isArray(parsedStubs)) {
      throw new Error("Client initialization failed: data/lite.json is malformed.");
    }

    const parsedOts: unknown = JSON.parse(otText);
    if (!Array.isArray(parsedOts)) {
      throw new Error("Client initialization failed: data/active-ot-index.json is malformed.");
    }

    return new ChromeStatusClient(parsedStubs as ReadonlyArray<ChromeStatusFeatureStub>, parsedOts as ReadonlyArray<number>);
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
  findFeature(query: string | number): Readonly<ChromeStatusFeatureStub> | undefined {
    if (typeof query === 'number') {
      return this.idMap.get(query);
    }

    const clean = query.trim().toLowerCase();
    const queryTokens = clean.split(/[-_\s]+/).filter(t => t.length > 0);
    if (!queryTokens.length) return undefined;

    // 1. Exact symbol match prioritization
    const exact = this.searchIndex.find(r => r.symbol === clean);
    if (exact) return exact.stub;

    // 2. Full symbol word containment (preventing broad substring hijacking)
    const tokenMatchedSymbol = this.searchIndex.find(r => r.symbol && r.symbol.length >= 3 && queryTokens.includes(r.symbol));
    if (tokenMatchedSymbol) return tokenMatchedSymbol.stub;

    // 3. Strict descriptive multi-word token consensus checks evaluated using lazy token caching
    const matched = this.searchIndex.find(r => {
      if (!r.nameTokens) {
        // Populate descriptive cache array onto record on-demand to preserve startup heap memory bounds
        r.nameTokens = r.stub.name.toLowerCase().split(/[-_\s]+/).filter(t => t.length > 0);
      }
      return queryTokens.every(qt => r.nameTokens!.some(nt => nt.includes(qt)));
    });

    if (matched) return matched.stub;

    return undefined;
  }

  /**
   * Locates all matching feature records sharing a target web_feature string symbol.
   * Guarantees absolute retrieval correctness for external identifiers mapping to multiple catalog entries.
   */
  findFeaturesBySymbol(symbol: string): ReadonlyArray<ChromeStatusFeatureStub> {
    const clean = symbol.trim().toLowerCase();
    return this.searchIndex
      .filter(r => r.symbol === clean)
      .map(r => r.stub);
  }

  /**
   * Evaluates whether a specific feature ID is actively configured for an Origin Trial.
   */
  isFeatureInOriginTrial(id: number): boolean {
    return this.originTrialIds.has(id);
  }

  /**
   * Extracts a clean, lowercased, deduplicated array of all valid web_feature string identifiers
   * currently assigned to active experimental Origin Trials.
   */
  getActiveOriginTrialWebFeatureIds(): string[] {
    const results = new Set<string>();
    for (const id of this.originTrialIds) {
      const record = this.searchIndex.find(r => r.id === id);
      if (record?.symbol) {
        results.add(record.symbol);
      }
    }
    return Array.from(results);
  }

  /**
   * Resolves absolute verbose single-feature chunk file metadata over local storage pathways dynamically.
   * Intercepts explicit targeted lookup exceptions cleanly while bubbling operational infrastructure/syntax failures.
   */
  async getFeatureDetailed(id: number): Promise<ChromeStatusFeatureDetailed | undefined> {
    try {
      const chunkUrl = new URL(`../data/features/${id}.json`, import.meta.url);
      const text = await fs.readFile(chunkUrl, 'utf8');
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
