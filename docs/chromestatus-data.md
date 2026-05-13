# ChromeStatus Payload Architecture & Package Mapping

This document details the underlying API endpoints exposed by **ChromeStatus.com** (backed by the open-source [chromium-dashboard](https://github.com/GoogleChrome/chromium-dashboard) service), analyzes their structural verbosity differences, and explains how the `@paulirish/chromestatus` package leverages these behaviors to deliver optimal client-side consumption.

---

## 1. Live Service Endpoints Reference

### Core Search & List
* **Endpoint:** `GET /api/v0/features`
* **Query Modifiers:**
  * `q` *(string)*: Arbitrary structured or full-text query filter (e.g., `owner:me`, `category:Graphics`, `feature_type<=1`).
  * `num` *(integer)*: Results limit per page. Strictly capped at `1000` by the backend datastore configuration.
  * `start` *(integer)*: Pagination offset.
  * `milestone` *(integer)*: Override parameter retrieving features scheduled for a specific milestone grouped by roadmap reasons.
  * `name_only` *(boolean)*: Emits minimal identifier stubs (`id`, `name`, permissions) to conserve bandwidth.
* **Backend Mechanism:** When queried with a non-empty search term (`q`), request routing delegates to `search.process_query()`. This internally resolves matching entities using `feature_helpers.get_by_ids()`, which explicitly formats records using the absolute **verbose JSON converter** (`converters.feature_entry_to_json_verbose()`).

### Single Feature Lookup
* **Endpoint:** `GET /api/v0/features/<int:feature_id>`
* **Backend Mechanism:** Delegates directly to `get_one_feature()`, returning the identical **verbose JSON converter** representation.

### Legacy Unpaginated Feeds
* **Endpoints:** `GET /features.json` and `GET /features_v2.json`
* **Backend Mechanism:** Calls `feature_helpers.get_features_by_impl_status()`. This loops through all implementation statuses and outputs basic feature objects formatted via the lightweight **basic JSON converter** (`converters.feature_entry_to_json_basic()`).

---

## 2. Basic vs. Verbose Payload Comparison

Empirical evaluation of the basic vs. verbose outputs reveals extreme differences in footprint and property depth across the **3,416 active features** in the catalog:

| Metric | Option 1 (Verbose Payloads) | Option 2 (Basic Bulk Feed) |
| :--- | :--- | :--- |
| **Source Endpoint** | `/api/v0/features?num=1000` (Iterated) | `/features.json` |
| **Monolithic File Size** | **~55.0 MB** | **~8.9 MB** |
| **Average Top-Level Keys** | **105 keys** | **22 keys** |
| **Exclusive Keys** | **85 keys** | **2 keys** (`milestone`, `owners`) |
| **Embedded `stages` Array** | **100% populated** (3,416 records) | **Stripped entirely** |
| **Rich Text Retention** | Preserves `motivation`, `explainer_links`, `devrel_emails` | Stripped entirely |

> **Note on Origin Trial Extensions:** In verbose payloads, Origin Trial stage entities (`stage_type === 150`) directly embed their subsequent trial extension stages inside an inline `extensions` array property.

---

## 3. Ecosystem Linkage & Join Fidelity

Feature records frequently populate a string identifier in the `web_feature` field to link external ecosystem specifications. 

Empirical validation against the authoritative **`web-features`** NPM package demonstrates near-perfect join compatibility:
* **Populated Scope**: 2,034 out of 3,416 records contain a populated `web_feature` string.
* **Placeholders**: 101 records contain a literal placeholder string (`"Missing feature"`), leaving **1,933 legitimate symbols**.
* **Join Fidelity**: **1,923 out of 1,933 identifiers map directly to top-level exported keys in `web-features`** (e.g., `"canvas"`, `"webgpu"`, `"view-transitions"`), representing a **99.48% mapping accuracy**.

---

## 4. Package Integration Architecture

To bridge these API constraints without imposing massive data penalties on downstream consumers, the `@paulirish/chromestatus` library utilizes a **Hybrid Hydration** pipeline:

```mermaid
graph TD
    API1[ChromeStatus API <br> Option 1 Verbose Chunks] -->|build/fetch.ts| DataDir[Local /data/ Layer]
    API2[ChromeStatus API <br> Option 2 Lite Array] -->|build/fetch.ts| DataDir
    DataDir -->|Synchronous Import| Lite[catalog.features <br> Instant In-Memory Indexing]
    DataDir -->|Dynamic import()| Hydrate[catalog.getFeatureVerbose id <br> Zero-Footprint Lazy Resolution]
```

1. **Zero-Bloat Bundling**: The library packages flat records as `data/lite.json`. Consumers construct initial collection search index sets synchronously without bundling unused JSON data.
2. **Lazy Hydration**: When granular lifecycle history or stage approval structures are required, the class instances load absolute Option 1 verbosity dynamically from individual feature chunks (`data/features/<id>.json`).
3. **Pre-Compiled OT Maps**: Extracted Origin Trial arrays (`data/active-ot-index.json`) evaluate initial signal gating requests in sub-millisecond execution loops without instantiating deep domain wrappers.
