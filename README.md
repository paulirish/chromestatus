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

### 1. Initializing the Client & Checking Origin Trial Status

The primary immediate use case is to identify features actively gated behind an Origin Trial. Use dot-notation properties on detailed domain models for intelligent autocompletion:

```typescript
import { ChromeStatusCatalog } from '@paulirish/chromestatus';
// Load raw snapshot outputs directly via native module import maps
import liteData from '@paulirish/chromestatus/data/lite.json' with { type: 'json' };

async function verifyFeature() {
  // 1. Fast synchronous initialization using the base lite payload
  const catalog = new ChromeStatusCatalog(liteData);

  // 2. Hydrate highly granular verbose timeline metadata on-demand
  const canvasFeature = await catalog.getFeatureVerbose('canvas');
  if (!canvasFeature) return;

  // 3. Inspect Origin Trial routing cleanly
  const ot = canvasFeature.originTrial;
  if (ot.isActive) {
    console.log(`Trial Name: ${ot.chromiumTrialName}`);
    console.log(`Trial ID: ${ot.id}`);
    console.log(`Feedback URL: ${ot.feedbackUrl}`);
  }

  // 4. Inspect vendor alignment views with IDE literal type autocompletion
  console.log(`Safari Position: ${canvasFeature.vendorViews.safari.text}`); 
  // IDE hints: 'No signal' | 'Shipped' | 'Under consideration'
}
```

---

### 2. Querying Collections with Set Intersections

The package leverages inverted in-memory Set maps to navigate the 3,416 feature records efficiently without heavy iterative scanning:

```typescript
const activeGraphicsTrials = catalog.features
  .where({ isOriginTrial: true, category: 'Graphics' })
  .toArray();

// Extract clean, deduplicated array of all authoritative web_feature IDs natively
const activeWebFeatureIds = catalog.getActiveOriginTrialWebFeatureIds();
console.log(activeWebFeatureIds); // ['canvas', 'webgpu', ...]

// Group arbitrary structural outcomes using native ES2023 Object.groupBy()
const groupedByCategory = catalog.features.groupBy(f => f.category);
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
