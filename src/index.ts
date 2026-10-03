import fs from 'node:fs/promises';
import type { ChromeStatusFeatureBasic, ChromeStatusFeatureVerbose, GatedBy, WebFeatureExtras } from './types.ts';
import { tokenize } from './text-analyzer.ts';

export * from './types.ts';

type Feature = Readonly<ChromeStatusFeatureBasic>;

/** Read-only queries over the compiled ChromeStatus catalog (`data/basic.json`) and its web-features joins. */
export class ChromeStatusClient {
  readonly features: ReadonlyArray<Feature>;
  private readonly byId = new Map<number, Feature>();
  private readonly byWebFeatureId = new Map<string, Feature[]>();
  private readonly nameTokens = new Map<number, Set<string>>();
  private readonly webFeatureExtras: Readonly<Record<string, Readonly<WebFeatureExtras>>>;

  constructor(features: ReadonlyArray<ChromeStatusFeatureBasic>, webFeatureExtras: Readonly<Record<string, WebFeatureExtras>> = {}) {
    this.features = Object.freeze(features.map(f => Object.freeze({ ...f })));
    this.webFeatureExtras = Object.freeze({ ...webFeatureExtras });
    for (const f of this.features) {
      this.byId.set(f.id, f);
      for (const id of f.web_feature_ids) {
        const list = this.byWebFeatureId.get(id);
        if (list) list.push(f);
        else this.byWebFeatureId.set(id, [f]);
      }
    }
  }

  /** Loads the bundled `data/basic.json` and `data/web-feature-extras.json`. */
  static async create(): Promise<ChromeStatusClient> {
    const [basicText, extrasText] = await Promise.all([
      fs.readFile(new URL('../data/basic.json', import.meta.url), 'utf8'),
      fs.readFile(new URL('../data/web-feature-extras.json', import.meta.url), 'utf8'),
    ]);
    const features: unknown = JSON.parse(basicText);
    if (!Array.isArray(features)) throw new Error('data/basic.json is malformed.');
    const extras: unknown = JSON.parse(extrasText);
    if (typeof extras !== 'object' || extras === null || Array.isArray(extras)) throw new Error('data/web-feature-extras.json is malformed.');
    return new ChromeStatusClient(features, extras as Record<string, WebFeatureExtras>);
  }

  /**
   * Finds one feature by ChromeStatus ID, exact web feature ID, a web feature ID contained in the query's words,
   * or a name containing every query word. Returns the first match in ID order.
   */
  findFeature(query: string | number): Feature | undefined {
    if (typeof query === 'number') return this.byId.get(query);

    const clean = query.trim().toLowerCase();
    const queryTokens = tokenize(clean);
    if (queryTokens.size === 0) return undefined;

    const exact = this.byWebFeatureId.get(clean);
    if (exact) return exact[0];

    for (const [id, features] of this.byWebFeatureId) {
      if (id.length >= 3 && queryTokens.has(id)) return features[0];
    }

    return this.features.find(f => {
      const nameTokens = this.nameTokens.get(f.id) ?? tokenize(f.name);
      this.nameTokens.set(f.id, nameTokens);
      return [...queryTokens].every(qt => [...nameTokens].some(nt => nt.includes(qt)));
    });
  }

  /** All features mapped to a web feature ID. Several ChromeStatus features often map to one web feature. */
  findFeaturesByWebFeatureId(webFeatureId: string): ReadonlyArray<Feature> {
    return this.byWebFeatureId.get(webFeatureId.trim().toLowerCase()) ?? [];
  }

  /** Features in an Active Origin Trial or behind a flag; pass `by` to limit to one. */
  getGatedFeatures(by?: GatedBy): ReadonlyArray<Feature> {
    return this.features.filter(f => by ? f.gated_by.includes(by) : f.gated_by.length > 0);
  }

  /** Sorted union of web feature IDs across `getGatedFeatures(by)`. */
  getGatedWebFeatureIds(by?: GatedBy): string[] {
    return [...new Set(this.getGatedFeatures(by).flatMap(f => f.web_feature_ids))].sort();
  }

  /** web-features-mappings data (use counter, standards positions, WPT, interop, MDN docs, developer signals) for a web feature ID. */
  getWebFeatureExtras(webFeatureId: string): Readonly<WebFeatureExtras> | undefined {
    const id = webFeatureId.trim().toLowerCase();
    return Object.hasOwn(this.webFeatureExtras, id) ? this.webFeatureExtras[id] : undefined;
  }

  /** Extras for each web feature ID mapped to the feature `findFeature(query)` returns, keyed by web feature ID. */
  getFeatureExtras(query: string | number): Readonly<Record<string, Readonly<WebFeatureExtras>>> {
    const out: Record<string, Readonly<WebFeatureExtras>> = {};
    for (const id of this.findFeature(query)?.web_feature_ids ?? []) {
      const extras = this.getWebFeatureExtras(id);
      if (extras) out[id] = extras;
    }
    return out;
  }

  /** Reads the verbose feature file for the feature `findFeature(query)` returns. */
  async getFeatureVerbose(query: string | number): Promise<ChromeStatusFeatureVerbose | undefined> {
    const feature = this.findFeature(query);
    if (!feature) return undefined;
    const text = await fs.readFile(new URL(`../data/features/${feature.id}.json`, import.meta.url), 'utf8');
    return JSON.parse(text);
  }
}
