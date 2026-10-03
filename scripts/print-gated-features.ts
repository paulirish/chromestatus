import { ChromeStatusClient, type GatedBy } from '../src/index.ts';

/** Prints features in an Active Origin Trial or behind a flag, per gate. `--json` prints the same data as JSON. */
const client = await ChromeStatusClient.create();
const gates: GatedBy[] = ['Origin Trial', 'Flag'];

const report = Object.fromEntries(gates.map(gate => {
  const features = client.getGatedFeatures(gate);
  return [gate, {
    webFeatureIds: client.getGatedWebFeatureIds(gate),
    mapped: features.filter(f => f.web_feature_ids.length).map(f => ({ name: f.name, webFeatureIds: f.web_feature_ids })),
    unmapped: features.filter(f => !f.web_feature_ids.length).map(f => f.name),
  }];
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [gate, { webFeatureIds, mapped, unmapped }] of Object.entries(report)) {
    console.log(`\n## ${gate}: ${mapped.length + unmapped.length} features\n`);
    console.log(`### ${webFeatureIds.length} web feature IDs (from ${mapped.length} mapped features)\n`);
    for (const f of mapped) console.log(`- ${f.name}: ${f.webFeatureIds.map(id => `\`${id}\``).join(', ')}`);
    console.log(`\n### ${unmapped.length} unmapped features\n`);
    for (const name of unmapped) console.log(`- ${name}`);
  }
}
