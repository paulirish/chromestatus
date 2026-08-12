import fs from 'node:fs';
import path from 'node:path';

export interface EmpiricalSupport {
  majorVersion: number;
  fullVersion: string;
}

export class EmpiricalSupportIndex {
  private supportMap = new Map<string, EmpiricalSupport>();

  /**
   * Chronologically processes collector run results and registers the earliest positive version.
   */
  static loadFromDir(resultsDir: string): EmpiricalSupportIndex {
    const index = new EmpiricalSupportIndex();
    if (!fs.existsSync(resultsDir)) return index;

    const filenameRegex = /^[0-9.]+-chrome-([0-9.]+)-windows-[0-9a-zA-Z.-]+-[0-9a-f]+\.json$/;
    const files = fs.readdirSync(resultsDir)
      .map(filename => {
        const match = filename.match(filenameRegex);
        return match ? { filename, majorVersion: parseInt(match[1].split('.')[0], 10), fullVersion: match[1] } : null;
      })
      .filter((file): file is { filename: string; majorVersion: number; fullVersion: string } => file !== null)
      .sort((a, b) => a.majorVersion - b.majorVersion);

    for (const fileInfo of files) {
      const filePath = path.join(resultsDir, fileInfo.filename);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!content?.results) continue;
        for (const testList of Object.values(content.results)) {
          if (!Array.isArray(testList)) continue;
          for (const entry of testList) {
            if (entry?.name && entry.result === true) {
              if (!index.supportMap.has(entry.name)) {
                index.supportMap.set(entry.name, {
                  majorVersion: fileInfo.majorVersion,
                  fullVersion: fileInfo.fullVersion
                });
              }
            }
          }
        }
      } catch {
        // Graceful error isolation
      }
    }
    return index;
  }

  getSupport(bcdKey: string): EmpiricalSupport | undefined {
    return this.supportMap.get(bcdKey);
  }
}
