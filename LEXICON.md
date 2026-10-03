# Project Lexicon

The canonical domain language for this project and the conceptual boundaries those terms represent.

## Sources and granularity

This package joins three datasets that each use the word "feature" at a different granularity. Qualify the word whenever more than one dataset is in scope.

### ChromeStatus feature

One entry in the ChromeStatus.com catalog: a Chromium launch, change, deprecation, or removal, often narrower than a web feature (several ChromeStatus features can map to one web feature). In this package's API, unqualified "feature" means a ChromeStatus feature.
Its numeric `id` is the **ChromeStatus feature ID**. Not to be confused with a web-features "feature ID", which is a string slug (see [AGENTS.md](./AGENTS.md) on keeping numeric IDs out of human-facing surfaces).

* _Reference_: `src/types.ts#ChromeStatusFeatureBasic`, `src/types.ts#ChromeStatusFeatureVerbose`
* _AKA_: FeatureEntry — the ChromeStatus datastore model

### Web feature

A cross-browser web platform capability defined by the [web-features](https://github.com/web-platform-dx/web-features) project (e.g. `anchor-positioning`), identified by a lowercase hyphenated slug. A ChromeStatus feature points to one or more web features through its `web_feature` field, which can hold a comma-separated list. Compile resolves that field (or an override) into `web_feature_ids`.

* _Reference_: `src/types.ts#CompiledFeatureFields.web_feature_ids`

### Web feature ID

The lowercase hyphenated slug that identifies a web feature (e.g. `canvas-html`). `web_feature` is the ChromeStatus field that stores it and stays as-is because it is part of the wire format. Use "web feature ID" in prose, identifiers, and reports.

* _Reference_: `src/compile-helpers.ts#resolveWebFeatureIds`
* _AKA_: feature ID / feature identifier — used by web-features
* _Avoid_: symbol, WebDX symbol, shortcode — rejected in favor of the upstream term

### BCD key

A dotted path in [@mdn/browser-compat-data](https://github.com/mdn/browser-compat-data) (e.g. `api.CSSPositionTryDescriptors`), the finest granularity in this project. A web feature lists the BCD keys it covers. BCD keys are what collector tests check. BCD's own docs call this a "feature identifier", which clashes with the web-features term, so this project uses "BCD key" as [web-features-mappings](https://github.com/web-platform-dx/web-features-mappings) does.

* _Reference_: `src/collector-results-index.ts#CollectorResultsIndex.getSupport`
* _AKA_: compat feature — used by web-features (`compat_features`); feature identifier — used by BCD

### Collector results

Per-BCD-key pass/fail results from running [mdn-bcd-collector](https://github.com/openwebdocs/mdn-bcd-collector) tests against real Chrome releases, read from the `mdn-bcd-results` submodule. This project uses only Chrome desktop on Windows runs. Not to be confused with BCD itself, which is curated documentation; collector results are observed behavior and act as ground truth in the conformance audit.

* _Reference_: `src/collector-results-index.ts#CollectorResultsIndex`
* _Avoid_: empirical — superseded in reports by commit 5b80fb1; rejected by the user for code too

### Feature name

The human-readable title of a ChromeStatus feature (`name`), used as the semantic lookup key. During compilation, duplicate titles get a ` (Phase N)` suffix, so a feature name in this package may not exactly match the title on ChromeStatus.com.

* _Reference_: `src/compile-helpers.ts#disambiguateFeatureNames`

### Basic feature

The shallow representation of a ChromeStatus feature: core identity, status, and browser fields, with no full stage records. All basic features are bundled together and loaded synchronously. Not to be confused with a verbose feature, which adds full stages and extended fields and is loaded on demand.

* _Reference_: `src/types.ts#ChromeStatusFeatureBasic`, `data/basic.json`
* _AKA_: basic — used by ChromeStatus (`feature_entry_to_json_basic`)
* _Avoid_: stub, lite, Option 2 — rejected in favor of the upstream term

### Verbose feature

The full representation of one ChromeStatus feature, including its stages, as returned by the ChromeStatus single-feature API. It is stored as one file per feature and loaded on demand.

* _Reference_: `src/types.ts#ChromeStatusFeatureVerbose`, `data/features/`
* _AKA_: verbose — used by ChromeStatus (`feature_entry_to_json_verbose`, `VerboseFeatureDict`)
* _Avoid_: detailed, chunk, Option 1 — rejected in favor of the upstream term

## Lifecycle and gating

### Stage

One lifecycle phase record attached to a ChromeStatus feature (e.g. Dev Trial, Origin Trial, Shipping), identified by its numeric `stage_type` code. Not to be confused with `intent_stage`, which is a separate ChromeStatus field describing the feature's overall launch-process step, not a stage record.

* _Reference_: `src/types.ts#Stage`, `src/types.ts#StageType`

### Active Origin Trial

A derived status: an Origin Trial that is currently running for developers, as determined at compile time from the Origin Trials API feed (stage milestone windows are used only when the feed is empty). A raw `browsers.chrome.origintrial: true` value, or simply having an Origin Trial stage, does **not** mean the trial is active, because ChromeStatus often keeps both after a trial ends.

* _Reference_: `src/compile-helpers.ts#evaluateActiveOriginTrial`, `gated_by: ['Origin Trial']`

### Gated feature

A not-yet-shipped ChromeStatus feature that can only be enabled through an Active Origin Trial or a browser flag. "Gated" is the umbrella for both mechanisms. Not to be confused with a ChromeStatus review **gate** (approval checkpoints such as privacy or security review exposed by the `/gates` API), which is a process concept unrelated to runtime availability.

* _Reference_: `src/types.ts#GatedBy`, `src/index.ts#ChromeStatusClient.getGatedFeatures`

### Flag

A browser runtime switch (such as an entry in `chrome://flags` or a command-line switch) that enables an unshipped feature. A feature that requires one is "behind a flag". This covers any flag, not only `--enable-experimental-web-platform-features`. Not to be confused with the ChromeStatus "Intent to Experiment" stage, which is an Origin Trial process step.

* _Reference_: `src/compile-helpers.ts#evaluateBehindFlag`, `gated_by: ['Flag']`
* _AKA_: flags — used by BCD support statements
* _Avoid_: experimental flag — implies only the experimental web platform features switch, and collides with "Intent to Experiment"

## Mapping

### Mapping

The link from a ChromeStatus feature to one or more web feature IDs. In this project a mapping comes from the upstream `web_feature` field or from an override. Upstream [web-features-mappings](https://github.com/web-platform-dx/web-features-mappings) also publishes ChromeStatus mappings (`mappings/chrome-status.json`). Heuristic matches (spec-URL or name candidates in the ChromeStatus edit suggestions) are only candidates and do not become mappings until someone accepts them. Not to be confused with the link from a web feature to its BCD keys, which web-features owns (`compat_features`).

* _Reference_: `src/compile-helpers.ts#resolveWebFeatureIds`
* _AKA_: mapping — used by web-features-mappings
* _Avoid_: join table — rejected in favor of the upstream term

### Override

A curated mapping (feature name → web feature ID) kept in this repository. When present, it takes precedence over the upstream `web_feature` value at compile time.

* _Reference_: `src/overrides.ts#CUSTOM_WEB_FEATURE_OVERRIDES`

### Unmapped

A ChromeStatus feature with no mapping: the field is absent, empty, or a sentinel such as `Missing feature` or `none`, and no override exists. Not to be confused with an orphan, which has a mapping that points to nothing.

### Orphan

A ChromeStatus feature whose mapping names an ID that does not exist in the web-features package. Not to be confused with an unmapped feature (no mapping at all) or a redirect (an ID that web-features marks as `moved` or `split`; "redirect" is the web-features term).

* _Reference_: `src/mapping-audit.ts#EditReason` (`invalid-id`)

## Audits

### Conformance audit

A three-way reconciliation of the Chrome shipping milestone recorded by ChromeStatus, by BCD (through web-features), and by collector test results. "Shipped in M_N_" is always attributed to one of these three sources. Each mismatch category names which source is wrong:

* **BCD lagging**: collector tests pass at or before the ChromeStatus milestone, but BCD records a later milestone or no support. BCD is wrong.
* **ChromeStatus stale**: collector tests and BCD agree, and ChromeStatus records a different milestone. ChromeStatus is wrong.
* **Coarse mapping**: the BCD milestone predates the earliest collector pass because a broad web feature also covers older BCD keys. The cause is a granularity mismatch between the ChromeStatus feature and the web feature, not a bug in this project's mapping logic.
* **Flag gap**: BCD records no support and collector tests first pass later than the ChromeStatus milestone, usually because the feature was behind a flag during collector runs or tests were written after launch.

* _Reference_: `src/conformance.ts#ConformanceAuditResult`
