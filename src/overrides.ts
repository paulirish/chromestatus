/**
 * Centralized dictionary of custom compile-time and runtime overrides mapping
 * ChromeStatus feature names to WebDX/web-features identifier symbols.
 *
 * Each entry patches missing or wrong ChromeStatus data. `pnpm run audit:overrides` flags
 * entries that became redundant, broken, or orphaned, and `pnpm run audit:chromestatus-edits`
 * lists the matching upstream ChromeStatus fixes so entries can eventually be deleted.
 * IDs that web-features marks as `moved` are resolved at compile time and don't need entries here.
 */
export const CUSTOM_WEB_FEATURE_OVERRIDES: Readonly<Record<string, string>> = {
  // ChromeStatus has `canvas` (the <canvas> element, Baseline since Chrome 1). `canvas-html` is the
  // layoutsubtree feature and shares this entry's WICG/html-in-canvas spec.
  "HTML-in-canvas": "canvas-html",
  "Digital Credentials API (issuance support)": "digital-credentials",
  "Prerendering cross-origin iframes": "speculation-rules",
  "Proofreader API": "languagemodel",
  // ChromeStatus has only `document-modelcontext`. The one WebMCP entry (flag/trial "WebMCP") also ships the
  // declarative form attributes, which web-features tracks separately, and Chromium counts them separately
  // (kDocumentModelcontext, kDeclarativeWebmcp).
  "WebMCP": "declarative-webmcp,document-modelcontext"
};
