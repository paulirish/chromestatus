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
  const dataDir = path.resolve(process.cwd(), 'data');
  const featuresDir = path.join(dataDir, 'features');
  
  await fs.mkdir(featuresDir, { recursive: true });

  console.log("Starting Option 1 verbose data collection...");
  const initialData = await fetchCleanJson('https://chromestatus.com/api/v0/features?num=1');
  const totalCount: number = initialData.total_count;
  console.log(`Total features reported by API: ${totalCount}`);

  const option1Features: any[] = [];
  const pageSize = 1000;
  for (let start = 0; start < totalCount; start += pageSize) {
    const pageData = await fetchCleanJson(`https://chromestatus.com/api/v0/features?num=${pageSize}&start=${start}`);
    if (pageData?.features && Array.isArray(pageData.features)) {
      option1Features.push(...pageData.features);
    }
  }

  // Deduplicate and sort by ID
  const seenIds = new Set<number>();
  const uniqueOption1: any[] = [];
  const activeOtIds: number[] = [];

  for (const f of option1Features) {
    if (f && f.id && !seenIds.has(f.id)) {
      seenIds.add(f.id);
      uniqueOption1.push(f);

      // Check Origin Trial assignment
      const hasOtStage = f.stages?.some((s: any) => s.stage_type === 150);
      if (hasOtStage || f.browsers?.chrome?.origintrial === true) {
        activeOtIds.push(f.id);
      }
    }
  }
  uniqueOption1.sort((a, b) => Number(a.id) - Number(b.id));
  activeOtIds.sort((a, b) => a - b);

  console.log(`Writing ${uniqueOption1.length} granular verbose JSON chunks to data/features/...`);
  for (const f of uniqueOption1) {
    await fs.writeFile(
      path.join(featuresDir, `${f.id}.json`), 
      JSON.stringify(f)
    );
  }

  console.log(`Writing ${activeOtIds.length} Active Origin Trial index IDs to data/active-ot-index.json...`);
  await fs.writeFile(
    path.join(dataDir, 'active-ot-index.json'),
    JSON.stringify(activeOtIds)
  );

  console.log("\nStarting Option 2 Lite array fetch...");
  const option2Data = await fetchCleanJson('https://chromestatus.com/features.json');
  const option2Features: any[] = Array.isArray(option2Data) ? option2Data : option2Data.features || [];
  
  const cleanOption2 = option2Features.filter(f => f && f.id);
  cleanOption2.sort((a, b) => Number(a.id) - Number(b.id));

  console.log(`Writing ${cleanOption2.length} flattened base records to data/lite.json...`);
  await fs.writeFile(
    path.join(dataDir, 'lite.json'),
    JSON.stringify(cleanOption2)
  );

  console.log("\nData collection and compilation complete.");
}

main().catch(err => {
  console.error("Fatal error fetching data:", err);
  process.exit(1);
});
