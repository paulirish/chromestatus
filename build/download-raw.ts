import fs from 'node:fs/promises';
import path from 'node:path';

const rawDir = path.resolve(process.cwd(), 'data', 'raw');
// Public key the developer.chrome.com Origin Trials page uses; the API requires the matching x-origin.
const OT_API_URL = 'https://content-chromeorigintrials-pa.googleapis.com/v1/trials?prettyPrint=false&key=AIzaSyDNwqPBcgaOul_h00xdxbIlOFiNUYyZCl8';

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  console.log(`Fetching ${url}...`);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  // ChromeStatus prefixes JSON with an XSSI guard.
  return JSON.parse((await res.text()).trim().replace(/^\)\]\}'\n?/, ''));
}

function featuresPage(data: unknown): { total_count: number; features: unknown[] } {
  if (typeof data !== 'object' || data === null || !('features' in data) || !Array.isArray(data.features) || !('total_count' in data)) {
    throw new Error(`Unexpected ChromeStatus features response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { total_count: Number(data.total_count), features: data.features };
}

async function writeRaw(file: string, data: unknown): Promise<void> {
  await fs.writeFile(path.join(rawDir, file), JSON.stringify(data, null, 2));
  console.log(`Saved data/raw/${file}`);
}

async function main() {
  await fs.mkdir(rawDir, { recursive: true });

  const totalCount = featuresPage(await fetchJson('https://chromestatus.com/api/v0/features?num=1')).total_count;
  if (!(totalCount >= 3000)) throw new Error(`ChromeStatus reported total_count ${totalCount}; expected at least 3000.`);

  const features: unknown[] = [];
  const pageSize = 1000;
  for (let start = 0; start < totalCount; start += pageSize) {
    features.push(...featuresPage(await fetchJson(`https://chromestatus.com/api/v0/features?num=${pageSize}&start=${start}`)).features);
  }
  await writeRaw('features-verbose.json', { total_count: totalCount, features });

  await writeRaw('features-basic.json', await fetchJson('https://chromestatus.com/features.json'));
  await writeRaw('milestones.json', await fetchJson('https://chromiumdash.appspot.com/fetch_milestones'));
  await writeRaw('ot-api-trials.json', await fetchJson(OT_API_URL, { 'x-origin': 'https://developer.chrome.com' }));
}

main().catch(err => {
  console.error('Fatal error downloading raw data:', err);
  process.exit(1);
});
