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

### Developer Scripts Guide

To support developer workflows, the project provides several scripts divided into logical tasks:

#### 1. Data Compilation Pipelines
*   `pnpm run fetch`: Complete pipeline to sync the codebase: runs `download` then `compile`.
*   `pnpm run download`: Downloads raw REST endpoints from ChromeStatus.com and collector configurations into `data/raw/` caching layers.
*   `pnpm run compile`: Processes cached raw archives, runs verification checks, maps overrides, and writes the optimized database layers (`data/lite.json`, active index files, and individual feature files).

#### 2. Conformance & Alignment Audits
*   `pnpm run audit:conformance`: Compares ChromeStatus, static BCD support, and empirical `mdn-bcd-results` collector files to generate a comprehensive lag and stale metadata report. Saves the report to [**`bcd_conformance_report.md`**](file:///Users/paulirish/code/chromestatus/bcd_conformance_report.md).
*   `pnpm run audit:alignment`: Runs diagnostics against ChromeStatus stubs mapping to the static `web-features` package catalog to report schema drift, redirects, collisions, or orphan symbols.

#### 3. Diagnostic & Inventory Printers
*   `pnpm run audit:ot-symbols`: Prints all active Origin Trial WebDX symbols based on pre-compiled active maps.
*   `pnpm run audit:flag-symbols`: Prints all ChromeStatus features currently gated by active browser flags.
*   `pnpm run audit:gated`: Prints a detailed inventory of all gated features (Origin Trials or flags) and flags suspicious old items that have already shipped.
*   `pnpm run audit:mappings`: Prints a markdown join table connecting WebDX symbols to ChromeStatus proposal names and spec links.
*   `pnpm run audit:unmapped-ots`: Identifies any active Origin Trials in ChromeStatus that are lacking mapped WebDX shortcodes.

#### 4. Matching & Mapping Boostrap Helpers (Run manually)
*   `node scripts/map-features-jaccard.ts`: Uses token similarity to suggest WebDX symbols for unmapped ChromeStatus features.
*   `node scripts/cross-reference-unmapped-features.ts`: Matches unmapped features by matching ChromeStatus spec URLs against BCD specifications.

---

## 🧪 Testing & Verification

*   `pnpm run typecheck`: Validates Type safety without emitting build assets.
*   `pnpm run test`: Runs the test suite in `test/` using the native Node.js test runner (`node --test`). Includes unit coverage for all core SDK components, tokenizers, overrides, and similarity matchers.
