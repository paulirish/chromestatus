# @paulirish/chromestatus

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

The live API's single feature lookup payload is ~55MB across all active records. To prevent bundle bloat in consumer client applications, this package splits the database at compile time into two isolated layers:

1. **Base Index (`data/lite.json`, ~8.9MB)**:
   * Flattened basic records providing immediate synchronous collection scanning, search filtering, and index setup.
2. **Granular Feature Chunks (`data/features/<id>.json`, ~20KB each)**:
   * Individual standalone files containing absolute Option 1 verbosity (full nested `stages` array, extensive web URLs, and customized metrics).
   * Imported dynamically at runtime via `import()` to ensure absolute bundler tree-shaking efficiency.
3. **Active OT Map (`data/active-ot-index.json`, ~1KB)**:
   * Pre-extracted numeric array containing only active Origin Trial IDs for instant evaluation without initializing heavy models.

---

## 🚀 Usage

### 1. Initializing the Client & Finding Features

Instantiate the client natively using its asynchronous initializer, which automatically maps local pre-compiled catalog snapshot datasets internally by default:

```typescript
import { ChromeStatusClient } from '@paulirish/chromestatus';

async function run() {
  // Instantiates client facade mapping local snapshot layers automatically
  const client = await ChromeStatusClient.create();

  // Locate a feature by exact web_feature symbol, unique ID, or descriptive substring
  const feature = client.findFeature('canvas');
  if (!feature) return;

  console.log(`Found feature: ${feature.name} (ID: ${feature.id})`);
  console.log(`Category: ${feature.category}`);

  // Synchronously verify active Origin Trial assignment configuration
  const isOt = client.isFeatureInOriginTrial(feature.id);
  console.log(`Is in active Origin Trial: ${isOt}`);
}
```

---

### 2. Extracting Active Origin Trial Web Feature IDs

To retrieve a flat, deduplicated list of all authoritative `web_feature` string symbols associated with active experimental features synchronously:

```typescript
import { ChromeStatusClient } from '@paulirish/chromestatus';

async function run() {
  const client = await ChromeStatusClient.create();

  // Returns array of string identifiers: ['canvas', 'webgpu', ...]
  const activeWebFeatureIds = client.getActiveOriginTrialWebFeatureIds();
  console.log(activeWebFeatureIds);
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

  // Lazily resolve granular timeline structures (full stages array, custom URLs) over storage boundaries
  const verboseMetadata = await client.getFeatureDetailed(5172548013916160);
  console.log(verboseMetadata?.stages);
}
```

---

## 🛠️ Local Development & Data Synchronization

To synchronize your local project checkout with the latest upstream snapshot states from ChromeStatus.com, run the included compilation pipeline script:

```bash
# Runs build/fetch.ts directly using current native Node execution engines
pnpm run fetch
```

### Available Scripts
* `pnpm run fetch`: Downloads and compiles Option 1 feature chunks, Option 2 lite indices, and standalone Origin Trial maps into `./data/`.
* `pnpm run typecheck`: Verifies pure erasable syntax type declarations without emitting transpiled outputs.
* `pnpm run test`: Executes isolated suite runs using native Node test runners (`node --test`).
