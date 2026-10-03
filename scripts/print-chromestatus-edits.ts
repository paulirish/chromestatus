import fs from 'node:fs/promises';
import { features as webFeatures } from 'web-features';
import { CUSTOM_WEB_FEATURE_OVERRIDES } from '../src/overrides.ts';
import { loadUpstreamMappings } from '../src/upstream-mappings.ts';
import {
  auditOverrides,
  suggestChromeStatusEdits,
  type ChromeStatusEditSuggestion,
  type EditReason,
  type WebFeaturesCatalog,
  chromestatusUrl,
} from '../src/mapping-audit.ts';
import { loadRawFeatures } from './audit-overrides.ts';
import { ChromeStatusClient } from '../src/index.ts';

const SECTION_TITLES: Record<EditReason, string> = {
  'override': 'Locally overridden (ChromeStatus value is missing or wrong)',
  'invalid-id': 'Value is not a web-features ID',
  'moved-id': 'Value is a moved web-features ID',
  'split-id': 'Value is a split web-features ID',
  'shared-bug': 'Unmapped, but its crbug is linked to a web-features ID',
  'mdn-docs': 'Unmapped, but its MDN doc links map to a web-features ID',
  'spec-url': 'Unmapped, but its spec URL is listed by a web-features ID',
  'name-match': 'Unmapped, but its name contains a web-features feature name',
};

function toMarkdown(suggestions: ChromeStatusEditSuggestion[], gatedByUrl: ReadonlyMap<string, string>): string {
  const lines = ['# Suggested ChromeStatus `web_feature` edits', ''];
  for (const reason of Object.keys(SECTION_TITLES) as EditReason[]) {
    const group = suggestions.filter(s => s.reason === reason);
    if (!group.length) continue;
    lines.push(`## ${SECTION_TITLES[reason]} (${group.length})`, '');
    lines.push('| Feature | Gated by | Current | Suggested | Evidence |', '|---|---|---|---|---|');
    for (const s of group) {
      const cell = (v: string | null) => (v ? `\`${v}\`` : '—');
      lines.push(`| [${s.featureName.replaceAll('|', '\\|')}](${s.chromestatusUrl}) | ${gatedByUrl.get(s.chromestatusUrl) ?? ''} | ${cell(s.currentValue)} | ${s.suggestedValue ? cell(s.suggestedValue) : '_needs a valid ID_'} | ${s.evidence.replaceAll('|', '\\|')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const [features, upstream, client] = await Promise.all([loadRawFeatures(), loadUpstreamMappings(), ChromeStatusClient.create()]);
  const gatedByUrl = new Map(client.getGatedFeatures().map(f => [chromestatusUrl(f.id), f.gated_by.join(', ')]));
  const catalog = webFeatures as WebFeaturesCatalog;
  const audit = auditOverrides(CUSTOM_WEB_FEATURE_OVERRIDES, features, upstream, catalog);
  const suggestions = suggestChromeStatusEdits(audit, features, upstream, catalog);

  const outUrl = new URL('../data/chromestatus-edit-suggestions.md', import.meta.url);
  await fs.writeFile(outUrl, toMarkdown(suggestions, gatedByUrl));
  const counts = Object.groupBy(suggestions, s => s.reason);
  console.log(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v?.length ?? 0])));
  console.log('Wrote data/chromestatus-edit-suggestions.md');
}

main().catch(err => { console.error(err); process.exit(1); });
