/**
 * Centralized dictionary of custom compile-time and runtime overrides mapping
 * ChromeStatus feature names to WebDX/web-features identifier symbols.
 */
export const CUSTOM_WEB_FEATURE_OVERRIDES: Readonly<Record<string, string>> = {
  "HTML-in-canvas": "canvas-html",
  "Numeric separators": "numeric-separators",
  "CSS :open pseudo-class": "open-pseudo",
  "Prompt API Sampling Parameters": "languagemodel",
  "Web app HTML install element": "install",
  "Digital Credentials API (issuance support)": "digital-credentials",
  "Prerendering cross-origin iframes": "speculation-rules",
  "Proofreader API": "languagemodel",
  "WebMCP": "declarative-webmcp,navigator-modelcontext"
};
