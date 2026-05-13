# Package API Roadmap & Redesign Tasks

This document tracks planned architectural enhancements to the `@paulirish/chromestatus` client library to harden execution boundaries against upstream schema variations and optimize for AI coding assistant consumption.

## 🛠️ API Evolution Roadmap

- `[ ]` **Embed Absolute Status Getters Directly on Emitted Models**
  - Refactor returned feature objects to expose unambiguous native getters (e.g., `feature.hasActiveOriginTrial`, `feature.isFullyShipped`) to bypass manual collection mapping logic.
- `[ ]` **Standardize Lazy Hydration Behind Model Promise Methods**
  - Provide deferred timeline loading directly on base stub models via native asynchronous accessor methods (e.g., `await feature.loadStages()`), hiding filesystem chunk mapping execution internally.
- `[ ]` **Implement Native Cross-Referencing Mapping for `web-features`**
  - Expose first-class helper abstractions returning verified baseline support baselines and UseCounter enumerations directly joined from the `web-features` catalog.

---

## 🧪 Verification Guidance: Testing Web Feature IDs for Origin Trials

To test if specific web feature symbols (such as `'canvas'` or fuzzy strings like `'declarative-webmcp'`) are actively assigned to an Origin Trial, clients evaluate target states using pre-compiled collection scopes:

```typescript
import { createClient } from '@paulirish/chromestatus';

async function verifyOriginTrialGating() {
  const client = await createClient();

  // 1. Query matching feature entries cleanly using multi-pass heuristics
  const matches = client.query('canvas');
  const feature = matches[0];
  if (!feature) return;

  // 2. Verify active Origin Trial assignment directly via collection scope checks
  const activeTrials = client.features.where({ isOriginTrial: true }).toArray();
  const hasActiveOt = activeTrials.some(f => f.id === feature.id);

  console.log(`Feature "${feature.name}" Origin Trial Status: ${hasActiveOt}`);
}
```
