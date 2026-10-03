import fs from 'node:fs/promises';

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

async function readRecord(dir: URL, file: string): Promise<Record<string, any>> {
  const url = new URL(file, dir);
  const parsed: unknown = JSON.parse(await fs.readFile(url, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`web-features-mappings: ${file} is not a JSON object keyed by web-features ID.`);
  }
  return parsed as Record<string, any>;
}

export async function loadUpstreamMappings(dir: URL = DEFAULT_MAPPINGS_DIR): Promise<UpstreamMappings> {
  const [chromeStatus, bugs, mdnDocs, useCounters, standardsPositions, wpt, interop, developerSignals] = await Promise.all([
    readRecord(dir, 'chrome-status.json'),
    readRecord(dir, 'bugs.json'),
    readRecord(dir, 'mdn-docs.json'),
    readRecord(dir, 'chrome-use-counters.json'),
    readRecord(dir, 'standards-positions.json'),
    readRecord(dir, 'wpt.json'),
    readRecord(dir, 'interop.json'),
    readRecord(dir, 'developer-signals.json'),
  ]);
  return Object.freeze({ chromeStatus, bugs, mdnDocs, useCounters, standardsPositions, wpt, interop, developerSignals });
}

/** Splits a raw ChromeStatus `web_feature` value into IDs, dropping sentinel placeholders. */
export function parseWebFeatureValue(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'Missing feature' || trimmed.toLowerCase() === 'none') return [];
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}
