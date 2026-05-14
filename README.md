# @paulirish/chromestatus

[![npm version](https://img.shields.io/npm/v/@paulirish/chromestatus.svg)](https://www.npmjs.com/package/@paulirish/chromestatus)

> [!WARNING]  
> **API Under Construction**: The public interfaces and exported wrapper models in this library are currently under active development. The API configuration is highly volatile and likely to change dramatically in upcoming snapshot versions as abstraction layers are hardened.

A highly optimized, zero-build JavaScript/TypeScript client library encapsulating static periodic snapshots of the **ChromeStatus.com** feature catalog.

Designed following strict standards for **erasable syntax** (zero standard runtime enums), **native collections** (`Object.groupBy`), and **hybrid hydration**, this package solves the raw 55MB JSON bundle bottleneck by loading flat metadata arrays synchronously while fetching exhaustive feature timelines strictly on-demand.

---

## 📦 Installation

```bash
npm install @paulirish/chromestatus
# or using pnpm
pnpm add @paulirish/chromestatus
```

---

## 🏗️ Architecture & Packaging Strategy

The live API's single feature lookup payload is ~55MB across all active records. To prevent bundle bloat in consumer client applications, this package splits the database at compile time into isolated layers:

1. **Base Index (`data/lite.json`, ~8.9MB)**:
   * Flattened basic records providing immediate synchronous collection scanning, search filtering, and index setup.
2. **Granular Feature Chunks (`data/features/<id>.json`, ~20KB each)**:
   * Individual standalone files containing absolute Option 1 verbosity (full nested `stages` array, extensive web URLs, and customized metrics). Keyed natively on persistent immutable database keys to maximize OS compatibility while remaining fully abstracted from user access layers.
   * Imported dynamically at runtime via `fs.readFile` to ensure absolute tree-shaking efficiency.
3. **Gating Maps (`data/active-ot-index.json` & `data/experimental-flag-index.json`)**:
   * Pre-extracted numeric arrays containing only active Origin Trial or Experimental Flag IDs for instant status verification without initializing heavy models.

---

## 🚀 Usage

### 1. Initializing the Client & Finding Features

Instantiate the client natively using its asynchronous initializer, which automatically maps local pre-compiled catalog snapshot datasets internally by default:

```typescript
import { ChromeStatusClient } from '@paulirish/chromestatus';

async function run() {
  // Instantiates client facade mapping local snapshot layers automatically
  const client = await ChromeStatusClient.create();

  // Locate a feature by exact descriptive string or symbol identifier
  const feature = client.findFeature('HTML-in-canvas');
  if (!feature) return;

  console.log(`Found feature: ${feature.name}`);
  console.log(`Mapped WebDX Symbol: ${feature.web_feature}`);

  // Synchronously verify runtime configuration gating states
  const isOt = client.isFeatureInOriginTrial(feature.id);
  const isFlagged = client.isFeatureBehindExperimentalFlag(feature.id);
  console.log(`Is in active Origin Trial: ${isOt}`);
  console.log(`Is behind Experimental Flag: ${isFlagged}`);
}
```

---

### 2. Interrogating Gated Features (Origin Trials & Experimental Flags)

To retrieve full active collections or standalone deduplicated string mapping profiles synchronously without risking accounting drop-out for unmapped extensions:

```typescript
import { ChromeStatusClient } from '@paulirish/chromestatus';

async function run() {
  const client = await ChromeStatusClient.create();

  // --- COMBINED GATED INVENTORY (OT & Flags) ---
  // Retrieve a combined inventory of all features gated behind Origin Trials or Flags
  // Includes validation data (baseline year) if available.
  const inventory = client.getGatedFeaturesInventory();
  
  // Print the first 5 items as an example
  console.log(inventory.slice(0, 5));
  
  // Example output item:
  // {
  //   name: 'HTML-in-canvas',
  //   gatedBy: ['Origin Trial'],
  //   webFeatureId: 'canvas-html',
  //   baselineYear: undefined
  // }
}
```

---

### 3. Filtering Collections & Resolving Verbose Timelines

The package exposes convenient native array accessors alongside dynamic chunk resolvers to inspect absolute single-item lifecycle configurations on-demand:

```typescript
import { ChromeStatusClient } from '@paulirish/chromestatus';

async function run() {
  const client = await ChromeStatusClient.create();

  // Access full base feature records array directly
  const graphicsFeatures = client.features.filter(f => f.category === 'Graphics');

  // Group arbitrary collections using native ES2023 Object.groupBy()
  const groupedByCategory = Object.groupBy(client.features, f => f.category);

  // Dynamically resolve granular timeline structures (full stages array, custom URLs) over storage boundaries
  // Natively supports passing descriptive feature title strings to abstract numeric database IDs entirely
  const verboseMetadata = await client.getFeatureDetailed('HTML-in-canvas');
  console.log(verboseMetadata?.stages);
}
```

---

## 🛠️ Local Development & Data Synchronization

To synchronize your local project checkout with the latest upstream snapshot states from ChromeStatus.com, execute the integrated compilation pipeline:

```bash
# Sequentially pulls raw API snapshots and compiles optimized data layers
pnpm run fetch
```

### Available Scripts
* `pnpm run fetch`: Downloads live REST endpoints into `data/raw/` caching layers and compiles production data structures natively.
* `pnpm run download`: Isolates custom raw snapshot extraction blocks (incorporating proxy authentication configurations).
* `pnpm run compile`: Operates exclusively on locally cached archives to regenerate mapping indexes rapidly during iterations.
* `pnpm run audit:ot-symbols`: Outputs dual visual terminal views separating mapped WebDX origin trials from unmapped specific API extensions.
* `pnpm run audit:flag-symbols`: Outputs segregated inventory views for capabilities gated behind runtime experimental switches.
* `pnpm run audit:alignment`: Executes highly automated systematic validation probes enforcing absolute baseline schema continuity.
* `pnpm run typecheck`: Verifies pure erasable syntax type declarations without emitting transpiled outputs.
* `pnpm run test`: Executes isolated suite runs using native Node test runners (`node --test`).
