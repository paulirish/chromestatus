import fs from 'node:fs/promises';
import path from 'node:path';
import { features as webFeatures } from 'web-features';
import type { ChromeStatusFeatureStub } from '../src/types.ts';

async function main() {
  const litePath = path.resolve(process.cwd(), 'data', 'lite.json');
  let stubs: ChromeStatusFeatureStub[] = [];
  
  try {
    const text = await fs.readFile(litePath, 'utf8');
    stubs = JSON.parse(text);
  } catch {
    console.error('Error: Compiled snapshot data/lite.json not found. Please run `pnpm run fetch` first.');
    process.exit(1);
  }

  const legitimateStubs = stubs.filter(f => 
    f.web_feature && 
    typeof f.web_feature === 'string' && 
    f.web_feature !== 'Missing feature' && 
    f.web_feature.trim() !== ''
  );

  const rows: {
    symbol: string;
    webName: string;
    chromeId: number;
    chromeName: string;
  }[] = [];

  for (const feature of legitimateStubs) {
    const symbol = feature.web_feature!;
    const matchedWeb = Object.hasOwn(webFeatures, symbol) 
      // @ts-expect-error - Mapping index lookup inside vendored framework dictionary
      ? webFeatures[symbol] 
      : undefined;

    rows.push({
      symbol,
      webName: matchedWeb?.name ?? '⚠️ (Unmatched in web-features)',
      chromeId: feature.id,
      chromeName: feature.name
    });
  }

  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));

  console.log('| Web Feature Symbol | Web Feature Name | Chrome Feature Name |');
  console.log('| :--- | :--- | :--- |');

  for (const r of rows) {
    const safeWebName = r.webName.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const safeChromeName = r.chromeName.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    console.log(`| \`${r.symbol}\` | ${safeWebName} | [${safeChromeName}](https://chromestatus.com/feature/${r.chromeId}) |`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
