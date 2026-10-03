# Project Lexicon

The canonical domain language for this project and the conceptual boundaries those terms represent.

## Sources and granularity

This package joins three datasets that each use the word "feature" at a different granularity. Qualify the word whenever more than one dataset is in scope.

### ChromeStatus feature

One entry in the ChromeStatus.com catalog: a Chromium launch, change, deprecation, or removal, often narrower than a web feature. In this package's API, unqualified "feature" means a ChromeStatus feature.
Its numeric `id` is the **ChromeStatus feature ID**. Not to be confused with a web-features "feature ID", which is a string slug (see [AGENTS.md](./AGENTS.md) on keeping numeric IDs out of human-facing surfaces).

* _Reference_: `src/types.ts#ChromeStatusFeatureBasic`, `src/types.ts#ChromeStatusFeatureVerbose`
* _AKA_: FeatureEntry — the ChromeStatus datastore model

### Web feature

A cross-browser web platform capability defined by the [web-features](https://github.com/web-platform-dx/web-features) project (e.g. `anchor-positioning`). One ChromeStatus feature can map to several web features, and one web feature usually has several ChromeStatus features.

### Web feature ID

The lowercase hyphenated slug that identifies a web feature (e.g. `canvas-html`). ChromeStatus stores it in its `web_feature` field; that wire name is upstream's, so use "web feature ID" everywhere else.

* _Reference_: `src/compile-helpers.ts#resolveWebFeatureIds`
* _AKA_: feature ID / feature identifier — used by web-features
* _Avoid_: symbol, WebDX symbol, shortcode — rejected in favor of the upstream term

### BCD key

A dotted path in [@mdn/browser-compat-data](https://github.com/mdn/browser-compat-data) (e.g. `api.CSSPositionTryDescriptors`), the finest granularity in this project. A web feature covers a set of BCD keys. BCD's own docs call this a "feature identifier", which clashes with the web-features term, so this project uses "BCD key" as [web-features-mappings](https://github.com/web-platform-dx/web-features-mappings) does.

* _AKA_: compat feature — used by web-features (`compat_features`); feature identifier — used by BCD

### Collector results

Pass/fail results per BCD key from running [mdn-bcd-collector](https://github.com/openwebdocs/mdn-bcd-collector) tests against real browser releases. Not to be confused with BCD itself: BCD is curated documentation, while collector results are observed behavior.

* _Reference_: `src/collector-results-index.ts#CollectorResultsIndex`
* _Avoid_: empirical — superseded in reports by commit 5b80fb1; rejected by the user for code too

### Feature name

The human-readable title of a ChromeStatus feature (`name`), used as the semantic lookup key. This package keeps feature names unique, so a feature name may differ from the title shown on ChromeStatus.com.

* _Reference_: `src/compile-helpers.ts#disambiguateFeatureNames`

### Basic feature

The shallow representation of a ChromeStatus feature: identity, status, and mapping, without stage records. Not to be confused with a verbose feature, the full representation of the same feature.

* _Reference_: `src/types.ts#ChromeStatusFeatureBasic`
* _AKA_: basic — used by ChromeStatus (`feature_entry_to_json_basic`)
* _Avoid_: stub, lite, Option 2 — rejected in favor of the upstream term

### Verbose feature

The full representation of one ChromeStatus feature, including its stages, as ChromeStatus returns it for a single feature.

* _Reference_: `src/types.ts#ChromeStatusFeatureVerbose`
* _AKA_: verbose — used by ChromeStatus (`feature_entry_to_json_verbose`, `VerboseFeatureDict`)
* _Avoid_: detailed, chunk, Option 1 — rejected in favor of the upstream term

## Lifecycle and gating

### Stage

One lifecycle phase record attached to a ChromeStatus feature (e.g. Dev Trial, Origin Trial, Shipping), identified by its `stage_type`. Not to be confused with `intent_stage`, a separate ChromeStatus field for the feature's overall launch-process step.

* _Reference_: `src/types.ts#Stage`

### Active Origin Trial

An Origin Trial that developers can sign up for and use right now. It is a derived status, not a ChromeStatus field: ChromeStatus keeps Origin Trial stages and its `origintrial` flag after a trial ends, so neither means the trial is active.

* _Reference_: `src/compile-helpers.ts#evaluateActiveOriginTrial`

### Gated feature

A not-yet-shipped ChromeStatus feature that can only be enabled through an Active Origin Trial or a flag. "Gated" is the umbrella for both. Not to be confused with a ChromeStatus review **gate** (an approval checkpoint such as privacy or security review), which is a launch-process concept unrelated to whether the feature can run.

* _Reference_: `src/types.ts#GatedBy`

### Flag

A browser runtime switch (such as an entry in `chrome://flags` or a command-line switch) that enables an unshipped feature. A feature that requires one is "behind a flag". Not to be confused with the ChromeStatus "Intent to Experiment" stage, which is an Origin Trial process step.

* _AKA_: flags — used by BCD support statements
* _Avoid_: experimental flag — implies only the experimental web platform features switch, and collides with "Intent to Experiment"

## Mapping

### Mapping

The link from a ChromeStatus feature to one or more web feature IDs. Heuristic suggestions are candidates, not mappings, until someone accepts them. Not to be confused with the link from a web feature to its BCD keys, which web-features owns.

* _Reference_: `src/compile-helpers.ts#resolveWebFeatureIds`
* _AKA_: mapping — used by web-features-mappings
* _Avoid_: join table — rejected in favor of the upstream term

### Override

A mapping curated in this repository that takes precedence over what ChromeStatus records.

* _Reference_: `src/overrides.ts#CUSTOM_WEB_FEATURE_OVERRIDES`

### Unmapped

A ChromeStatus feature with no mapping. ChromeStatus placeholder values such as `Missing feature` or `none` count as no mapping. Not to be confused with a mapping to an ID that web-features doesn't have (an invalid ID), or to an ID that web-features marks as `moved` or `split` (a redirect, the web-features term).

## Audits

### Conformance audit

A comparison of when ChromeStatus, BCD, and collector results each say a feature shipped in Chrome, used to find which source is wrong.

* _Reference_: `src/conformance.ts#ConformanceAuditor`

### ChromeStatus stale

A conformance finding that ChromeStatus records the wrong shipping milestone, typically because the entry wasn't updated when plans changed. ChromeStatus is the source to fix. Not to be confused with **BCD lagging**, where BCD records support later than it actually shipped and BCD is the source to fix.

### Coarse mapping

A conformance finding that a web feature is broader than the ChromeStatus feature mapped to it, so BCD's milestone reflects older parts of the web feature. This describes a granularity mismatch between the two catalogs, not a bug in this project's mapping logic.

### Flag gap

A conformance finding that collector results show support later than ChromeStatus says the feature shipped, while BCD records no support at all, typically because the collector ran without a needed flag or tests were written after launch. Not to be confused with a feature being behind a flag today; a flag gap is about historical test coverage.
