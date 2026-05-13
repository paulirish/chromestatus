import { FeatureCollection } from './collection.ts';
import type { 
  ChromeStatusFeatureStub, 
  ChromeStatusFeatureDetailed 
} from './types.ts';

export * from './types.ts';
export * from './collection.ts';

/** Configuration structure initializing client instance data logic */
export interface ClientOptions {
  /** Custom provider resolving core baseline metadata stubs */
  stubDataSource?: () => Promise<ChromeStatusFeatureStub[]>;
  /** Callback mapping unique feature IDs to full Option 1 verbose structure */
  verboseDataProvider?: (id: number) => Promise<ChromeStatusFeatureDetailed>;
  /** Pre-compiled standalone array of feature IDs actively gated behind an Origin Trial */
  activeOriginTrialIds?: number[];
  /** Optional base caching settings */
  enableCache?: boolean;
}

/**
 * Core entry facade orchestrating ChromeStatus index lookups.
 */
export class ChromeStatusClient {
  public features: FeatureCollection;
  private verboseCache = new Map<number, ChromeStatusFeatureDetailed>();

  private options: ClientOptions;

  constructor(
    stubs: ChromeStatusFeatureStub[],
    options: ClientOptions = {}
  ) {
    this.options = options;
    this.features = new FeatureCollection(stubs, async (id) => {
      if (this.options.enableCache !== false && this.verboseCache.has(id)) {
        const cached = this.verboseCache.get(id);
        if (cached) return cached;
      }

      if (!this.options.verboseDataProvider) {
        throw new Error(`Verbose data lookup requested for ID ${id} but no provider was configured.`);
      }

      const payload = await this.options.verboseDataProvider(id);
      if (this.options.enableCache !== false) {
        this.verboseCache.set(id, payload);
      }
      return payload;
    }, this.options.activeOriginTrialIds);
  }

  /** Top-level grouping delegator */
  groupBy<K extends PropertyKey>(
    callback: (feature: ChromeStatusFeatureStub) => K
  ): Record<K, ChromeStatusFeatureStub[]> {
    return this.features.groupBy(callback);
  }

  /** Resolves feature records using web_feature symbol or name directly */
  query(symbolOrName: string): ChromeStatusFeatureStub[] {
    return this.features.query(symbolOrName);
  }

  /** Synchronously extracts all valid web_feature symbols currently assigned to an active Origin Trial */
  getActiveOriginTrialWebFeatureIds(): string[] {
    return this.features.getActiveOriginTrialWebFeatureIds();
  }

  /** Flushes localized internal payload state */
  clearCache(): void {
    this.verboseCache.clear();
  }
}

/**
 * Factory entry instantiating pre-indexed API ecosystem wrapper.
 */
export async function createClient(options: ClientOptions = {}): Promise<ChromeStatusClient> {
  let stubs: ChromeStatusFeatureStub[] = [];
  if (options.stubDataSource) {
    stubs = await options.stubDataSource();
  } else {
    // Fallback mock loader framework logic if packaged direct
    stubs = [];
  }
  return new ChromeStatusClient(stubs, options);
}
