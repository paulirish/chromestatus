import { features as webFeatures } from 'web-features';
import { ChromeStatusClient } from '../src/index.ts';

/** Prints a markdown table of every web feature ID → ChromeStatus feature mapping, sorted by web feature ID. */
const client = await ChromeStatusClient.create();
const escape = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const rows = client.features
  .flatMap(f => f.web_feature_ids.map(webFeatureId => ({ webFeatureId, feature: f })))
  .sort((a, b) => a.webFeatureId.localeCompare(b.webFeatureId));

console.log('| Web Feature ID | Web Feature Name | Chrome Feature Name |');
console.log('| :--- | :--- | :--- |');
for (const { webFeatureId, feature } of rows) {
  const webName = Object.hasOwn(webFeatures, webFeatureId) ? webFeatures[webFeatureId].name ?? webFeatureId : '⚠️ (not in web-features)';
  console.log(`| \`${webFeatureId}\` | ${escape(webName)} | [${escape(feature.name)}](https://chromestatus.com/feature/${feature.id}) |`);
}
