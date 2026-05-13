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
  | 410 | 430 | 450 | 460 | 470 // Deprecation/Removal stages
  | number;

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
  other: { view: BrowserView };
}

export interface StandardsStatus {
  spec: string | null;
  maturity: {
    short_text: string;
    text: string | null;
    val: number;
  };
}

/**
 * Base lightweight feature model shipped synchronously in default client bundle.
 */
export interface ChromeStatusFeatureStub {
  id: number;
  name: string;
  summary: string;
  category: string;
  category_int?: number;
  blink_components: string[];
  star_count: number;
  is_released: boolean;
  browsers: {
    chrome: {
      origintrial: boolean;
      flag: boolean;
      status: { text: string; val: number };
      owners: string[];
    };
  };
  standards: {
    maturity: { short_text: string; val: number };
  };
  /** Resolved stage metadata summaries for core synchronous filtering */
  stage_types: StageType[];
}

/**
 * Complete verbose feature model containing all granular properties and stages.
 */
export interface ChromeStatusFeatureDetailed extends ChromeStatusFeatureStub {
  stages: Stage[];
  markdown_fields: string[];
  created: { by: string; when: string };
  updated: { by: string; when: string };
  browsers: BrowserSignals;
  standards: StandardsStatus;
  feature_notes: string | null;
  web_feature: string | null;
  is_official_web_feature: boolean | null;
  enterprise_impact: number;
  breaking_change: boolean;
  confidential: boolean;
  shipping_year: number | null;
  resources: {
    samples: string[];
    docs: string[];
  };
}

/** Query builder field inputs */
export interface FeatureQueryFields {
  stageType?: StageType;
  category?: string;
  isOriginTrial?: boolean;
  owner?: string;
  milestone?: number;
  component?: string;
}

export type FeaturePredicate = (feature: ChromeStatusFeatureStub) => boolean;
