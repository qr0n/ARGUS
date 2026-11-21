// Private storage for case-profile face photos.
//
// Photos are never published as static files. Every read goes through an
// authenticated route that calls send(), so a permission check always happens
// first. This interface is what a cloud implementation (e.g. private S3 with
// short-lived signed URLs returned from send()) will also implement.
//
// Interface:
//   list()                    -> Promise<string[]>   image names
//   save(subject, buf, ext)   -> Promise<string>     stored name (never overwrites)
//   remove(name)              -> Promise<boolean>
//   send(res, name)           -> Promise<boolean>    writes the image, false if missing

import fs from 'fs';
import path from 'path';

export const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Detect the real image type from the file's first bytes. Returns an extension or null. */
export function sniffImageExt(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
    if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp';
    return null;
}

/** "Jane Doe" -> "jane_doe". Matches the label convention the dashboard uses. */
export function subjectToBase(subject) {
    const base = String(subject || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
    return base || null;
}

/** A stored name is a plain file name with an image extension: no paths, no dots tricks. */
export function isValidStoredName(name) {
    return typeof name === 'string'
        && name === path.basename(name)
        && /^[A-Za-z0-9][A-Za-z0-9_-]*\.(jpe?g|png|webp)$/i.test(name);
}

export function createLocalFaceStore(dir) {
    fs.mkdirSync(dir, { recursive: true });

    async function list() {
        const files = await fs.promises.readdir(dir);
        return files.filter(isValidStoredName).sort((a, b) => a.localeCompare(b));
    }

    // Pick "jane_doe.jpg", or "jane_doe_2.jpg", "jane_doe_3.jpg"... if taken.
    // The dashboard groups "_<n>" suffixes under one person, so extra photos
    // of the same subject add to their profile instead of replacing it.
    async function save(subject, buf, ext) {
        const base = subjectToBase(subject);
        if (!base) throw Object.assign(new Error('Invalid subject name'), { status: 400 });
        const taken = new Set((await list()).map(n => n.replace(IMAGE_EXT, '').toLowerCase()));
        for (let i = 1; i < 1000; i++) {
            const stem = i === 1 ? base : `${base}_${i}`;
            if (taken.has(stem)) continue;
            const name = stem + ext;
            try {
                // 'wx' fails if the file appeared in the meantime: never overwrite.
                await fs.promises.writeFile(path.join(dir, name), buf, { flag: 'wx', mode: 0o600 });
                return name;
            } catch (e) {
                if (e.code === 'EEXIST') continue;
                throw e;
            }
        }
        throw Object.assign(new Error('Too many photos for this subject'), { status: 409 });
    }

    async function remove(name) {
        if (!isValidStoredName(name)) return false;
        try {
            await fs.promises.unlink(path.join(dir, name));
            return true;
        } catch (e) {
            if (e.code === 'ENOENT') return false;
            throw e;
        }
    }

    async function send(res, name) {
        if (!isValidStoredName(name)) return false;
        const file = path.join(dir, name);
        try {
            await fs.promises.access(file, fs.constants.R_OK);
        } catch {
            return false;
        }
        res.set({
            'Content-Type': CONTENT_TYPES[path.extname(name).toLowerCase()],
            // Biometric data: don't leave copies in shared browser caches.
            'Cache-Control': 'private, no-store',
            'Content-Disposition': 'inline',
        });
        await new Promise((resolve, reject) => {
            const stream = fs.createReadStream(file);
            stream.on('error', reject);
            res.on('finish', resolve);
            res.on('close', resolve);
            stream.pipe(res);
        });
        return true;
    }

    return { kind: 'local', list, save, remove, send };
}
