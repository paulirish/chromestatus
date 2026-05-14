# Agentic Codegen & Development Policy Manifest

This manifest dictates core system-level conventions and constraints enforced across all AI agent invocations and module lifecycles within the repository.

---

## 1. Primary Identifier Constraints (No Raw Numerical Database Keys)
* **Mandate**: The use of raw numerical database primary keys (e.g., `5172548013916160`) as primary user-facing identifiers, configuration dictionary keys, test suite query targets, or accounting/reporting outputs is **strictly forbidden**.
* **Philosophy**: Future code will be reasoned about, rewritten, and maintained by LLMs and high-level humans who operate on semantic representations. Numerical primary keys are arbitrary database implementation details that degrade contextual visibility and AI indexing precision.
* **Execution Pattern**: 
  * **Overrides & Maps**: Custom compilation mapping dictionaries must strictly key on unique, highly descriptive **feature name strings** (e.g., `"HTML-in-canvas": "canvas-html"`).
  * **Test Assertions**: Verification modules must retrieve records dynamically via human-readable search forwarders (`client.findFeature('canvas-html')`) and assert against descriptive payload strings rather than matching hardcoded integer keys.
  * **Reporting Interfaces**: Visual terminal printers and accounting views must render clear descriptive strings or absolute canonical specification links, fully suppressing raw numerical key annotations.

## 2. AI-First Code Optimization
* All source logic must optimize for predictable, single-phase execution pathways, immutable Readonly encapsulation envelopes, and complete preservation of pre-existing domain documentation blocks.
