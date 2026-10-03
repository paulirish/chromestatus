import fs from 'node:fs/promises';
import type { WebFeatureExtras } from './types.ts';

/**
 * Typed loader for web-features-mappings (https://github.com/web-platform-dx/web-features-mappings).
 * Every file is keyed by web-features ID. Missing or malformed files throw.
 */

export interface UpstreamChromeStatusEntry {
  name: string;
  url: string;
  'bug-url': string | null;
}
export interface UpstreamMdnDoc { title: string; url: string; anchor: string | null }
export interface UpstreamUseCounter { percentageOfPageLoad: number; url: string }
export interface UpstreamStandardsPosition { vendor: string; position: string; url: string }
export interface UpstreamWpt { url: string }
export interface UpstreamInterop { year: number; label: string; url: string }
export interface UpstreamDeveloperSignal { url: string; votes: number }
export interface UpstreamBugs { chrome?: string[]; firefox?: string[]; safari?: string[] }

export interface UpstreamMappings {
  readonly chromeStatus: Readonly<Record<string, ReadonlyArray<UpstreamChromeStatusEntry>>>;
  readonly bugs: Readonly<Record<string, UpstreamBugs>>;
  readonly mdnDocs: Readonly<Record<string, ReadonlyArray<UpstreamMdnDoc>>>;
  readonly useCounters: Readonly<Record<string, UpstreamUseCounter>>;
  readonly standardsPositions: Readonly<Record<string, ReadonlyArray<UpstreamStandardsPosition>>>;
  readonly wpt: Readonly<Record<string, UpstreamWpt>>;
  readonly interop: Readonly<Record<string, ReadonlyArray<UpstreamInterop>>>;
  readonly developerSignals: Readonly<Record<string, UpstreamDeveloperSignal>>;
}

export const DEFAULT_MAPPINGS_DIR = new URL('../submodules/web-features-mappings/mappings/', import.meta.url);

async function readRecord<T>(dir: URL, file: string): Promise<Readonly<Record<string, T>>> {
  const url = new URL(file, dir);
  const parsed: unknown = JSON.parse(await fs.readFile(url, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`web-features-mappings: ${file} is not a JSON object keyed by web-features ID.`);
  }
  return parsed as Record<string, T>;
}

export async function loadUpstreamMappings(dir: URL = DEFAULT_MAPPINGS_DIR): Promise<UpstreamMappings> {
  const [chromeStatus, bugs, mdnDocs, useCounters, standardsPositions, wpt, interop, developerSignals] = await Promise.all([
    readRecord<ReadonlyArray<UpstreamChromeStatusEntry>>(dir, 'chrome-status.json'),
    readRecord<UpstreamBugs>(dir, 'bugs.json'),
    readRecord<ReadonlyArray<UpstreamMdnDoc>>(dir, 'mdn-docs.json'),
    readRecord<UpstreamUseCounter>(dir, 'chrome-use-counters.json'),
    readRecord<ReadonlyArray<UpstreamStandardsPosition>>(dir, 'standards-positions.json'),
    readRecord<UpstreamWpt>(dir, 'wpt.json'),
    readRecord<ReadonlyArray<UpstreamInterop>>(dir, 'interop.json'),
    readRecord<UpstreamDeveloperSignal>(dir, 'developer-signals.json'),
  ]);
  return Object.freeze({ chromeStatus, bugs, mdnDocs, useCounters, standardsPositions, wpt, interop, developerSignals });
}

/** Collects upstream extras for the given web-features IDs, keyed by ID. IDs without any upstream data are omitted. */
export function buildWebFeatureExtras(ids: Iterable<string>, upstream: UpstreamMappings): Record<string, WebFeatureExtras> {
  const out: Record<string, WebFeatureExtras> = {};
  const get = <T>(rec: Readonly<Record<string, T>>, id: string): T | undefined => (Object.hasOwn(rec, id) ? rec[id] : undefined);
  for (const id of [...new Set(ids)].sort()) {
    const extras: WebFeatureExtras = {};
    const uc = get(upstream.useCounters, id);
    if (uc) extras.useCounter = { percentageOfPageLoad: uc.percentageOfPageLoad, url: uc.url };
    const sp = get(upstream.standardsPositions, id);
    if (sp?.length) extras.standardsPositions = sp.map(p => ({ vendor: p.vendor, position: p.position, url: p.url }));
    const wpt = get(upstream.wpt, id);
    if (wpt) extras.wpt = { url: wpt.url };
    const interop = get(upstream.interop, id);
    if (interop?.length) extras.interop = interop.map(i => ({ year: i.year, label: i.label, url: i.url }));
    const mdn = get(upstream.mdnDocs, id);
    if (mdn?.length) extras.mdnDocs = mdn.map(d => ({ title: d.title, url: d.url }));
    const ds = get(upstream.developerSignals, id);
    if (ds) extras.developerSignals = { url: ds.url, votes: ds.votes };
    if (Object.keys(extras).length) out[id] = extras;
  }
  return out;
}
