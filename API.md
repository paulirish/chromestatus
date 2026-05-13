# ChromeStatus API Reference

This document provides an overview and reference for the APIs exposed by **ChromeStatus.com** (backed by the open-source [chromium-dashboard](https://github.com/GoogleChrome/chromium-dashboard) service). It is intended to serve as a source of truth for exploring the data structures ahead of consuming them programmatically (e.g., via a scheduled NPM package publishing pipeline).

---

## Core Feature Endpoints

### 1. List / Search Features
**Endpoint:** `GET /api/v0/features`

Fetches a paginated list of feature entries or performs structured search queries.

#### Query Parameters
* **`milestone`** *(integer, optional)*: If specified, retrieves all features scheduled for the given milestone, grouped by roadmap section/reasons.
  * **Response format:** `{"features_by_type": { "<section_name>": [ ... ] }, "total_count": <int>}`
* **`releaseNotesMilestone`** *(integer, optional)*: Retrieves features specifically included in the enterprise release notes for that milestone.
  * **Response format:** `{"features": [ ... ], "total_count": <int>}`
* **`q`** *(string, optional)*: Full-text or structured search query string. Supports qualifiers such as `owner:me`, `starred-by:me`, `feature_type<=1`, `is:recently-reviewed`, etc.
* **`sort`** *(string, optional)*: Sort specification. Defaults to `-created.when`.
* **`num`** *(integer, optional)*: Number of results per page. Defaults to `100` (maximum `1000`).
* **`start`** *(integer, optional)*: Pagination offset start. Defaults to `0`.
* **`name_only`** *(boolean, optional)*: If `true`, returns minimal JSON objects containing only `id`, `name`, and basic permissions info to minimize payload size.
* **`showEnterprise`** *(boolean, optional)*: Explicitly includes enterprise/browser-update features in the search scope.

#### Standard Response Payload (`name_only=false`, no milestone override)
```json
{
  "total_count": 150,
  "features": [
    {
      "id": 5703707724349440,
      "name": "Example Feature Name",
      "summary": "Brief summary description of the feature.",
      "feature_type_int": 0,
      "unlisted": false,
      "breaking_change": false,
      "confidential": false,
      "blink_components": ["Blink>Core"],
      "resources": {
        "samples": ["https://example.com/sample"],
        "docs": ["https://example.com/doc"]
      },
      "creator": "user@example.com",
      "owners": ["owner@example.com"],
      "editors": [],
      "created": { "by": "user@example.com", "when": "2024-01-01 12:00:00.000" },
      "updated": { "by": "user@example.com", "when": "2024-01-02 12:00:00.000" },
      "standards": {
        "spec": "https://example.com/spec",
        "maturity": { "text": "Working Draft", "short_text": "WD", "val": 2 }
      },
      "browsers": {
        "chrome": {
          "bug": "https://crbug.com/123456",
          "blink_components": ["Blink>Core"],
          "origintrial": false,
          "flag": false,
          "status": { "text": "Enabled by default", "val": 1 }
        }
      },
      "is_released": true,
      "milestone": 120
    }
  ]
}
```

---

### 2. Get Single Feature (Verbose)
**Endpoint:** `GET /api/v0/features/<int:feature_id>`

Retrieves exhaustive, detailed metadata for a single feature entry, including its complete timeline, stages, review statuses, and metrics mapping.

#### Response Payload (`VerboseFeatureDict`)
Returns a single JSON object containing all basic properties plus expanded fields:

```json
{
  "id": 5703707724349440,
  "name": "Example Feature Name",
  "summary": "...",
  "category": "Web Components",
  "category_int": 1,
  "web_feature": "webgpu",
  "is_official_web_feature": true,
  "webdx_usecounter_enum": 123,
  "stages": [
    {
      "id": 1001,
      "stage_type": 110,
      "display_name": "Origin Trial",
      "intent_stage": 2,
      "intent_thread_url": "https://groups.google.com/a/chromium.org/g/blink-dev/c/...",
      "desktop_first": 115,
      "desktop_last": 118,
      "origin_trial_id": "-1234567890",
      "extensions": [
        {
          "id": 1002,
          "stage_type": 111,
          "experiment_extension_reason": "Need more data on sub-feature X.",
          "desktop_last": 120
        }
      ]
    },
    {
      "id": 1003,
      "stage_type": 160,
      "display_name": "Prepare to ship",
      "desktop_first": 121
    }
  ],
  "active_stage_id": 1003,
  "shipping_year": 2024,
  "flag_name": "enable-example-feature",
  "finch_name": "ExampleFeature",
  "explainer_links": ["https://github.com/example/explainer"],
  "spec_link": "https://example.com/spec",
  "wpt": true,
  "tag_review_status": "Pending",
  "security_review_status": "Completed",
  "privacy_review_status": "Completed"
}
```

> **Implementation Note on Stages:** Origin trial extension stages (`stage_type` mapping to `STAGE_TYPES_EXTEND_ORIGIN_TRIAL`) are embedded directly into their parent Origin Trial stage object under the `extensions` array.

---

### 3. Legacy Bulk Feeds
**Endpoints:** 
* `GET /features.json`
* `GET /features_v2.json`

These endpoints return a flat, unpaginated JSON array containing basic representations of all active public feature entries, sorted sequentially by Chrome implementation status and feature name. Historically, this is the most common feed used by external dashboards to ingest the full feature catalog in a single request.

---

## Auxiliary Service APIs

The service exposes several additional targeted routes under `/api/v0/` for review workflows, process tracking, and metadata rendering:

* **Feature Mutations & Lifecycles**
  * `POST /api/v0/features/create`: Creates a new feature entry.
  * `PATCH /api/v0/features`: Updates specific subsets of feature fields or stage parameters.
  * `DELETE /api/v0/features/<id>`: Archives a feature entry.
* **Gates & Approvals**
  * `GET /api/v0/features/<id>/gates`: Lists all cross-functional review gates for a feature.
  * `GET /api/v0/features/<id>/votes`: Lists vote states (e.g., Approved, Needs Work, Pending) submitted against feature gates.
  * `GET /api/v0/gates/pending`: Retrieves all gates currently awaiting review.
  * `GET/POST /api/v0/features/<id>/approvals/comments`: Interacts with review thread discussions.
* **Process & Intent Tracking**
  * `GET /api/v0/features/<id>/process`: Details the launch process template governing the feature.
  * `GET /api/v0/features/<id>/progress`: Returns free-form structural tracking of launch checklist progress.
  * `GET/POST /api/v0/features/<id>/<stage_id>/<gate_id>/intent`: Generates or posts intent-to-experiment/ship email templates directly to `blink-dev`.
* **Ecosystem Links & Coverage**
  * `GET /api/v0/feature_links`: Returns external reference link tracking (MDN, GitHub issues, specs) associated with features.
  * `GET /api/v0/feature_links_summary`: Aggregates health metrics and dead-link counts across tracked ecosystem URLs.
  * `GET /api/v0/features/<id>/wpt-coverage-analysis`: Serves Web Platform Tests (WPT) interoperability and coverage evaluation reports.
* **Taxonomies & Enumerations**
  * `GET /api/v0/web_feature_ids`: Provides the list of valid WebDX Baseline feature identifiers.
  * `GET /api/v0/webdxfeatures`: Lists WebDX feature mappings and associated UseCounter metrics.
  * `GET /api/v0/blinkcomponents`: Enumerates Buganizer/Blink component directories and subscribers.
  * `GET /api/v0/origintrials`: Retrieves active configuration metrics for running Origin Trials.
* **Reporting & Latency**
  * `GET /api/v0/feature-latency`: Reports duration metrics from feature inception to stable launch.
  * `GET /api/v0/review-latency`: Measures SLO response and resolution latency across review gates.
