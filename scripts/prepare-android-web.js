import fs from 'node:fs/promises';
import path from 'node:path';

let removed = 0;

for (const downloads of [path.resolve('dist/downloads'), path.resolve('android/app/src/main/assets/public/downloads')]) {
  try {
    for (const name of await fs.readdir(downloads)) {
      if (!name.endsWith('.apk')) continue;
      await fs.rm(path.join(downloads, name));
      removed += 1;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

console.log(`Prepared Android web assets without ${removed} embedded APK file${removed === 1 ? '' : 's'}.`);
