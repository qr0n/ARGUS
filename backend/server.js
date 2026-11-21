import fs from 'fs';
import path from 'path';
import express from 'express';
import https from 'https';
import { WebSocketServer } from 'ws';
import os from 'os';
import multer from 'multer';
import { createAuth } from './auth/index.js';
import { createLocalFaceStore, sniffImageExt, isValidStoredName } from './storage/faces.js';
import { createLogStore } from './storage/logs.js';
import { migrateLegacyDataset } from './storage/migrate.js';
import { createDeviceRegistry, attachStreamer, attachViewer, DEVICE_COOKIE } from './devices.js';

// Get local IPv4 address for logging
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const PORT = 3000;
// 0.0.0.0 lets a phone on the same Wi-Fi connect. Set ARGUS_BIND_HOST=127.0.0.1
// to keep the server reachable from this machine only.
const BIND_HOST = process.env.ARGUS_BIND_HOST || '0.0.0.0';
const IP = getLocalIp();
// Address phones use to reach this server (pairing links, streamer page origin).
const STREAM_BASE_URL = (process.env.ARGUS_STREAM_URL || `https://${IP}:${PORT}`).replace(/\/+$/, '');

// Private data (face photos, activity log). Never served as static files.
const DATA_DIR = path.resolve(process.env.ARGUS_DATA_DIR || path.join(process.cwd(), 'data'));
migrateLegacyDataset(path.join(process.cwd(), 'dataset'), DATA_DIR);
const faces = createLocalFaceStore(path.join(DATA_DIR, 'faces'));
const activityLog = createLogStore(path.join(DATA_DIR, 'logs.json'));
const devices = createDeviceRegistry(path.join(DATA_DIR, 'devices.json'));

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
    });
    next();
});

// Verify certs exist
try {
    fs.accessSync('cert.pem', fs.constants.R_OK);
    fs.accessSync('key.pem', fs.constants.R_OK);
} catch (e) {
    console.error('❌ SSL Certificates not found. Run `npm run setup` first.');
    process.exit(1);
}

let auth;
try {
    // The phone streamer page is opened at the LAN address, so allow that origin too.
    auth = await createAuth({ port: PORT, extraOrigins: [STREAM_BASE_URL] });
} catch (e) {
    console.error(`❌ Auth configuration error: ${e.message}`);
    process.exit(1);
}
const { requireRole } = auth;
auth.install(app);

const sslOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(sslOptions, app);
// Signalling messages are small; cap frames to stop memory abuse.
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
wss.on('error', err => console.warn(`⚠️  WebSocket server error: ${err.message}`));

function rejectUpgrade(socket, status, text) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
}

// Authenticate before the WebSocket handshake completes.
//   /ws-stream             paired device (device cookie) streams into its own room
//   /ws-view?device=<id>   signed-in user (viewer or above) watches one device
server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const url = new URL(req.url || '/', 'https://localhost');

    if (!auth.isAllowedOrigin(req.headers.origin)) return rejectUpgrade(socket, 403, 'Forbidden');

    if (url.pathname === '/ws-stream') {
        const device = devices.deviceFromRequest(req);
        if (!device) return rejectUpgrade(socket, 401, 'Unauthorized');
        return wss.handleUpgrade(req, socket, head, ws => attachStreamer(devices, device, ws));
    }

    if (url.pathname === '/ws-view') {
        const deviceId = url.searchParams.get('device') || '';
        let result;
        try {
            result = await auth.authenticateUpgrade(req);
        } catch {
            return rejectUpgrade(socket, 500, 'Internal Server Error');
        }
        if (!result) return rejectUpgrade(socket, 401, 'Unauthorized');
        if (!auth.roleAtLeast(result.role, 'viewer')) return rejectUpgrade(socket, 403, 'Forbidden');
        if (!devices.exists(deviceId)) return rejectUpgrade(socket, 404, 'Not Found');
        const user = { ...result.identity, role: result.role };
        return wss.handleUpgrade(req, socket, head, ws => attachViewer(devices, deviceId, user, ws));
    }

    rejectUpgrade(socket, 404, 'Not Found');
});

// --- Camera devices ------------------------------------------------------------
app.use('/api', express.json({ limit: '16kb' }));

// List paired devices and whether each is streaming.
app.get('/api/devices', requireRole('viewer'), (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(devices.list());
});

// Start pairing a phone: returns a one-time code and the link to open on the phone.
app.post('/api/devices/pairing', requireRole('operator'), (req, res) => {
    const pairing = devices.createPairing(req.body?.name, req.user.email || req.user.sub);
    res.set('Cache-Control', 'no-store');
    res.json({ ...pairing, pairUrl: `${STREAM_BASE_URL}/stream-video#code=${pairing.code}` });
});

// Called by the phone: redeem a pairing code for a device cookie. No user sign-in;
// the one-time code is the credential, so attempts are rate-limited per address.
app.post('/api/devices/pair', async (req, res, next) => {
    try {
        if (!devices.allowAttempt(req.socket.remoteAddress || 'unknown')) {
            return res.status(429).json({ success: false, error: 'Too many attempts. Wait a few minutes and try again.' });
        }
        const result = devices.redeem(req.body?.code);
        if (!result) return res.status(400).json({ success: false, error: 'Invalid or expired pairing code' });
        res.cookie(DEVICE_COOKIE, result.token, devices.cookieOptions());
        console.log(`📱 Paired device "${result.device.name}" (${result.device.id}), code issued by ${result.device.createdBy}`);
        await activityLog.append(
            { activity: `Paired camera device "${result.device.name}".`, type: 'device', severity: 'info', status: 'reviewing' },
            result.device.createdBy,
        ).catch(e => console.error('Failed to write audit log entry:', e.message));
        res.json({ success: true, device: devices.publicView(result.device) });
    } catch (e) {
        next(e);
    }
});

// Called by the phone: is this phone paired?
app.get('/api/devices/self', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const device = devices.deviceFromRequest(req);
    if (!device) return res.status(401).json({ success: false, error: 'This device is not paired' });
    res.json(devices.publicView(device));
});

// Revoke a device; disconnects it immediately.
app.delete('/api/devices/:id', requireRole('operator'), async (req, res) => {
    const actor = req.user.email || req.user.sub;
    const device = devices.revoke(req.params.id, actor);
    if (!device) return res.status(404).json({ success: false, error: 'Device not found' });
    console.log(`📱 Device "${device.name}" (${device.id}) revoked by ${actor}`);
    await activityLog.append(
        { activity: `Removed camera device "${device.name}".`, type: 'device', severity: 'warning', status: 'reviewing' },
        actor,
    ).catch(e => console.error('Failed to write audit log entry:', e.message));
    res.json({ success: true });
});

if (!fs.existsSync('public')) fs.mkdirSync('public');

// Public, non-sensitive assets: static pages (they hold no data themselves)
// and the face-api model weights.
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/models', express.static(path.join(process.cwd(), 'models')));

app.get('/stream-video', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'stream-video.html'));
});

app.get('/view-stream', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'view-stream.html'));
});

const actorOf = req => req.user.email || req.user.sub;

// Server-side audit entry. Failures are logged but never block the action itself.
async function audit(req, activity, type, severity = 'info') {
    try {
        await activityLog.append({ activity, type, severity, status: 'reviewing' }, actorOf(req));
    } catch (e) {
        console.error('Failed to write audit log entry:', e.message);
    }
}

// --- Case-profile face photos ------------------------------------------------
// Every route below requires at least the viewer role. Photos are streamed
// from private storage only after that check; they are never static files.
app.use('/dataset', requireRole('viewer'));

// Keep uploads in memory (max 10 MB) so the content can be verified before
// anything is written to storage.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5, fieldSize: 1024 },
});

app.post('/dataset/upload', requireRole('admin'), upload.single('photo'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No photo uploaded' });
        const ext = sniffImageExt(req.file.buffer);
        if (!ext) return res.status(400).json({ success: false, error: 'File is not a JPG, PNG or WEBP image' });
        const subject = typeof req.body.subject === 'string' ? req.body.subject : '';
        const name = await faces.save(subject, req.file.buffer, ext);
        console.log(`🗂️  Dataset upload "${name}" by ${actorOf(req)}`);
        await audit(req, `Added photo "${name}" to Case Profiles.`, 'upload');
        res.json({ success: true, file: name });
    } catch (e) {
        if (e.status) return res.status(e.status).json({ success: false, error: e.message });
        next(e);
    }
});

app.delete('/dataset/:filename', requireRole('admin'), async (req, res, next) => {
    try {
        const name = req.params.filename;
        if (!isValidStoredName(name)) return res.status(400).json({ success: false, error: 'Invalid file name' });
        if (!(await faces.remove(name))) return res.status(404).json({ success: false, error: 'File not found' });
        console.log(`🗑️  Dataset delete "${name}" by ${actorOf(req)}`);
        await audit(req, `Removed photo "${name}" from Case Profiles.`, 'delete', 'warning');
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

app.get('/dataset', async (req, res, next) => {
    try {
        res.set('Cache-Control', 'private, no-store');
        res.json(await faces.list());
    } catch (e) {
        next(e);
    }
});

app.get('/dataset/:filename', async (req, res, next) => {
    try {
        if (!(await faces.send(res, req.params.filename))) res.status(404).end();
    } catch (e) {
        next(e);
    }
});

// --- Activity log ------------------------------------------------------------

app.get('/api/logs', requireRole('viewer'), async (req, res, next) => {
    try {
        res.set('Cache-Control', 'private, no-store');
        res.json(await activityLog.list());
    } catch (e) {
        next(e);
    }
});

app.post('/api/logs', requireRole('operator'), async (req, res, next) => {
    try {
        const log = await activityLog.append(req.body, actorOf(req));
        res.json({ success: true, log });
    } catch (e) {
        if (e.status) return res.status(e.status).json({ success: false, error: e.message });
        next(e);
    }
});

app.patch('/api/logs/:id/status', requireRole('operator'), async (req, res, next) => {
    try {
        const log = await activityLog.setStatus(req.params.id, req.body?.status, actorOf(req));
        if (!log) return res.status(404).json({ success: false, error: 'Log not found' });
        res.json({ success: true, log });
    } catch (e) {
        if (e.status) return res.status(e.status).json({ success: false, error: e.message });
        next(e);
    }
});

// Don't leak stack traces.
app.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: 'File too large (max 10MB)' });
    }
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, error: 'Invalid upload' });
    }
    // Client errors raised by body parsers (malformed JSON, body too large, ...).
    const status = err?.status || err?.statusCode;
    if (status >= 400 && status < 500) {
        return res.status(status).json({ success: false, error: 'Invalid request' });
    }
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

server.listen(PORT, BIND_HOST, () => {
    console.log(`
      ✅ ARGUS Live Camera Server Running (HTTPS API & WSS over TLS)
      🔒 Sign-in providers: ${[...auth.providers.keys()].join(', ')}
      📡 Listening on  : ${BIND_HOST}:${PORT}${BIND_HOST === '0.0.0.0' ? `  (reachable on your network at https://${IP}:${PORT})` : ''}
      🖥️  Localhost     : https://localhost:${PORT}

      🔗 Dashboard → Live Camera → "Pair a phone" to connect a phone camera.
      📱 Phones reach this server at ${STREAM_BASE_URL}

      [!] IMPORTANT regarding Self-Signed Certificates [!]
      If WebSockets fail to connect, ensure you have clicked "Advanced" -> "Proceed"
      on BOTH laptop and phone to bypass the Chrome/Safari certificate warnings.
    `);
});
