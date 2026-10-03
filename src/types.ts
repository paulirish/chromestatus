/**
 * Core domain interfaces for ChromeStatus feature data.
 * Designed for high-performance client indexing and lazy payload evaluation.
 */

export type StageType = 
  | 110 // Intent to Prototype
  | 120 // Dev Trial
  | 130 // Intent to Experiment
  | 140 // Origin Trial
  | 150 // Origin Trial (Active / Specific)
  | 160 // Intent to Ship
  | 410 | 430 | 450 | 460 | 470; // Deprecation/Removal stages

export interface Stage {
  id: number;
  feature_id: number;
  stage_type: StageType;
  intent_stage: number;
  created: string;
  display_name: string | null;
  pm_emails: string[];
  tl_emails: string[];
  ux_emails: string[];
  te_emails: string[];
  intent_thread_url: string | null;
  announcement_url: string | null;
  experiment_goals: string | null;
  experiment_risks: string | null;
  origin_trial_id: string | null;
  ot_chromium_trial_name: string | null;
  ot_description: string | null;
  ot_display_name: string | null;
  ot_owner_email: string | null;
  ot_has_third_party_support: boolean;
  ot_is_critical_trial: boolean;
  ot_is_deprecation_trial: boolean;
  rollout_milestone: number | null;
  desktop_first: number | null;
  android_first: number | null;
  ios_first: number | null;
  webview_first: number | null;
  desktop_last: number | null;
  android_last: number | null;
  ios_last: number | null;
  webview_last: number | null;
}

export interface BrowserView {
  text: string | null;
  val: number | null;
  url: string | null;
  notes: string | null;
}

export interface ChromeBrowserSignals {
  announced: boolean;
  blink_components: string[];
  bug: string | null;
  devrel: string[];
  flag: boolean;
  origintrial: boolean;
  owners: string[];
  prefixed: boolean | null;
  status: {
    text: string;
    val: number;
    milestone_str?: string;
  };
  desktop?: number | null;
  android?: number | null;
  webview?: number | null;
  ios?: number | null;
}

export interface BrowserSignals {
  chrome: ChromeBrowserSignals;
  ff: { view: BrowserView };
  safari: { view: BrowserView };
  webdev: { view: BrowserView };
  other: { view: { notes: string | null } };
}

export interface StandardsStatus {
  spec: string | null;
  maturity: {
    short_text: string;
    text: string | null;
    val: number;
  };
}

export type GatedBy = 'Origin Trial' | 'Flag';

/** Fields added at compile time to every basic and verbose feature. */
export interface CompiledFeatureFields {
  /** Override if one exists, otherwise the ChromeStatus `web_feature` value: split, lowercased, moved IDs resolved. Empty when unmapped. */
  web_feature_ids: string[];
  /** Latest Baseline (newly available) year across `web_feature_ids`. */
  baseline_year?: number;
  gated_by: GatedBy[];
}

/** Fields shared by the raw basic and verbose ChromeStatus payloads. */
interface ChromeStatusFeatureCommon {
  id: number;
  name: string;
  summary: string;
  feature_type_int: number;
  unlisted: boolean;
  enterprise_impact: number;
  enterprise_product_category: number;
  breaking_change: boolean;
  confidential: boolean;
  first_enterprise_notification_milestone: number | null;
  blink_components: string[];
  resources: { samples: string[]; docs: string[] };
  creator: string;
  editors: string[];
  created: { by: string; when: string };
  updated: { by: string; when: string };
  accurate_as_of: string | null;
  standards: StandardsStatus;
  browsers: BrowserSignals;
  is_released: boolean;
}

/** One entry of `data/basic.json`: the ChromeStatus basic payload plus compiled fields. */
export interface ChromeStatusFeatureBasic extends ChromeStatusFeatureCommon, CompiledFeatureFields {
  owners: string[];
  milestone: number | null;
  first_of_section: boolean;
}

/** One `data/features/<id>.json` file: the ChromeStatus verbose payload plus compiled fields. Lists the fields this package reads. */
export interface ChromeStatusFeatureVerbose extends ChromeStatusFeatureCommon, CompiledFeatureFields {
  stages: Stage[];
  markdown_fields: string[];
  category: string;
  category_int: number;
  star_count: number;
  feature_notes: string | null;
  /** Raw ChromeStatus value; prefer `web_feature_ids`. */
  web_feature: string | null;
  is_official_web_feature: boolean | null;
  intent_stage: string;
  shipping_year: number | null;
  bug_url: string | null;
  spec_link: string | null;
  doc_links: string[];
  owner_emails: string[];
}

/**
 * Supplementary data for a web-features ID, compiled from web-features-mappings
 * (https://github.com/web-platform-dx/web-features-mappings). Each field is present only when upstream has data.
 */
export interface WebFeatureExtras {
  /** Chrome use counter: share of page loads using the feature, and its chromestatus.com metrics page. */
  useCounter?: { percentageOfPageLoad: number; url: string };
  standardsPositions?: ReadonlyArray<{ vendor: string; position: string; url: string }>;
  /** wpt.fyi results filtered to this feature. */
  wpt?: { url: string };
  interop?: ReadonlyArray<{ year: number; label: string; url: string }>;
  mdnDocs?: ReadonlyArray<{ title: string; url: string }>;
  developerSignals?: { url: string; votes: number };
}
