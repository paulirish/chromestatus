import fs from 'node:fs/promises';
import path from 'node:path';

async function fetchCleanJson(url: string): Promise<any> {
  console.log(`Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status} fetching ${url}`);
  }
  let text = await res.text();
  if (text.startsWith(")]}'")) {
    text = text.replace(/^\)\]\}'\n?/, '');
  }
  return JSON.parse(text);
}

async function main() {
  const rawDir = path.resolve(process.cwd(), 'data', 'raw');
  await fs.mkdir(rawDir, { recursive: true });

  console.log("Starting raw data download into data/raw/...");

  // 1. Verbose features
  console.log("Fetching verbose data pagination metadata...");
  const initialData = await fetchCleanJson('https://chromestatus.com/api/v0/features?num=1');
  const totalCount: unknown = initialData.total_count;
  if (typeof totalCount !== 'number') {
    throw new Error(`Invalid API response: total_count is not a number.`);
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

  console.log("Raw data download complete.");
}

main().catch(err => {
  console.error("Fatal error downloading raw data:", err);
  process.exit(1);
});
