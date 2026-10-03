import type { ChromeStatusFeatureBasic } from '../src/types.ts';

const view = { text: 'No signal', val: 5, url: null, notes: null };

/** A compiled basic feature with realistic defaults; tests set only the fields they care about. */
export function basicFeature(fields: Partial<ChromeStatusFeatureBasic> & { id: number; name: string }): ChromeStatusFeatureBasic {
  return {
    summary: '',
    feature_type_int: 0,
    unlisted: false,
    enterprise_impact: 1,
    enterprise_product_category: 0,
    breaking_change: false,
    confidential: false,
    first_enterprise_notification_milestone: null,
    blink_components: ['Blink'],
    resources: { samples: [], docs: [] },
    creator: 'someone@chromium.org',
    editors: [],
    owners: [],
    created: { by: 'someone@chromium.org', when: '2024-01-01 00:00:00' },
    updated: { by: 'someone@chromium.org', when: '2024-01-01 00:00:00' },
    accurate_as_of: null,
    standards: { spec: null, maturity: { short_text: 'Unknown status', text: null, val: 1 } },
    browsers: {
      chrome: { announced: false, blink_components: ['Blink'], bug: null, devrel: [], flag: false, origintrial: false, owners: [], prefixed: false, status: { text: 'In development', val: 3 } },
      ff: { view }, safari: { view }, webdev: { view }, other: { view: { notes: null } },
    },
    is_released: false,
    milestone: null,
    first_of_section: false,
    web_feature_ids: [],
    gated_by: [],
    ...fields,
  };
}
