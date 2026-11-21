// Remove embedded metadata from uploaded images before they are stored.
//
// Phone photos routinely carry EXIF/XMP data: GPS coordinates of where the
// photo was taken, device make/model and serial, timestamps, sometimes a
// thumbnail of the original uncropped image. None of it is needed for face
// matching, and storing it alongside a person's face is an avoidable risk.
//
// The pixel data is left untouched (no re-encoding). Returns a new Buffer, or
// throws if the file's structure is not what its type says.

const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee]); // APP0 JFIF, APP2 ICC colour profile, APP14 Adobe colour transform

function stripJpeg(buf) {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('Not a JPEG');
    const out = [buf.subarray(0, 2)];
    let i = 2;
    while (i < buf.length) {
        if (buf[i] !== 0xff) throw new Error('Corrupt JPEG segment');
        const marker = buf[i + 1];
        if (marker === 0xff) { i += 1; continue; } // fill byte
        if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // start of scan: rest is image data
        if (marker === 0xd9) { out.push(buf.subarray(i, i + 2)); return Buffer.concat(out); }
        if (marker >= 0xd0 && marker <= 0xd7) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
        if (i + 4 > buf.length) throw new Error('Truncated JPEG');
        const len = buf.readUInt16BE(i + 2);
        const end = i + 2 + len;
        if (len < 2 || end > buf.length) throw new Error('Truncated JPEG');
        const isApp = marker >= 0xe0 && marker <= 0xef;
        const isComment = marker === 0xfe;
        if (!(isApp && !JPEG_KEEP_APP.has(marker)) && !isComment) out.push(buf.subarray(i, end));
        i = end;
    }
    throw new Error('JPEG has no image data');
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

function stripPng(buf) {
    if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('Not a PNG');
    const out = [PNG_SIG];
    let i = 8;
    while (i + 12 <= buf.length) {
        const len = buf.readUInt32BE(i);
        const type = buf.subarray(i + 4, i + 8).toString('latin1');
        const end = i + 12 + len;
        if (end > buf.length) throw new Error('Truncated PNG');
        if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
        i = end;
        if (type === 'IEND') return Buffer.concat(out);
    }
    throw new Error('PNG has no end chunk');
}

const WEBP_DROP = new Set(['EXIF', 'XMP ']);

function stripWebp(buf) {
    if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(8, 12).toString('latin1') !== 'WEBP') {
        throw new Error('Not a WEBP');
    }
    const chunks = [];
    let i = 12;
    while (i + 8 <= buf.length) {
        const type = buf.subarray(i, i + 4).toString('latin1');
        const len = buf.readUInt32LE(i + 4);
        const end = i + 8 + len + (len % 2); // chunks are padded to even length
        if (i + 8 + len > buf.length) throw new Error('Truncated WEBP');
        if (!WEBP_DROP.has(type)) {
            let chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
            // VP8X header flags say whether EXIF (bit 3) / XMP (bit 2) chunks exist; clear them.
            if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~0x0c;
            chunks.push(chunk);
        }
        i = end;
    }
    const body = Buffer.concat(chunks);
    const header = Buffer.alloc(12);
    header.write('RIFF', 0, 'latin1');
    header.writeUInt32LE(4 + body.length, 4);
    header.write('WEBP', 8, 'latin1');
    return Buffer.concat([header, body]);
}

export function stripImageMetadata(buf, ext) {
    if (ext === '.jpg' || ext === '.jpeg') return stripJpeg(buf);
    if (ext === '.png') return stripPng(buf);
    if (ext === '.webp') return stripWebp(buf);
    throw new Error(`Unsupported image type ${ext}`);
}
