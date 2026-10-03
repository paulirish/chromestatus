# Project Lexicon

The canonical domain language for this project and the conceptual boundaries those terms represent.

## Sources and granularity

This package joins three datasets that each use the word "feature" at a different granularity. Qualify the word whenever more than one dataset is in scope.

### ChromeStatus feature

One entry in the ChromeStatus.com catalog: a Chromium launch, change, deprecation, or removal, often narrower than a web feature (several ChromeStatus features can map to one web feature). In this package's API, unqualified "feature" means a ChromeStatus feature.
Its numeric `id` is the **ChromeStatus feature ID**. Not to be confused with a web-features "feature ID", which is a string slug (see [AGENTS.md](./AGENTS.md) on keeping numeric IDs out of human-facing surfaces).

* _Reference_: `src/types.ts#ChromeStatusFeatureStub`, `src/types.ts#ChromeStatusFeatureDetailed`

### Web feature

A cross-browser web platform capability defined by the [web-features](https://github.com/web-platform-dx/web-features) project (e.g. `anchor-positioning`), identified by a lowercase hyphenated slug. A ChromeStatus feature points to one or more web features through its `web_feature` field, which can hold a comma-separated list.

* _Reference_: `src/types.ts#ChromeStatusFeatureStub.web_feature`

### BCD key

A dotted path in [@mdn/browser-compat-data](https://github.com/mdn/browser-compat-data) (e.g. `api.CSSPositionTryDescriptors`), the finest granularity in this project. A web feature lists the BCD keys it covers. BCD keys are what collector tests check.

* _Reference_: `src/empirical-index.ts#EmpiricalSupportIndex.getSupport`
* _AKA_: compat feature — used by web-features (`compat_features`)

### Feature name

The human-readable title of a ChromeStatus feature (`name`), used as the semantic lookup key. During compilation, duplicate titles get a ` (Phase N)` suffix, so a feature name in this package may not exactly match the title on ChromeStatus.com.

* _Reference_: `src/compile-helpers.ts#disambiguateFeatureNames`

## Lifecycle and gating

### Stage

One lifecycle phase record attached to a ChromeStatus feature (e.g. Dev Trial, Origin Trial, Shipping), identified by its numeric `stage_type` code. Not to be confused with `intent_stage`, which is a separate ChromeStatus field describing the feature's overall launch-process step, not a stage record.

* _Reference_: `src/types.ts#Stage`, `src/types.ts#StageType`

### Active Origin Trial

A derived status: an Origin Trial that is currently running for developers, as determined at compile time from the Origin Trials API feed and stage milestone windows. A raw `browsers.chrome.origintrial: true` value, or simply having an Origin Trial stage, does **not** mean the trial is active, because ChromeStatus often keeps both after a trial ends.

* _Reference_: `src/compile-helpers.ts#evaluateActiveOriginTrial`, `data/active-ot-index.json`

### Gated feature

A not-yet-shipped ChromeStatus feature that can only be enabled through an Active Origin Trial or a browser flag. "Gated" is the umbrella for both mechanisms. Not to be confused with a ChromeStatus review **gate** (approval checkpoints such as privacy or security review exposed by the `/gates` API), which is a process concept unrelated to runtime availability.

* _Reference_: `src/index.ts#ChromeStatusClient.getGatedFeaturesInventory`

## Mapping

### Override

A curated feature name → web feature ID entry kept in this repository. When present, it takes precedence over the upstream `web_feature` value at compile time. Not to be confused with heuristic matches (spec-URL or token-similarity suggestions from scripts), which are never applied automatically.

* _Reference_: `src/overrides.ts#CUSTOM_WEB_FEATURE_OVERRIDES`

### Unmapped

A ChromeStatus feature with no usable web feature reference: the field is absent, empty, or a sentinel such as `Missing feature` or `none`. Not to be confused with an orphan, which has a reference that points to nothing.

### Orphan

A ChromeStatus feature whose `web_feature` value names an ID that does not exist in the web-features package. Not to be confused with an unmapped feature (no reference at all) or a redirect (an ID that web-features marks as moved or split).

* _Reference_: `src/alignment.ts#AlignmentReport.orphans`

## Audits

### Alignment audit

A two-way referential check of ChromeStatus `web_feature` values against the web-features catalog, reporting orphans, redirects, milestone drift, and collisions (several ChromeStatus features sharing one web feature). Not to be confused with the conformance audit; alignment checks whether references are valid, not when features shipped.

* _Reference_: `src/alignment.ts#AlignmentAuditor`

### Conformance audit

A three-way reconciliation of the Chrome shipping milestone recorded by ChromeStatus, by BCD (through web-features), and by collector test results. "Shipped in M_N_" is always attributed to one of these three sources. Each mismatch category names which source is wrong:

* **BCD lagging**: collector tests pass at or before the ChromeStatus milestone, but BCD records a later milestone or no support. BCD is wrong.
* **ChromeStatus stale**: collector tests and BCD agree, and ChromeStatus records a different milestone. ChromeStatus is wrong.
* **Coarse mapping**: the BCD milestone predates the earliest collector pass because a broad web feature also covers older BCD keys. The cause is a granularity mismatch between the ChromeStatus feature and the web feature, not a bug in this project's mapping logic.
* **Flag gap**: collector tests first pass later than both ChromeStatus and BCD, usually because the feature was behind a flag during collector runs or tests were written after launch.

* _Reference_: `src/conformance.ts#ConformanceAuditResult`
