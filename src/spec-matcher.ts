export function normalizeBaseUrl(url: string | null | undefined): string {
  if (!url) return '';
  const parsed = URL.parse(url);
  // ChromeStatus spec fields are sometimes free text rather than a URL.
  return (parsed ? `${parsed.origin}${parsed.pathname}` : url.trim().split('#')[0]).replace(/\/$/, '');
}

export function extractAnchor(url: string | null | undefined): string | null {
  if (!url || !url.includes('#')) return null;
  return url.split('#')[1];
}

export const BROAD_WEB_FEATURE_IDS = new Set(['html', 'dom', 'fetch', 'xhr', 'svg']);

export function isSpecMatch(dSpec: string, wSpec: string): boolean {
  const baseDSpec = normalizeBaseUrl(dSpec);
  const anchorDSpec = extractAnchor(dSpec);
  const baseWSpec = normalizeBaseUrl(wSpec);
  const anchorWSpec = extractAnchor(wSpec);
  
  if (!baseDSpec || !baseWSpec) return false;
  if (!(baseDSpec === baseWSpec || baseWSpec.startsWith(baseDSpec) || baseDSpec.startsWith(baseWSpec))) return false;

  // Strict alignment checking for monolithic standards to avoid broad mapping
  if (baseDSpec.includes('html.spec.whatwg.org') || baseDSpec.includes('w3.org')) {
    return !!(anchorDSpec && anchorWSpec && anchorDSpec === anchorWSpec);
  }
  // Different sections of one spec are different features.
  return !(anchorDSpec && anchorWSpec && anchorDSpec !== anchorWSpec);
}
