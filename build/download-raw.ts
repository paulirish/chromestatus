import fs from 'node:fs/promises';
import path from 'node:path';

async function fetchCleanJson(url: string): Promise<any> {
  console.log(`Fetching ${url}...`);
  // Implement explicit AbortSignal timeout wrappers to prevent indefinite network deadlocks
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status} fetching ${url}`);
  }
  let text = await res.text();
  // Robust prefix stripping handling intermediate whitespace or byte order marks (BOM)
  text = text.trim().replace(/^\)\]\}'\n?/, '');
  return JSON.parse(text);
}

async function main() {
  const rawDir = path.resolve(process.cwd(), 'data', 'raw');
  await fs.mkdir(rawDir, { recursive: true });

  console.log("Starting raw data download into data/raw/...");

  // 1. Verbose features
  console.log("Fetching verbose data pagination metadata...");
  const initialData = await fetchCleanJson('https://chromestatus.com/api/v0/features?num=1');
  const totalCount = Number(initialData?.total_count);
  if (!totalCount || isNaN(totalCount) || totalCount < 3000) {
    throw new Error(`Invalid API response: total_count evaluates to unexpected bounds (${totalCount}).`);
  }
  console.log(`Total features reported by API: ${totalCount}`);

  const verboseFeatures: any[] = [];
  const pageSize = 1000;
  for (let start = 0; start < totalCount; start += pageSize) {
    const pageData = await fetchCleanJson(`https://chromestatus.com/api/v0/features?num=${pageSize}&start=${start}`);
    if (pageData?.features && Array.isArray(pageData.features)) {
      verboseFeatures.push(...pageData.features);
    } else {
      console.warn(`Warning: Page starting at ${start} did not return an array of features.`);
    }
  }
  
  await fs.writeFile(
    path.join(rawDir, 'features-verbose.json'),
    JSON.stringify({ total_count: totalCount, features: verboseFeatures })
  );
  console.log(`Saved raw verbose features to data/raw/features-verbose.json`);

  // 2. Milestones
  console.log("Fetching live Chromium release schedule milestone metadata...");
  try {
    const scheduleData = await fetchCleanJson('https://chromiumdash.appspot.com/fetch_milestones');
    await fs.writeFile(
      path.join(rawDir, 'milestones.json'),
      JSON.stringify(scheduleData)
    );
    console.log(`Saved raw milestones to data/raw/milestones.json`);
  } catch (err) {
    console.warn("Warning: Failed to fetch dynamic release milestones from Chromium schedule API. Skipping cache write.", err);
  }

  // 3. Lite features
  console.log("Fetching Lite array data...");
  const option2Data = await fetchCleanJson('https://chromestatus.com/features.json');
  await fs.writeFile(
    path.join(rawDir, 'features-lite.json'),
    JSON.stringify(option2Data)
  );
  console.log(`Saved raw lite features to data/raw/features-lite.json`);

  // 4. Live Authoritative Origin Trials API feed
  console.log("Fetching live authoritative Google Chrome Origin Trials API payload...");
  try {
    // Utilizing public discovery key with minimal required x-origin authorization header
    const otApiUrl = 'https://content-chromeorigintrials-pa.googleapis.com/v1/trials?prettyPrint=false&key=AIzaSyDNwqPBcgaOul_h00xdxbIlOFiNUYyZCl8';
    const otRes = await fetch(otApiUrl, {
      headers: {
        "x-origin": "https://developer.chrome.com"
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!otRes.ok) {
      throw new Error(`HTTP error! status: ${otRes.status} fetching OT API`);
    }
    const otApiData = await otRes.json();
    await fs.writeFile(
      path.join(rawDir, 'ot-api-trials.json'),
      JSON.stringify(otApiData)
    );
    console.log(`Saved raw live authoritative Origin Trials API feed to data/raw/ot-api-trials.json`);
  } catch (err) {
    console.warn("Warning: Failed to fetch live authoritative Origin Trials API feed. Continuing compilation fallback paths.", err);
  }

  console.log("Raw data download complete.");
}

main().catch(err => {
  console.error("Fatal error downloading raw data:", err);
  process.exit(1);
});
