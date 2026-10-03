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
  "HTML-in-canvas": "canvas-html",
  "Digital Credentials API (issuance support)": "digital-credentials",
  "Prerendering cross-origin iframes": "speculation-rules",
  "Proofreader API": "languagemodel",
  "WebMCP": "declarative-webmcp,document-modelcontext"
};
