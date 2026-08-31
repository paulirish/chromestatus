/**
 * Core domain interfaces for ChromeStatus feature data.
 * Designed for high-performance client indexing and lazy payload evaluation.
 */

/**
 * Official ChromeStatus stage type definitions derived from chromium-dashboard stage mappings.
 */
export const STAGE_TYPES = {
  // Blink standard feature lifecycle process (110–160)
  STAGE_BLINK_INCUBATE: 110,                     // Intent to Prototype / Incubate
  STAGE_BLINK_PROTOTYPE: 120,                    // Dev Trial / Prototype
  STAGE_BLINK_DEV_TRIAL: 130,                    // Intent to Experiment / Dev Trial
  STAGE_BLINK_ORIGIN_TRIAL: 140,                 // Origin Trial
  STAGE_BLINK_EXTEND_ORIGIN_TRIAL: 150,          // Extend Origin Trial / Origin Trial Active
  STAGE_BLINK_SHIPPED: 160,                      // Intent to Ship / Shipped

  // Deprecation and removal process (410–470)
  STAGE_DEPRECATION_ID_TO_DEPRECATE: 410,        // Intent to Deprecate and Remove
  STAGE_DEPRECATION_DEV_TRIAL: 430,             // Deprecation Dev Trial
  STAGE_DEPRECATION_DEPRECATION_TRIAL: 450,     // Deprecation Trial / Origin Trial
  STAGE_DEPRECATION_EXTEND_DEPRECATION_TRIAL: 460, // Extend Deprecation Trial
  STAGE_DEPRECATION_REMOVED: 470,                // Deprecation Removed

  // Semantic convenience aliases
  INTENT_TO_PROTOTYPE: 110,
  DEV_TRIAL: 120,
  INTENT_TO_EXPERIMENT: 130,
  ORIGIN_TRIAL: 140,
  ORIGIN_TRIAL_ACTIVE: 150,
  EXTEND_ORIGIN_TRIAL: 150,
  INTENT_TO_SHIP: 160,
  DEPRECATION_INTENT: 410,
  DEPRECATION_DEV_TRIAL: 430,
  DEPRECATION_TRIAL: 450,
  EXTEND_DEPRECATION_TRIAL: 460,
  DEPRECATION_REMOVED: 470,
} as const;

export type StageType = typeof STAGE_TYPES[keyof typeof STAGE_TYPES];

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
  web_feature?: string | null;
  baseline_year?: number;
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
