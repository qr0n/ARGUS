// One-time move of data from the old web-served folder (backend/dataset/) into
// private storage (backend/data/). Runs at startup; does nothing once done.
// Files are moved, not copied, so no stray copies of face photos are left behind.

import fs from 'fs';
import path from 'path';
import { IMAGE_EXT } from './faces.js';

export function migrateLegacyDataset(legacyDir, dataDir) {
    if (!fs.existsSync(legacyDir)) return;

    const facesDir = path.join(dataDir, 'faces');
    fs.mkdirSync(facesDir, { recursive: true });

    const moved = [];
    const skipped = [];
    for (const name of fs.readdirSync(legacyDir)) {
        const from = path.join(legacyDir, name);
        if (!fs.statSync(from).isFile()) { skipped.push(name); continue; }

        let to = null;
        if (IMAGE_EXT.test(name)) to = path.join(facesDir, name);
        else if (name === 'logs.json') to = path.join(dataDir, 'logs.json');

        if (!to || fs.existsSync(to)) { skipped.push(name); continue; }
        fs.renameSync(from, to);
        moved.push(name);
    }

    if (moved.length) {
        console.log(`📦 Moved ${moved.length} file(s) from ${legacyDir} into private storage at ${dataDir}`);
    }
    if (skipped.length) {
        console.warn(`⚠️  Left in ${legacyDir} (already present in private storage or not recognised): ${skipped.join(', ')}`);
        console.warn('   Review and delete that folder by hand once you are sure nothing is needed.');
    } else {
        fs.rmSync(legacyDir, { recursive: true, force: true });
    }
}
