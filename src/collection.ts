import type { 
  ChromeStatusFeatureStub, 
  ChromeStatusFeatureDetailed, 
  FeatureQueryFields, 
  FeaturePredicate,
  StageType 
} from './types.ts';

/**
 * Database-like query builder chain for filtering ChromeStatus features.
 * Optimizes execution by intersecting pre-computed index sets before sequential scans.
 */
export class QueryBuilder implements Iterable<ChromeStatusFeatureStub> {
  private predicates: FeaturePredicate[] = [];
  private candidateIds: Set<number> | null = null;

  private collection: Map<number, ChromeStatusFeatureStub>;
  private indexes: {
    byStageType: Map<StageType, Set<number>>;
    byCategory: Map<string, Set<number>>;
    originTrialIds: Set<number>;
  };
  private fetchVerboseProvider: (id: number) => Promise<ChromeStatusFeatureDetailed>;

  constructor(
    collection: Map<number, ChromeStatusFeatureStub>,
    indexes: {
      byStageType: Map<StageType, Set<number>>;
      byCategory: Map<string, Set<number>>;
      originTrialIds: Set<number>;
    },
    fetchVerboseProvider: (id: number) => Promise<ChromeStatusFeatureDetailed>
  ) {
    this.collection = collection;
    this.indexes = indexes;
    this.fetchVerboseProvider = fetchVerboseProvider;
  }

  /**
   * Applies index-accelerated equality filters or arbitrary structural predicates.
   */
  where(criteria: FeatureQueryFields | FeaturePredicate): this {
    if (typeof criteria === 'function') {
      this.predicates.push(criteria);
      return this;
    }

    // Intersect candidate IDs utilizing optimized in-memory indexes
    if (criteria.stageType !== undefined) {
      const stageIds = this.indexes.byStageType.get(criteria.stageType) ?? new Set<number>();
      this.intersectCandidates(stageIds);
    }

    if (criteria.category !== undefined) {
      const catIds = this.indexes.byCategory.get(criteria.category) ?? new Set<number>();
      this.intersectCandidates(catIds);
    }

    if (criteria.isOriginTrial !== undefined) {
      if (criteria.isOriginTrial) {
        this.intersectCandidates(this.indexes.originTrialIds);
      } else {
        // Inverse filter: sequential scan predicate fallback
        this.predicates.push(f => !this.indexes.originTrialIds.has(f.id));
      }
    }

    if (criteria.component !== undefined) {
      const comp = criteria.component;
      this.predicates.push(f => f.blink_components.includes(comp));
    }

    if (criteria.owner !== undefined) {
      const owner = criteria.owner;
      this.predicates.push(f => f.browsers.chrome.owners.includes(owner));
    }

    return this;
  }

  private intersectCandidates(newSet: Set<number>) {
    if (this.candidateIds === null) {
      this.candidateIds = new Set(newSet);
    } else {
      for (const id of this.candidateIds) {
        if (!newSet.has(id)) {
          this.candidateIds.delete(id);
        }
      }
    }
  }

  /** Executes query chain returning material records */
  toArray(): ChromeStatusFeatureStub[] {
    const results: ChromeStatusFeatureStub[] = [];
    const source = this.candidateIds !== null 
      ? Array.from(this.candidateIds).map(id => this.collection.get(id)).filter((f): f is ChromeStatusFeatureStub => f !== undefined)
      : this.collection.values();

    for (const feature of source) {
      let matches = true;
      for (const pred of this.predicates) {
        if (!pred(feature)) {
          matches = false;
          break;
        }
      }
      if (matches) {
        results.push(feature);
      }
    }
    return results;
  }

  /**
   * Leverages ES2023 Object.groupBy paradigms to structure arbitrary collections.
   */
  groupBy<K extends PropertyKey>(
    callback: (feature: ChromeStatusFeatureStub) => K
  ): Record<K, ChromeStatusFeatureStub[]> {
    // @ts-expect-error - Object.groupBy return type support compatibility mapping
    return Object.groupBy(this.toArray(), callback);
  }

  /** Resolves full detailed payloads lazily for all intersected queries */
  async fetchDetailed(): Promise<ChromeStatusFeatureDetailed[]> {
    const stubs = this.toArray();
    return Promise.all(stubs.map(s => this.fetchVerboseProvider(s.id)));
  }

  /** Standard standard iteration interface */
  *[Symbol.iterator](): Iterator<ChromeStatusFeatureStub> {
    yield* this.toArray();
  }
}

/**
 * High-performance core interface wrapping feature sets.
 */
export class FeatureCollection implements Iterable<ChromeStatusFeatureStub> {
  private collection = new Map<number, ChromeStatusFeatureStub>();
  private indexes = {
    byStageType: new Map<StageType, Set<number>>(),
    byCategory: new Map<string, Set<number>>(),
    originTrialIds: new Set<number>()
  };

  private verboseProvider: (id: number) => Promise<ChromeStatusFeatureDetailed>;

  constructor(
    stubs: ChromeStatusFeatureStub[],
    verboseProvider: (id: number) => Promise<ChromeStatusFeatureDetailed>
  ) {
    this.verboseProvider = verboseProvider;
    this.reindex(stubs);
  }

  private reindex(stubs: ChromeStatusFeatureStub[]) {
    this.collection.clear();
    this.indexes.byStageType.clear();
    this.indexes.byCategory.clear();
    this.indexes.originTrialIds.clear();

    for (const feature of stubs) {
      this.collection.set(feature.id, feature);

      // Map Category Index
      let catSet = this.indexes.byCategory.get(feature.category);
      if (!catSet) {
        catSet = new Set();
        this.indexes.byCategory.set(feature.category, catSet);
      }
      catSet.add(feature.id);

      // Map Stages Index
      if (feature.stage_types?.length) {
        for (const st of feature.stage_types) {
          let stSet = this.indexes.byStageType.get(st);
          if (!stSet) {
            stSet = new Set();
            this.indexes.byStageType.set(st, stSet);
          }
          stSet.add(feature.id);
          
          // Origin Trial mapping resolution rules
          if (st === 150 || feature.browsers?.chrome?.origintrial) {
            this.indexes.originTrialIds.add(feature.id);
          }
        }
      } else if (feature.browsers?.chrome?.origintrial) {
        this.indexes.originTrialIds.add(feature.id);
      }
    }
  }

  /** Starts a filter query execution block */
  where(criteria: FeatureQueryFields | FeaturePredicate): QueryBuilder {
    return new QueryBuilder(this.collection, this.indexes, this.verboseProvider).where(criteria);
  }

  /** Direct root mapping delegate */
  groupBy<K extends PropertyKey>(
    callback: (feature: ChromeStatusFeatureStub) => K
  ): Record<K, ChromeStatusFeatureStub[]> {
    // @ts-expect-error - ES2023 standard output map typing
    return Object.groupBy(this.collection.values(), callback);
  }

  /** Retrieves record directly by ID */
  get(id: number): ChromeStatusFeatureStub | undefined {
    return this.collection.get(id);
  }

  /** Fetches complete metadata lazily by ID */
  async getDetailed(id: number): Promise<ChromeStatusFeatureDetailed | undefined> {
    if (!this.collection.has(id)) return undefined;
    return this.verboseProvider(id);
  }

  get size(): number {
    return this.collection.size;
  }

  *[Symbol.iterator](): Iterator<ChromeStatusFeatureStub> {
    yield* this.collection.values();
  }
}
