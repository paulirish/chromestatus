import { features as defaultWebFeatures } from 'web-features';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from './overrides.ts';
import type { GatedBy, Stage } from './types.ts';

/** Minimal web-features catalog entry shape used for resolution. */
export interface WebFeatureEntryLike {
  kind: string;
  redirect_target?: string;
  redirect_targets?: string[];
  status?: { baseline_low_date?: string; support?: Record<string, string> };
  name?: string;
  description?: string;
  spec?: string | string[];
}
export type WebFeaturesCatalog = Readonly<Record<string, WebFeatureEntryLike>>;

const DEFAULT_CATALOG = defaultWebFeatures as WebFeaturesCatalog;

/** Features that reached Baseline before this year are considered shipped, so a stale gate on them is ignored. */
const GATING_BASELINE_CUTOFF_YEAR = 2024;

/** Splits a raw ChromeStatus `web_feature` value into IDs, dropping sentinel placeholders. */
export function parseWebFeatureValue(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'Missing feature' || trimmed.toLowerCase() === 'none') return [];
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
}

function catalogEntry(id: string, catalog: WebFeaturesCatalog): WebFeatureEntryLike | undefined {
  return Object.hasOwn(catalog, id) ? catalog[id] : undefined;
}

/** Follows a web-features `moved` redirect; `split` IDs are left alone since the right target is ambiguous. */
export function resolveMovedWebFeatureId(id: string, catalog: WebFeaturesCatalog = DEFAULT_CATALOG): string {
  const entry = catalogEntry(id, catalog);
  return entry?.kind === 'moved' && entry.redirect_target ? entry.redirect_target : id;
}

/**
 * The mapping for one ChromeStatus feature: its override if one exists, otherwise its `web_feature` value,
 * with placeholders dropped, IDs lowercased, and moved IDs rewritten to their current ID.
 *
 * Values web-features doesn't know pass through unchanged. ChromeStatus has some, e.g. `4217` (a web-features
 * GitHub issue number) on "JS Self-Profiling Markers". They're kept so the bad data stays visible;
 * `pnpm run audit:chromestatus-edits` lists them as invalid IDs to fix upstream.
 */
export function resolveWebFeatureIds(
  feature: { name: string; web_feature?: string | null },
  catalog: WebFeaturesCatalog = DEFAULT_CATALOG
): string[] {
  const name = feature.name.trim();
  const raw = Object.hasOwn(CUSTOM_WEB_FEATURE_OVERRIDES, name) ? CUSTOM_WEB_FEATURE_OVERRIDES[name] : feature.web_feature;
  return [...new Set(parseWebFeatureValue(raw).map(id => resolveMovedWebFeatureId(id.toLowerCase(), catalog)))];
}

/** Year a web feature became Baseline (newly available), following moved redirects. */
export function resolveWebFeatureBaselineYear(webFeatureId: string, catalog: WebFeaturesCatalog = DEFAULT_CATALOG): number | undefined {
  const date = catalogEntry(resolveMovedWebFeatureId(webFeatureId, catalog), catalog)?.status?.baseline_low_date;
  if (typeof date !== 'string') return undefined;
  const year = parseInt(date.split('-')[0], 10);
  return Number.isNaN(year) ? undefined : year;
}

/** Latest Baseline year across a feature's web feature IDs. */
export function resolveBaselineYear(
  webFeatureIds: ReadonlyArray<string>,
  baselineYearResolver: (webFeatureId: string) => number | undefined = resolveWebFeatureBaselineYear
): number | undefined {
  const years = webFeatureIds.map(id => baselineYearResolver(id)).filter((y): y is number => y !== undefined);
  return years.length ? Math.max(...years) : undefined;
}

/** Raw verbose ChromeStatus feature fields that gating reads. */
export interface GatingInput {
  id: number;
  unlisted?: boolean;
  intent_stage?: string;
  browsers?: { chrome?: { flag?: boolean; origintrial?: boolean; status?: { text?: string } } };
  stages?: ReadonlyArray<Partial<Stage>>;
}

export interface OriginTrialContext {
  activeStableMilestone: number;
  /** ChromeStatus feature IDs and Chromium trial names currently listed as active by the Origin Trials API. */
  otApiActiveFeatureIds: ReadonlySet<number>;
  otApiActiveTrialNames: ReadonlySet<string>;
}

function statusText(f: GatingInput): string {
  return (f.browsers?.chrome?.status?.text ?? '').toLowerCase();
}

/** True when ChromeStatus says the feature shipped, was removed, or was abandoned, or the entry is unlisted. */
function isShippedOrAbandoned(f: GatingInput): boolean {
  const status = statusText(f);
  const intent = (f.intent_stage ?? '').toLowerCase();
  return f.unlisted === true ||
    ['enabled by default', 'shipped', 'removed', 'no longer pursuing'].some(s => status.includes(s)) ||
    ['shipped', 'removed'].some(s => intent.includes(s));
}

function isOldBaseline(baselineYear: number | undefined): boolean {
  return baselineYear !== undefined && baselineYear < GATING_BASELINE_CUTOFF_YEAR;
}

function originTrialStages(f: GatingInput): Partial<Stage>[] {
  return (f.stages ?? []).filter(s => s.stage_type === 150);
}

function isListedByOtApi(f: GatingInput, ctx: OriginTrialContext): boolean {
  return ctx.otApiActiveFeatureIds.has(f.id) ||
    originTrialStages(f).some(s => typeof s.ot_chromium_trial_name === 'string' && ctx.otApiActiveTrialNames.has(s.ot_chromium_trial_name));
}

/**
 * Milestone-window heuristic for when the Origin Trials API feed has no data.
 * ChromeStatus keeps Origin Trial stages forever and old ones often have `desktop_last: null`, so a stage alone
 * doesn't mean the trial is running: shipped/removed status wins, future trials (start > stable) don't count yet,
 * and an open-ended stage counts only while the feature still reads as in development or in trial.
 */
function looksLikeActiveTrial(f: GatingInput, stableMilestone: number): boolean {
  // Not `is_released`: ChromeStatus sets it for any release-channel status, including "Origin trial" and
  // "Behind a flag" (RELEASE_IMPL_STATES in chromium-dashboard internals/core_enums.py).
  if (isShippedOrAbandoned(f)) return false;
  const status = statusText(f);
  const stages = originTrialStages(f);
  const inWindow = stages.some(s => {
    if ((s.desktop_first ?? 0) > stableMilestone) return false;
    if (s.desktop_last != null) return s.desktop_last >= stableMilestone;
    return status.includes('origin trial') || status.includes('in development') || f.browsers?.chrome?.origintrial === true;
  });
  if (inWindow) return true;
  const hasEndedTrial = stages.some(s => s.desktop_last != null && s.desktop_last < stableMilestone);
  return status.includes('origin trial') && !hasEndedTrial;
}

/**
 * Whether a feature is in an Active Origin Trial. The Origin Trials API feed is authoritative when it has data;
 * the milestone heuristic is used only when the feed is empty. Features that reached Baseline before 2024 are excluded.
 */
export function evaluateActiveOriginTrial(f: GatingInput, ctx: OriginTrialContext, baselineYear: number | undefined): boolean {
  if (isOldBaseline(baselineYear)) return false;
  const feedHasData = ctx.otApiActiveFeatureIds.size > 0 || ctx.otApiActiveTrialNames.size > 0;
  return feedHasData ? isListedByOtApi(f, ctx) : looksLikeActiveTrial(f, ctx.activeStableMilestone);
}

/** Whether a feature is behind a flag and not yet shipped. Features that reached Baseline before 2024 are excluded. */
export function evaluateBehindFlag(f: GatingInput, baselineYear: number | undefined): boolean {
  const flagged = f.browsers?.chrome?.flag === true || statusText(f).includes('behind a flag');
  return flagged && !isShippedOrAbandoned(f) && !isOldBaseline(baselineYear);
}

export function resolveGatedBy(f: GatingInput, ctx: OriginTrialContext, baselineYear: number | undefined): GatedBy[] {
  const gatedBy: GatedBy[] = [];
  if (evaluateActiveOriginTrial(f, ctx, baselineYear)) gatedBy.push('Origin Trial');
  if (evaluateBehindFlag(f, baselineYear)) gatedBy.push('Flag');
  return gatedBy;
}

/** Appends ` (Phase N)` to repeated feature names so names stay unique lookup keys. */
export function disambiguateFeatureNames(features: { name: string }[]): void {
  const seenNames = new Set<string>();
  for (const f of features) {
    const baseName = f.name.trim();
    let name = baseName;
    for (let n = 2; seenNames.has(name.toLowerCase()); n++) name = `${baseName} (Phase ${n})`;
    seenNames.add(name.toLowerCase());
    f.name = name;
  }
}
