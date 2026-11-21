// Paired camera devices (phones) and per-device streaming rooms.
//
// Pairing: a signed-in operator requests a one-time code; the phone redeems it
// and receives a long-lived device token in an httpOnly cookie. Only a SHA-256
// hash of the token is stored. Devices can be revoked at any time, which also
// disconnects them.
//
// Streaming: each device is its own room. Only that device may stream into it,
// and a new connection from the same device replaces the old one.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const DEVICE_COOKIE = 'argus.device';
const DEVICE_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const PAIRING_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH = 8;
const PAIR_ATTEMPTS_PER_WINDOW = 10;
const PAIR_WINDOW_MS = 10 * 60 * 1000;

const sha256 = s => crypto.createHash('sha256').update(s).digest();

function randomCode() {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let out = '';
    for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]; // 256 % 32 === 0: unbiased
    return out;
}

function parseCookies(header) {
    const out = {};
    for (const part of String(header || '').split(';')) {
        const i = part.indexOf('=');
        if (i < 0) continue;
        const k = part.slice(0, i).trim();
        if (!k || k in out) continue;
        try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
    }
    return out;
}

export function createDeviceRegistry(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });

    let devices = [];
    try {
        devices = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (!Array.isArray(devices)) devices = [];
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(`❌ Could not read ${file}: ${e.message}. No devices will be able to stream until it is fixed.`);
            // Keep an empty list in memory but never overwrite the broken file.
            devices = null;
        }
    }

    function save() {
        if (devices === null) throw new Error('Device registry is unreadable; refusing to overwrite it');
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(devices, null, 2), { mode: 0o600 });
        fs.renameSync(tmp, file);
    }

    const pending = new Map();   // code -> { name, createdBy, expiresAt }
    const attempts = new Map();  // ip -> { count, resetAt }
    const sockets = new Map();   // deviceId -> ws (the streamer)
    const viewers = new Map();   // deviceId -> Set<ws>

    function active() {
        return (devices || []).filter(d => !d.revokedAt);
    }

    function publicView(d) {
        return {
            id: d.id,
            name: d.name,
            createdBy: d.createdBy,
            createdAt: d.createdAt,
            lastSeenAt: d.lastSeenAt || null,
            online: sockets.has(d.id),
        };
    }

    function createPairing(name, createdBy) {
        const cleanName = String(name || '').trim().slice(0, 60) || 'Phone camera';
        const now = Date.now();
        for (const [c, p] of pending) if (p.expiresAt <= now) pending.delete(c);
        let code;
        do { code = randomCode(); } while (pending.has(code));
        const expiresAt = now + PAIRING_TTL_MS;
        pending.set(code, { name: cleanName, createdBy, expiresAt });
        return { code, name: cleanName, expiresAt: new Date(expiresAt).toISOString() };
    }

    /** Returns true if this IP may attempt another pairing right now. */
    function allowAttempt(ip) {
        const now = Date.now();
        const a = attempts.get(ip);
        if (!a || a.resetAt <= now) {
            attempts.set(ip, { count: 1, resetAt: now + PAIR_WINDOW_MS });
            return true;
        }
        a.count += 1;
        return a.count <= PAIR_ATTEMPTS_PER_WINDOW;
    }

    /** Redeem a pairing code. Returns { device, token } or null. */
    function redeem(code) {
        const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const p = pending.get(normalized);
        if (!p) return null;
        pending.delete(normalized); // single use, even if it turns out expired
        if (p.expiresAt <= Date.now()) return null;

        const id = crypto.randomUUID();
        const secret = crypto.randomBytes(32).toString('base64url');
        const device = {
            id,
            name: p.name,
            tokenHash: sha256(secret).toString('hex'),
            createdBy: p.createdBy,
            createdAt: new Date().toISOString(),
            lastSeenAt: null,
            revokedAt: null,
        };
        devices.push(device);
        save();
        return { device, token: `${id}.${secret}` };
    }

    /** Resolve the device from a request's cookie, or null. Constant-time hash compare. */
    function deviceFromRequest(req) {
        const raw = parseCookies(req.headers.cookie)[DEVICE_COOKIE];
        if (!raw) return null;
        const dot = raw.indexOf('.');
        if (dot <= 0) return null;
        const id = raw.slice(0, dot);
        const secret = raw.slice(dot + 1);
        const device = active().find(d => d.id === id);
        if (!device) return null;
        const expected = Buffer.from(device.tokenHash, 'hex');
        const actual = sha256(secret);
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
        return device;
    }

    function revoke(id, by) {
        const device = active().find(d => d.id === id);
        if (!device) return false;
        device.revokedAt = new Date().toISOString();
        device.revokedBy = by;
        save();
        const ws = sockets.get(id);
        if (ws) ws.close(4401, 'Device revoked');
        return device;
    }

    function exists(id) {
        return active().some(d => d.id === id);
    }

    function list() {
        return active().map(publicView);
    }

    function touch(device) {
        device.lastSeenAt = new Date().toISOString();
        try { save(); } catch (e) { console.error(e.message); }
    }

    function cookieOptions() {
        return { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: DEVICE_COOKIE_MAX_AGE_MS };
    }

    return {
        createPairing, allowAttempt, redeem, deviceFromRequest, revoke, exists, list, touch,
        cookieOptions, publicView, sockets, viewers,
    };
}

// --- Relay -------------------------------------------------------------------

// Only WebRTC signalling passes through the relay, in the expected direction.
const FROM_STREAMER = new Set(['offer', 'ice']);
const FROM_VIEWER = new Set(['answer', 'ice', 'request-restart']);

function parseSignal(data, allowed) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return null; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || !allowed.has(msg.type)) return null;
    return JSON.stringify(msg);
}

const send = (ws, obj) => { if (ws.readyState === ws.OPEN) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };

// Without an 'error' listener, a protocol error on ONE socket (e.g. a frame over
// maxPayload) is an unhandled 'error' event and crashes the whole server.
// ws closes the socket itself after emitting the error; we only need to log it.
function guard(ws, label) {
    ws.on('error', err => console.warn(`⚠️  WebSocket error (${label}): ${err.code || err.message}`));
}

/** Attach a paired device's streaming socket to its room. */
export function attachStreamer(registry, device, ws) {
    const { sockets, viewers } = registry;
    guard(ws, `streamer ${device.id}`);
    const previous = sockets.get(device.id);
    if (previous && previous !== ws) previous.close(4000, 'Replaced by a newer connection from this device');
    sockets.set(device.id, ws);
    registry.touch(device);
    console.log(`📱 Streamer connected: "${device.name}" (${device.id})`);

    const room = viewers.get(device.id) || new Set();
    room.forEach(v => send(v, { type: 'streamer-present' }));
    if (room.size > 0) send(ws, { type: 'viewer-ready' });

    ws.on('message', data => {
        const msg = parseSignal(data, FROM_STREAMER);
        if (!msg) return;
        (viewers.get(device.id) || []).forEach(v => send(v, msg));
    });

    ws.on('close', () => {
        if (sockets.get(device.id) !== ws) return; // already replaced
        sockets.delete(device.id);
        console.log(`📱 Streamer disconnected: "${device.name}"`);
        (viewers.get(device.id) || []).forEach(v => send(v, { type: 'streamer-gone' }));
    });
}

/** Attach a signed-in viewer's socket to a device's room. */
export function attachViewer(registry, deviceId, user, ws) {
    const { sockets, viewers } = registry;
    guard(ws, `viewer ${user.email || user.sub}`);
    if (!viewers.has(deviceId)) viewers.set(deviceId, new Set());
    const room = viewers.get(deviceId);
    room.add(ws);
    console.log(`💻 Viewer ${user.email || user.sub} watching ${deviceId}`);

    const streamer = sockets.get(deviceId);
    if (streamer) {
        send(streamer, { type: 'viewer-ready' });
        send(ws, { type: 'streamer-present' });
    }

    ws.on('message', data => {
        const msg = parseSignal(data, FROM_VIEWER);
        if (!msg) return;
        const s = sockets.get(deviceId);
        if (s) send(s, msg);
    });

    ws.on('close', () => {
        room.delete(ws);
        if (room.size === 0) viewers.delete(deviceId);
        const s = sockets.get(deviceId);
        if (s) send(s, { type: 'viewer-gone' });
    });
}
