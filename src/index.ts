import fs from 'node:fs/promises';
import type { ChromeStatusFeatureStub, ChromeStatusFeatureDetailed } from './types.ts';

export * from './types.ts';

/**
 * A clean, high-performance client interface for querying the ChromeStatus feature catalog.
 */
export class ChromeStatusClient {
  private stubs: ChromeStatusFeatureStub[];
  private originTrialIds: Set<number>;

  constructor(stubs: ChromeStatusFeatureStub[], activeOriginTrialIds: number[] = []) {
    this.stubs = stubs;
    this.originTrialIds = new Set(activeOriginTrialIds);
  }

  /**
   * Initializes the client instance, automatically loading bundled local snapshots by default.
   */
  static async create(): Promise<ChromeStatusClient> {
    let stubs: ChromeStatusFeatureStub[] = [];
    let otIds: number[] = [];

    try {
      const liteUrl = new URL('../data/lite.json', import.meta.url);
      const text = await fs.readFile(liteUrl, 'utf8');
      stubs = JSON.parse(text);
    } catch {
      stubs = [];
    }

    try {
      const otUrl = new URL('../data/active-ot-index.json', import.meta.url);
      const text = await fs.readFile(otUrl, 'utf8');
      otIds = JSON.parse(text);
    } catch {
      otIds = [];
    }

    return new ChromeStatusClient(stubs, otIds);
  }

  /**
   * Returns the complete base catalog array of features.
   */
  get features(): ChromeStatusFeatureStub[] {
    return this.stubs;
  }

  /**
   * Locates a specific feature by exact integer ID, web_feature symbol, or descriptive name.
   */
  findFeature(query: string | number): ChromeStatusFeatureStub | undefined {
    if (typeof query === 'number') {
      return this.stubs.find(f => f.id === query);
    }

    const clean = query.trim().toLowerCase();

    // 1. Exact web_feature symbol match
    const exactSymbol = this.stubs.find(f => f.web_feature && f.web_feature.toLowerCase() === clean);
    if (exactSymbol) return exactSymbol;

    // 2. Embedded symbol substring match (mandate length >= 3 to prevent single-letter overlap)
    const embeddedSymbol = this.stubs.find(f => 
      f.web_feature && 
      f.web_feature !== 'Missing feature' && 
      f.web_feature.length >= 3 && 
      clean.includes(f.web_feature.toLowerCase())
    );
    if (embeddedSymbol) return embeddedSymbol;

    // 3. Multi-token descriptive name containment
    const tokens = clean.split(/[-_\s]+/).filter(t => t.length > 2);
    if (tokens.length) {
      return this.stubs.find(f => {
        const nameLower = f.name.toLowerCase();
        return tokens.every(t => nameLower.includes(t));
      });
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
    for (const feature of this.stubs) {
      if (this.isFeatureInOriginTrial(feature.id)) {
        if (feature.web_feature && feature.web_feature !== 'Missing feature' && feature.web_feature.trim() !== '') {
          results.add(feature.web_feature);
        }
      }
    }
    return Array.from(results);
  }

  /**
   * Resolves the absolute, comprehensive verbose metadata timeline payload for a feature dynamically.
   */
  async getFeatureDetailed(id: number): Promise<ChromeStatusFeatureDetailed | undefined> {
    const base = this.stubs.find(f => f.id === id);
    if (!base) return undefined;

    try {
      const chunkUrl = new URL(`../data/features/${id}.json`, import.meta.url);
      const text = await fs.readFile(chunkUrl, 'utf8');
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
