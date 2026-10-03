import { parseWebFeatureValue, type UpstreamMappings } from './upstream-mappings.ts';

/**
 * Audits local overrides and ChromeStatus `web_feature` values against web-features and
 * web-features-mappings, and produces a list of suggested ChromeStatus edits.
 */

/** Minimal shape of a raw ChromeStatus feature (data/raw/features-verbose.json). */
export interface RawFeatureLike {
  id: number;
  name: string;
  web_feature?: string | null;
  bug_url?: string | null;
  doc_links?: string[] | null;
}

/** Minimal shape of a web-features catalog entry. */
export interface WebFeatureEntryLike {
  kind: string;
  redirect_target?: string;
  redirect_targets?: string[];
}
export type WebFeaturesCatalog = Readonly<Record<string, WebFeatureEntryLike>>;

export type OverrideStatus =
  | 'redundant' // ChromeStatus already has exactly the override's IDs
  | 'conflict'  // ChromeStatus has valid IDs that differ from the override
  | 'needed'    // ChromeStatus has no valid IDs
  | 'broken'    // the override references an ID that isn't a current web-features feature
  | 'orphaned'; // no ChromeStatus feature has this name

export interface OverrideAuditEntry {
  featureName: string;
  chromestatusUrl: string | null;
  overrideIds: string[];
  chromeStatusIds: string[];
  upstreamIds: string[];
  status: OverrideStatus;
  notes: string[];
}

export function chromestatusUrl(id: number): string {
  return `https://chromestatus.com/feature/${id}`;
}

function describeId(id: string, catalog: WebFeaturesCatalog): string | null {
  if (!Object.hasOwn(catalog, id)) return `"${id}" is not a web-features ID`;
  const entry = catalog[id];
  if (entry.kind === 'moved') return `"${id}" moved to "${entry.redirect_target}"`;
  if (entry.kind === 'split') return `"${id}" split into ${JSON.stringify(entry.redirect_targets)}`;
  return null;
}

function isCurrentFeature(id: string, catalog: WebFeaturesCatalog): boolean {
  return Object.hasOwn(catalog, id) && catalog[id].kind === 'feature';
}

function resolveMoved(id: string, catalog: WebFeaturesCatalog): string {
  const entry = Object.hasOwn(catalog, id) ? catalog[id] : undefined;
  return entry?.kind === 'moved' && entry.redirect_target ? entry.redirect_target : id;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(x => b.includes(x));
}

/** Indexes upstream chrome-status.json as feature name -> web-features IDs. */
function upstreamIdsByName(upstream: UpstreamMappings): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const [wfId, entries] of Object.entries(upstream.chromeStatus)) {
    for (const e of entries) {
      const key = e.name.trim();
      byName.set(key, [...(byName.get(key) ?? []), wfId]);
    }
  }
  return byName;
}

function firstByName(features: ReadonlyArray<RawFeatureLike>): Map<string, RawFeatureLike> {
  const byName = new Map<string, RawFeatureLike>();
  for (const f of features) {
    const key = f.name.trim();
    if (!byName.has(key)) byName.set(key, f);
  }
  return byName;
}

export function auditOverrides(
  overrides: Readonly<Record<string, string>>,
  features: ReadonlyArray<RawFeatureLike>,
  upstream: UpstreamMappings,
  catalog: WebFeaturesCatalog
): OverrideAuditEntry[] {
  const byName = firstByName(features);
  const upstreamByName = upstreamIdsByName(upstream);

  return Object.entries(overrides).map(([featureName, value]) => {
    const overrideIds = parseWebFeatureValue(value);
    const feature = byName.get(featureName);
    const chromeStatusIds = parseWebFeatureValue(feature?.web_feature);
    const upstreamIds = upstreamByName.get(featureName) ?? [];
    const notes: string[] = [];

    for (const id of overrideIds) {
      const problem = describeId(id, catalog);
      if (problem) notes.push(`override: ${problem}`);
    }
    for (const id of chromeStatusIds) {
      const problem = describeId(id, catalog);
      if (problem) notes.push(`chromestatus: ${problem}`);
    }

    let status: OverrideStatus;
    const effectiveIds = [...new Set(chromeStatusIds.map(id => resolveMoved(id, catalog)))];
    if (!feature) status = 'orphaned';
    else if (!overrideIds.every(id => isCurrentFeature(id, catalog))) status = 'broken';
    else if (sameSet(overrideIds, effectiveIds)) status = 'redundant';
    else if (effectiveIds.length && effectiveIds.every(id => isCurrentFeature(id, catalog))) status = 'conflict';
    else status = 'needed';

    return {
      featureName,
      chromestatusUrl: feature ? chromestatusUrl(feature.id) : null,
      overrideIds,
      chromeStatusIds,
      upstreamIds,
      status,
      notes,
    };
  });
}

export type EditReason = 'override' | 'invalid-id' | 'moved-id' | 'split-id' | 'shared-bug' | 'mdn-docs';

export interface ChromeStatusEditSuggestion {
  featureName: string;
  chromestatusUrl: string;
  currentValue: string | null;
  /** null when a fix is needed but no specific ID can be suggested. */
  suggestedValue: string | null;
  reason: EditReason;
  evidence: string;
}

export function crbugId(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.match(/(?:crbug\.com\/|issues\.chromium\.org\/issues\/|bugs\.chromium\.org\/.*[?&]id=)(\d+)/)?.[1] ?? null;
}

/** Normalized MDN doc key: lowercased slug, plus `#anchor` when the URL targets a section. */
export function mdnKey(url: string, anchor?: string | null): string | null {
  const m = url.match(/developer\.mozilla\.org\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?docs\/([^#?]+)(?:\?[^#]*)?(?:#(.+))?/);
  if (!m) return null;
  const slug = m[1].replace(/\/$/, '').toLowerCase();
  const section = anchor ?? m[2];
  return section ? `${slug}#${section.toLowerCase()}` : slug;
}

function addToIndex(index: Map<string, Set<string>>, key: string, value: string): void {
  const set = index.get(key) ?? new Set<string>();
  set.add(value);
  index.set(key, set);
}

/** Finds a web-features ID that an invalid value was likely meant to be (case or punctuation slips). */
function guessIntendedId(value: string, catalog: WebFeaturesCatalog): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (normalized !== value && isCurrentFeature(normalized, catalog)) return normalized;
  return null;
}

export function suggestChromeStatusEdits(
  overrideAudit: ReadonlyArray<OverrideAuditEntry>,
  features: ReadonlyArray<RawFeatureLike>,
  upstream: UpstreamMappings,
  catalog: WebFeaturesCatalog
): ChromeStatusEditSuggestion[] {
  const suggestions: ChromeStatusEditSuggestion[] = [];
  const overridden = new Set(overrideAudit.map(o => o.featureName));

  // 1. Overrides that patch around ChromeStatus data.
  for (const o of overrideAudit) {
    if ((o.status === 'needed' || o.status === 'conflict') && o.chromestatusUrl) {
      suggestions.push({
        featureName: o.featureName,
        chromestatusUrl: o.chromestatusUrl,
        currentValue: o.chromeStatusIds.join(',') || null,
        suggestedValue: o.overrideIds.join(','),
        reason: 'override',
        evidence: `local override (${o.status})${o.notes.length ? '; ' + o.notes.join('; ') : ''}`,
      });
    }
  }

  // 2. ChromeStatus values that aren't current web-features IDs.
  const seen = new Set<string>();
  for (const f of features) {
    const name = f.name.trim();
    if (overridden.has(name) || seen.has(name)) continue;
    seen.add(name);
    const ids = parseWebFeatureValue(f.web_feature);
    if (!ids.length) continue;
    const fixed: string[] = [];
    let reason: EditReason | null = null;
    const evidence: string[] = [];
    let unresolved = false;
    for (const id of ids) {
      if (isCurrentFeature(id, catalog)) { fixed.push(id); continue; }
      if (Object.hasOwn(catalog, id) && catalog[id].kind === 'moved' && catalog[id].redirect_target) {
        fixed.push(catalog[id].redirect_target as string);
        reason ??= 'moved-id';
        evidence.push(`"${id}" moved to "${catalog[id].redirect_target}" in web-features`);
      } else if (Object.hasOwn(catalog, id) && catalog[id].kind === 'split') {
        fixed.push(...(catalog[id].redirect_targets ?? []));
        reason ??= 'split-id';
        evidence.push(`"${id}" split into ${JSON.stringify(catalog[id].redirect_targets)}; pick the relevant one(s)`);
      } else {
        reason = 'invalid-id';
        const guess = guessIntendedId(id, catalog);
        if (guess) { fixed.push(guess); evidence.push(`"${id}" is not a web-features ID; likely "${guess}"`); }
        else { unresolved = true; evidence.push(`"${id}" is not a web-features ID`); }
      }
    }
    if (reason) {
      suggestions.push({
        featureName: name,
        chromestatusUrl: chromestatusUrl(f.id),
        currentValue: ids.join(','),
        suggestedValue: unresolved ? null : [...new Set(fixed)].join(','),
        reason,
        evidence: evidence.join('; '),
      });
    }
  }

  // 3. Unmapped features: candidate IDs from shared Chrome bugs and MDN docs.
  const bugIndex = new Map<string, Set<string>>();
  for (const [wfId, b] of Object.entries(upstream.bugs)) {
    for (const url of b.chrome ?? []) {
      const id = crbugId(url);
      if (id && isCurrentFeature(wfId, catalog)) addToIndex(bugIndex, id, wfId);
    }
  }
  const mdnIndex = new Map<string, Set<string>>();
  for (const [wfId, docs] of Object.entries(upstream.mdnDocs)) {
    for (const d of docs) {
      const key = mdnKey(d.url, d.anchor);
      if (key && isCurrentFeature(wfId, catalog)) addToIndex(mdnIndex, key, wfId);
    }
  }
  const seenUnmapped = new Set<string>();
  for (const f of features) {
    const name = f.name.trim();
    if (overridden.has(name) || seenUnmapped.has(name) || parseWebFeatureValue(f.web_feature).length) continue;
    seenUnmapped.add(name);

    const bug = crbugId(f.bug_url);
    const bugIds = bug ? bugIndex.get(bug) : undefined;
    if (bugIds?.size) {
      suggestions.push({
        featureName: name,
        chromestatusUrl: chromestatusUrl(f.id),
        currentValue: null,
        suggestedValue: [...bugIds].join(','),
        reason: 'shared-bug',
        evidence: `crbug ${bug} is linked to ${[...bugIds].map(i => `"${i}"`).join(', ')} in web-features-mappings`,
      });
      continue;
    }
    const mdnIds = new Set<string>();
    const matchedDocs: string[] = [];
    for (const doc of f.doc_links ?? []) {
      const key = mdnKey(doc);
      const hits = key ? mdnIndex.get(key) : undefined;
      if (hits?.size) { matchedDocs.push(doc); for (const h of hits) mdnIds.add(h); }
    }
    if (mdnIds.size) {
      suggestions.push({
        featureName: name,
        chromestatusUrl: chromestatusUrl(f.id),
        currentValue: null,
        suggestedValue: [...mdnIds].join(','),
        reason: 'mdn-docs',
        evidence: `doc link(s) ${matchedDocs.join(', ')} map to ${[...mdnIds].map(i => `"${i}"`).join(', ')}`,
      });
    }
  }

  return suggestions;
}
