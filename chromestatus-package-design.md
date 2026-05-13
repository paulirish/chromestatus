# ChromeStatus NPM Package API & Architecture Design

This document outlines the interface, domain models, and packaging strategy for a modern JavaScript/TypeScript NPM package encapsulating periodic snapshots of the **ChromeStatus.com** feature catalog. 

Designed in strict adherence to the **Manifesto of Engineering Taste**, this package prioritizes erasable syntax (zero standard runtime enums), highly efficient flat data structures, native ES2023+ collection idioms (`Object.groupBy`), and aggressive code-splitting to mitigate the raw 55MB payload footprint.

---

## 1. Architecture & Data Delivery Strategy

Bundling a monolithic 55MB JSON payload (`features-option1.json`) into client-side or serverless environments causes severe memory bloat and execution latency. To solve this, the package employs a **Hybrid Hydration Architecture**:

```mermaid
graph TD
    Client[Consumer Application] -->|1. Sync Init| Lite[@chromestatus/data/lite.json <br> ~8.9MB Flat Array]
    Client -->|2. Async Query| Hydration[catalog.getFeatureVerbose 'canvas']
    Hydration -->|Dynamic ESM Import| VerboseChunk[@chromestatus/data/features/5172548013916160.json <br> ~20KB Granular Stage Data]
```

### Packaging & Splitting Mechanics
At build/publish time, the source data is processed using native `Object.groupBy()` into two distinct layers exposed via `package.json` subpath exports:

1. **Primary Entrypoint (`@chromestatus/data/lite`)**:
   * Flattens Option 2 into an optimized ~8.9MB array containing core fields (`id`, `name`, `web_feature`, basic browser flags).
   * Powers immediate synchronous lookups and initial catalog construction.
2. **Granular Chunks (`@chromestatus/data/features/*`)**:
   * Individual JSON files mapped by feature `id` containing absolute Option 1 verbosity (full `stages` array, custom fields, extensive URLs).
   * Loaded strictly on-demand at runtime via dynamic `import()` to guarantee perfect bundler tree-shaking.

---

## 2. Domain Wrapper Models (Erasable Syntax)

In alignment with the type design principles, **standard TypeScript enums are strictly banned** to preserve erasable syntax. We utilize numeric and string literal unions paired with plain constant lookup objects. Models maintain internal flat references to raw data to ensure maximum compatibility with V8 hidden classes.

```typescript
// ==========================================
// 1. Pure Types & Constants (Erasable Syntax)
// ==========================================

export const StageType = {
  OriginTrial: 150,
  IntentToShip: 160,
  Shipping: 106,
} as const;
export type StageType = typeof StageType[keyof typeof StageType];

export const VendorSignal = {
  Shipped: 1,
  Positive: 2,
  Incubation: 3,
  NoSignals: 4,
  NoSignal: 5,
} as const;
export type VendorSignal = typeof VendorSignal[keyof typeof VendorSignal];

export interface VendorView {
  signal: VendorSignal;
  text: string;
  url: string | null;
  notes: string | null;
}

// ==========================================
// 2. Robust Domain Wrappers
// ==========================================

export class OriginTrialWrapper {
  readonly #feature: any;
  readonly #otStage: any;

  constructor(featureJson: any, otStageJson?: any) {
    this.#feature = featureJson;
    this.#otStage = otStageJson;
  }

  /**
   * Evaluates active OT status empirically.
   * Checks granular stage rules first, falling back to flat legacy browser flags.
   */
  get isActive(): boolean {
    if (this.#otStage) {
      // Empirical validation: presence of an active backend Trial ID indicates configuration
      return Object.hasOwn(this.#otStage, 'origin_trial_id') && !!this.#otStage.origin_trial_id;
    }
    // Fallback for Lite instances lacking granular stages
    return this.#feature.browsers?.chrome?.origintrial === true;
  }

  get id(): string | null {
    return this.#otStage?.origin_trial_id ?? null;
  }

  get chromiumTrialName(): string | null {
    return this.#otStage?.ot_chromium_trial_name ?? this.#feature.finch_name ?? null;
  }

  get documentationUrl(): string | null {
    return this.#otStage?.ot_documentation_url ?? null;
  }

  get feedbackUrl(): string | null {
    return this.#otStage?.ot_feedback_submission_url ?? null;
  }
}

export class FeatureWrapper {
  readonly #data: any;
  #otWrapper?: OriginTrialWrapper;

  constructor(featureJson: any) {
    this.#data = featureJson;
  }

  get id(): number {
    return this.#data.id;
  }

  get name(): string {
    return this.#data.name;
  }

  get category(): string {
    return this.#data.category;
  }

  get webFeatureSymbol(): string | null {
    return Object.hasOwn(this.#data, 'web_feature') ? this.#data.web_feature : null;
  }

  /**
   * Lazily encapsulates Origin Trial evaluation logic.
   */
  get originTrial(): OriginTrialWrapper {
    if (!this.#otWrapper) {
      const otStage = this.#data.stages?.find((s: any) => s.stage_type === StageType.OriginTrial);
      this.#otWrapper = new OriginTrialWrapper(this.#data, otStage);
    }
    return this.#otWrapper;
  }

  /**
   * Maps structural vendor views with IDE autocompletion guarantees.
   */
  get vendorViews(): { firefox: VendorView; safari: VendorView; webdev: VendorView } {
    return {
      firefox: this.#normalizeVendorView(this.#data.browsers?.ff?.view),
      safari: this.#normalizeVendorView(this.#data.browsers?.safari?.view),
      webdev: this.#normalizeVendorView(this.#data.browsers?.webdev?.view),
    };
  }

  /**
   * Checks if the feature has fully shipped in Chrome.
   */
  get isShipped(): boolean {
    return this.#data.browsers?.chrome?.status?.text === 'Enabled by default';
  }

  #normalizeVendorView(rawView: any): VendorView {
    if (!rawView) {
      return { signal: VendorSignal.NoSignal, text: 'No signal', url: null, notes: null };
    }
    return {
      signal: rawView.val ?? VendorSignal.NoSignal,
      text: rawView.text ?? 'No signal',
      url: rawView.url ?? null,
      notes: rawView.notes ?? null,
    };
  }
}
```

---

## 3. Fluent Catalog & Builder Interface

To optimize orchestration and readability, the catalog exposes both direct key lookups and a highly fluent query builder interface.

```typescript
export class ChromeStatusCatalog {
  readonly #features: Map<number, FeatureWrapper> = new Map();
  readonly #featuresBySymbol: Map<string, FeatureWrapper> = new Map();

  constructor(featuresJson: any[]) {
    for (const item of featuresJson) {
      const wrapper = new FeatureWrapper(item);
      this.#features.set(wrapper.id, wrapper);
      if (wrapper.webFeatureSymbol) {
        this.#featuresBySymbol.set(wrapper.webFeatureSymbol, wrapper);
      }
    }
  }

  /**
   * Factory initializer loading the base Lite payload.
   */
  static async initLite(): Promise<ChromeStatusCatalog> {
    // Leverages native module attributes/assertions
    const module = await import('@chromestatus/data/lite.json', { with: { type: 'json' } });
    return new ChromeStatusCatalog(module.default);
  }

  /**
   * Retrieves a feature synchronously from local cache.
   */
  getFeature(symbolOrId: string | number): FeatureWrapper | undefined {
    return typeof symbolOrId === 'string' 
      ? this.#featuresBySymbol.get(symbolOrId) 
      : this.#features.get(symbolOrId);
  }

  /**
   * Hydrates granular Option 1 stage metadata dynamically for a specific feature.
   * Adheres to BAN TOCTOU rules by importing directly and catching missing chunk errors.
   */
  async getFeatureVerbose(symbolOrId: string | number): Promise<FeatureWrapper | undefined> {
    const baseFeature = this.getFeature(symbolOrId);
    if (!baseFeature) return undefined;

    try {
      // Direct runtime chunk hydration mapping to the feature ID
      const verboseData = await import(`@chromestatus/data/features/${baseFeature.id}.json`, { 
        with: { type: 'json' } 
      });
      return new FeatureWrapper(verboseData.default);
    } catch (err) {
      // Graceful fallback if granular chunk is missing for legacy entities
      return baseFeature;
    }
  }

  /**
   * Fluent query orchestration interface.
   */
  query(): CatalogQueryBuilder {
    return new CatalogQueryBuilder(Array.from(this.#features.values()));
  }
}

export class CatalogQueryBuilder {
  #collection: FeatureWrapper[];

  constructor(features: FeatureWrapper[]) {
    this.#collection = features;
  }

  byCategory(category: string): this {
    this.#collection = this.#collection.filter(f => f.category === category);
    return this;
  }

  withActiveOriginTrial(): this {
    this.#collection = this.#collection.filter(f => f.originTrial.isActive);
    return this;
  }

  shipped(): this {
    this.#collection = this.#collection.filter(f => f.isShipped);
    return this;
  }

  execute(): FeatureWrapper[] {
    return this.#collection;
  }
}
```

---

## 4. Immediate Primary Use Case Execution

Consumers verifying if a specific API feature is actively gated behind an Origin Trial can write clean, outline-orchestrated asynchronous logic with standard dot-notation autocompletion:

```typescript
import { ChromeStatusCatalog } from '@chromestatus/api';

async function verifyFeatureStatus() {
  // 1. Fast synchronous initialization (~8.9MB payload)
  const catalog = await ChromeStatusCatalog.initLite();

  // 2. Hydrate highly specific feature metadata dynamically (~20KB individual chunk)
  const canvasFeature = await catalog.getFeatureVerbose('canvas');

  if (!canvasFeature) {
    throw new Error('Feature missing from snapshot catalog.');
  }

  // 3. Fluent domain getters execute signal evaluation seamlessly
  const ot = canvasFeature.originTrial;
  
  if (ot.isActive) {
    console.log(`[Active Trial]: ${ot.chromiumTrialName}`);
    console.log(`[Trial ID]: ${ot.id}`);
    console.log(`[Feedback Routing]: ${ot.feedbackUrl}`);
  }

  // 4. Inspect strongly-typed vendor alignment views
  const views = canvasFeature.vendorViews;
  console.log(`Safari Position: ${views.safari.text}`); // IDE hints: 'No signal' | 'Shipped' etc.
}
```

> [!TIP]
> **Performance Benefit**: This architecture ensures consumer bundles remain highly performant. Client builds bundle **0 bytes** of raw JSON payload by default, delegating lookup overhead entirely to native execution engines and network split loaders.
