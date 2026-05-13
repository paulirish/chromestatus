# Package API Roadmap & Redesign Tasks

This document tracks planned architectural enhancements to the `@paulirish/chromestatus` client library to harden execution boundaries against upstream schema variations and optimize for AI coding assistant consumption.

## 🛠️ API Evolution Ideas.

These are just ideas. Not sure about them

- `[ ]` **Embed Absolute Status Getters Directly on Emitted Models**
  - Refactor returned feature objects to expose unambiguous native getters (e.g., `feature.hasActiveOriginTrial`, `feature.isFullyShipped`) to bypass manual collection mapping logic.
- `[ ]` **Standardize Lazy Hydration Behind Model Promise Methods**
  - Provide deferred timeline loading directly on base stub models via native asynchronous accessor methods (e.g., `await feature.loadStages()`), hiding filesystem chunk mapping execution internally.
- `[ ]` **Implement Native Cross-Referencing Mapping for `web-features`**
  - Expose first-class helper abstractions returning verified baseline support baselines and UseCounter enumerations directly joined from the `web-features` catalog.

---

also...

 ask some subagents to propose some real-world use cases that we can then try out to see if we can provide good answers in a nice idiomatic and clean way.

 cuz right now the api is trash

 