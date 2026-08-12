export function normalizeBaseUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return (url || '').trim().replace(/\/$/, '').split('#')[0];
  }
}

export function extractAnchor(url: string | null | undefined): string | null {
  if (!url || !url.includes('#')) return null;
  return url.split('#')[1];
}

export const MONOLITHIC_SYMBOLS = new Set(['html', 'dom', 'css', 'fetch', 'xhr', 'svg', 'webappsec']);

export function isSpecMatch(dSpec: string, wSpec: string): boolean {
  const baseDSpec = normalizeBaseUrl(dSpec);
  const anchorDSpec = extractAnchor(dSpec);
  const baseWSpec = normalizeBaseUrl(wSpec);
  const anchorWSpec = extractAnchor(wSpec);
  
  if (!baseDSpec || !baseWSpec) return false;

  if (baseDSpec === baseWSpec || baseWSpec.startsWith(baseDSpec) || baseDSpec.startsWith(baseWSpec)) {
    // Strict alignment checking for monolithic standards to avoid broad mapping
    if (baseDSpec.includes('html.spec.whatwg.org') || baseDSpec.includes('w3.org')) {
      return !!(anchorDSpec && anchorWSpec && anchorDSpec === anchorWSpec);
    }
    return true;
  }
  return false;
}
