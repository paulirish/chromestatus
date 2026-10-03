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

1. **Base Index (`data/basic.json`, ~8.9MB)**:
   * Basic features providing immediate synchronous collection scanning, search filtering, and index setup.
2. **Verbose Features (`data/features/<id>.json`, ~20KB each)**:
   * Individual standalone files containing full verbose features (full nested `stages` array, extensive web URLs, and customized metrics). Keyed natively on persistent immutable database keys to maximize OS compatibility while remaining fully abstracted from user access layers.
   * Imported dynamically at runtime via `fs.readFile` to ensure absolute tree-shaking efficiency.

Compile adds three fields to every basic and verbose feature:

* `web_feature_ids: string[]`: the override if one exists, otherwise the ChromeStatus `web_feature` value, split, lowercased, with `moved` IDs resolved. Empty when unmapped.
* `baseline_year?: number`: latest Baseline (newly available) year across those IDs.
* `gated_by: ('Origin Trial' | 'Flag')[]`: whether the feature is in an Active Origin Trial (per the Origin Trials API) or behind a flag. Features that reached Baseline before 2024 are never gated.

`data/web-feature-extras.json` holds [web-features-mappings](https://github.com/web-platform-dx/web-features-mappings) data for every referenced web feature ID.

---

## 🚀 Usage

### 1. Initializing the Client & Finding Features

Instantiate the client natively using its asynchronous initializer, which automatically maps local pre-compiled catalog snapshot datasets internally by default:

```typescript
import { ChromeStatusClient } from '@paulirish/chromestatus';

async function run() {
  // Instantiates client facade mapping local snapshot layers automatically
  const client = await ChromeStatusClient.create();

  // Locate a feature by exact descriptive string or web feature ID
  const feature = client.findFeature('HTML-in-canvas');
  if (!feature) return;

  console.log(feature.name);            // 'HTML-in-canvas'
  console.log(feature.web_feature_ids); // ['canvas-html']
  console.log(feature.gated_by);        // ['Origin Trial']

  // Every ChromeStatus feature mapped to a web feature ID
  const features = client.findFeaturesByWebFeatureId('view-transitions');
}
```

---

### 2. Interrogating Gated Features (Origin Trials & Flags)

```typescript
import { ChromeStatusClient } from '@paulirish/chromestatus';

async function run() {
  const client = await ChromeStatusClient.create();

  const gated = client.getGatedFeatures();                    // in an Active Origin Trial or behind a flag
  const inTrial = client.getGatedFeatures('Origin Trial');
  const trialIds = client.getGatedWebFeatureIds('Origin Trial'); // sorted union of web_feature_ids
  const unmappedFlags = client.getGatedFeatures('Flag').filter(f => !f.web_feature_ids.length);
}
```

---

### 3. Filtering Collections & Resolving Verbose Timelines

The package exposes convenient native array accessors alongside dynamic verbose feature resolvers to inspect absolute single-item lifecycle configurations on-demand:

```typescript
import { ChromeStatusClient } from '@paulirish/chromestatus';

async function run() {
  const client = await ChromeStatusClient.create();

  // Access full basic feature records array directly
  const breakingChanges = client.features.filter(f => f.breaking_change);

  // Group arbitrary collections using native ES2023 Object.groupBy()
  const byStatus = Object.groupBy(client.features, f => f.browsers.chrome.status.text);

  // Dynamically resolve granular timeline structures (full stages array, custom URLs) over storage boundaries
  // Natively supports passing descriptive feature title strings to abstract numeric database IDs entirely
  const verboseMetadata = await client.getFeatureVerbose('HTML-in-canvas');
  console.log(verboseMetadata?.stages);

  // web-features-mappings extras: use counter, standards positions, WPT, interop, MDN docs, developer signals
  const extras = client.getWebFeatureExtras('view-transitions');
  console.log(extras?.useCounter?.percentageOfPageLoad, extras?.standardsPositions);
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
*   `pnpm run compile`: Processes cached raw archives, runs verification checks, maps overrides, and writes the optimized database layers (`data/basic.json`, individual feature files, and `data/web-feature-extras.json`). Fails if any raw input is missing.

#### 2. Conformance & Mapping Audits
*   `pnpm run audit:conformance`: Compares ChromeStatus, static BCD support, and `mdn-bcd-results` collector files to generate a comprehensive lag and stale metadata report. Saves the report to [**`bcd_conformance_report.md`**](file:///Users/paulirish/code/chromestatus/bcd_conformance_report.md).
*   `pnpm run audit:overrides`: Checks each entry in [`src/overrides.ts`](src/overrides.ts) against raw ChromeStatus data and [web-features-mappings](https://github.com/web-platform-dx/web-features-mappings). Exits non-zero when an override is redundant, broken (points to a moved/unknown ID), or unknown-name (no ChromeStatus feature has that name, e.g. it was renamed).
*   `pnpm run audit:chromestatus-edits`: Writes `data/chromestatus-edit-suggestions.md`, a list of ChromeStatus `web_feature` fixes with evidence: overridden values, invalid or moved IDs, and candidate IDs for unmapped features. Candidate evidence, strongest first: a crbug shared with a web feature in web-features-mappings, MDN doc links, a spec URL listed by exactly one web feature, a web feature name contained in the feature name. Gated features are marked.

#### 3. Printers
*   `pnpm run audit:gated`: Prints features in an Active Origin Trial or behind a flag, per gate, with their web feature IDs and the unmapped ones. `--json` for machine output.
*   `pnpm run audit:mappings`: Prints a markdown table of every web feature ID → ChromeStatus feature mapping.

---

## 🧪 Testing & Verification

*   `pnpm run typecheck`: Validates Type safety without emitting build assets.
*   `pnpm run test`: Runs the test suite in `test/` using the native Node.js test runner (`node --test`). Includes unit coverage for compile helpers, the client, mapping audits, and conformance.
