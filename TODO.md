# Package API Roadmap & Redesign Ideas

Potential architectural enhancements to `@paulirish/chromestatus` to consider:

- `[x]` **Cross-referencing mappings for `web-features`**: Joined web feature IDs, Baseline years, and `web-features-mappings` extras (`useCounter`, `standardsPositions`, `wpt`, `interop`, etc.).
- `[ ]` **Convenience Status Getters on Features**: Expose explicit helper predicates or getters on items (e.g., `feature.hasActiveOriginTrial`, `feature.isShipped`) rather than manual inspection.
- `[ ]` **Model-level hydration helper**: Method on feature instances (e.g. `feature.fetchVerbose()`) as an alternative to `client.getFeatureVerbose(feature.name)`.
- `[ ]` **Explore user use cases**: Propose real-world developer & analyst workflows to stress-test the client API ergonomics.


 