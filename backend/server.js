import fs from 'fs';
import path from 'path';
import express from 'express';
import https from 'https';
import { WebSocketServer } from 'ws';
import os from 'os';
import multer from 'multer';

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
const IP = getLocalIp();
const LOGS_LIMIT = 100;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const KNOWN_TOKENS = {
    admin: process.env.ARGUS_ADMIN_TOKEN || '',
    operator: process.env.ARGUS_OPERATOR_TOKEN || '',
    viewer: process.env.ARGUS_VIEWER_TOKEN || '',
};
const AUTH_ENABLED = Object.values(KNOWN_TOKENS).some(Boolean);

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
    return req.socket.remoteAddress || 'unknown';
}

function normalizeOrigin(origin = '') {
    try {
        const u = new URL(origin);
        return `${u.protocol}//${u.host}`;
    } catch {
        return '';
    }
}

const DEFAULT_ALLOWED_ORIGINS = [
    `https://localhost:${PORT}`,
    `https://127.0.0.1:${PORT}`,
    'https://localhost:5173',
    'https://127.0.0.1:5173',
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
const allowedOriginSet = new Set(
    (process.env.ARGUS_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
        .split(',')
        .map(s => normalizeOrigin(s.trim()))
        .filter(Boolean)
);

function getRoleFromRequest(req) {
    if (!AUTH_ENABLED) return 'admin';
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    if (!token) return null;
    if (token === KNOWN_TOKENS.admin) return 'admin';
    if (token === KNOWN_TOKENS.operator) return 'operator';
    if (token === KNOWN_TOKENS.viewer) return 'viewer';
    return null;
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        const role = getRoleFromRequest(req);
        if (!role || !allowedRoles.includes(role)) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        req.argusRole = role;
        next();
    };
}

const rateState = new Map();
function createRateLimiter({ windowMs, maxRequests }) {
    return (req, res, next) => {
        const now = Date.now();
        const key = `${getClientIp(req)}:${req.path}`;
        const current = rateState.get(key);
        if (!current || now >= current.resetAt) {
            rateState.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        if (current.count >= maxRequests) {
            const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
            res.setHeader('Retry-After', retryAfter.toString());
            return res.status(429).json({ success: false, error: 'Rate limit exceeded' });
        }
        current.count += 1;
        next();
    };
}

const mutationRateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 120 });

function sanitizeSubject(subject) {
    const text = String(subject || 'Unknown').trim();
    const cleaned = text.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 64);
    return cleaned || 'Unknown';
}

function isAllowedImageFile(file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    return ALLOWED_IMAGE_EXT.has(ext);
}

function isValidLogStatus(status) {
    return ['unreviewed', 'reviewing', 'reviewed', 'verified', 'dismissed'].includes(status);
}

function validateLogPayload(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Invalid body' };
    if (!payload.activity || typeof payload.activity !== 'string' || !payload.activity.trim()) {
        return { ok: false, error: 'Activity is required' };
    }
    if (payload.type && typeof payload.type !== 'string') return { ok: false, error: 'Invalid type' };
    if (payload.severity && !['info', 'warning', 'high'].includes(payload.severity)) {
        return { ok: false, error: 'Invalid severity' };
    }
    if (payload.status && !isValidLogStatus(payload.status)) {
        return { ok: false, error: 'Invalid status' };
    }
    return { ok: true };
}

function readJsonFile(filepath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch {
        return fallback;
    }
}

function writeJsonFileAtomic(filepath, payload) {
    const tmp = `${filepath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, filepath);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// CORS allowlist (configurable via ARGUS_ALLOWED_ORIGINS)
app.use((req, res, next) => {
    const reqOrigin = normalizeOrigin(req.headers.origin || '');
    if (!reqOrigin || allowedOriginSet.has(reqOrigin)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
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

const sslOptions = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(sslOptions, app);
const wss = new WebSocketServer({ server });

// Connections — dynamic channels (slot 1 = default, slot N = /ws-stream-N)
const streamers = new Map();   // slot -> ws
const viewers = new Map();     // slot -> Set<ws>

function getViewers(ch) {
    if (!viewers.has(ch)) viewers.set(ch, new Set());
    return viewers.get(ch);
}

wss.on('connection', (ws, req) => {
    const parsed = new URL(req.url || '/', 'https://localhost');
    const pathname = parsed.pathname || '';
    if (AUTH_ENABLED) {
        const wsToken = parsed.searchParams.get('token') || '';
        const valid = wsToken && Object.values(KNOWN_TOKENS).includes(wsToken);
        if (!valid) { ws.close(1008, 'Unauthorized'); return; }
    }
    const streamerM = pathname.match(/^\/ws-stream(-(\d+))?$/);
    const viewerM   = pathname.match(/^\/ws-view(-(\d+))?$/);

    if (!streamerM && !viewerM) { ws.close(); return; } // unknown path

    const ch = streamerM
        ? (streamerM[2] ? parseInt(streamerM[2]) : 1)
        : (viewerM[2]   ? parseInt(viewerM[2])   : 1);
    const isStreamer = !!streamerM;
    const chViewers = getViewers(ch);

    if (isStreamer) {
        console.log(`📱 Streamer ${ch} connected`);
        streamers.set(ch, ws);
        chViewers.forEach(viewer => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'viewer-ready' }));
            if (viewer.readyState === ws.OPEN) viewer.send(JSON.stringify({ type: 'streamer-present' }));
        });
    } else {
        console.log(`💻 Viewer connected (channel ${ch})`);
        chViewers.add(ws);
        const str = streamers.get(ch);
        if (str && str.readyState === ws.OPEN) {
            str.send(JSON.stringify({ type: 'viewer-ready' }));
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'streamer-present' }));
        }
    }

    ws.on('message', (message) => {
        if (isStreamer) {
            getViewers(ch).forEach(viewer => {
                if (viewer.readyState === ws.OPEN) viewer.send(message.toString());
            });
        } else {
            const str = streamers.get(ch);
            if (str && str.readyState === ws.OPEN) str.send(message.toString());
        }
    });

    ws.on('close', () => {
        if (isStreamer) {
            console.log(`📱 Streamer ${ch} disconnected`);
            streamers.delete(ch);
            getViewers(ch).forEach(viewer => {
                if (viewer.readyState === ws.OPEN) viewer.send(JSON.stringify({ type: 'streamer-gone' }));
            });
        } else {
            console.log(`💻 Viewer disconnected (channel ${ch})`);
            getViewers(ch).delete(ws);
            const str = streamers.get(ch);
            if (str && str.readyState === ws.OPEN) str.send(JSON.stringify({ type: 'viewer-gone' }));
        }
    });
});

// App routing and static files
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/models', express.static(path.join(process.cwd(), 'models')));
app.use('/dataset', express.static(path.join(process.cwd(), 'dataset')));

// Create dataset/public dirs if not present
if (!fs.existsSync('dataset')) fs.mkdirSync('dataset');
if (!fs.existsSync('public')) fs.mkdirSync('public');

app.get('/stream-video', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'stream-video.html'));
});

app.get('/view-stream', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'view-stream.html'));
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(process.cwd(), 'dataset'));
    },
    filename: (req, file, cb) => {
        const safeSubject = sanitizeSubject(req.body.subject);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${safeSubject}${ALLOWED_IMAGE_EXT.has(ext) ? ext : '.jpg'}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, cb) => {
        if (!isAllowedImageFile(file)) return cb(new Error('Invalid file type'));
        cb(null, true);
    }
});

app.post('/dataset/upload', mutationRateLimiter, requireRole('admin', 'operator'), upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    res.json({ success: true, file: req.file.filename });
});

app.delete('/dataset/:filename', mutationRateLimiter, requireRole('admin'), (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes('..') || filename.includes('/')) {
        return res.status(403).json({ success: false, error: 'Invalid config' });
    }
    const filepath = path.join(process.cwd(), 'dataset', filename);
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
    }
    fs.unlinkSync(filepath);
    res.json({ success: true });
});

app.get('/dataset', (req, res) => {
    try {
        const files = fs.readdirSync(path.join(process.cwd(), 'dataset'));
        const images = files.filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png') || f.toLowerCase().endsWith('.jpeg'));
        res.json(images);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read dataset directory' });
    }
});

const LOGS_FILE = path.join(process.cwd(), 'dataset', 'logs.json');
if (!fs.existsSync(LOGS_FILE)) {
    writeJsonFileAtomic(LOGS_FILE, []);
}

app.get('/api/logs', (req, res) => {
    try {
        const logs = readJsonFile(LOGS_FILE, []);
        res.json(logs);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read logs' });
    }
});

app.post('/api/logs', mutationRateLimiter, requireRole('admin', 'operator'), (req, res) => {
    try {
        const validity = validateLogPayload(req.body);
        if (!validity.ok) {
            return res.status(400).json({ success: false, error: validity.error });
        }
        const newLog = {
            activity: String(req.body.activity).trim(),
            type: req.body.type || 'system',
            severity: req.body.severity || 'info',
            source: req.body.source || 'argus',
            modelVersion: req.body.modelVersion || process.env.ARGUS_MODEL_VERSION || 'face-api/ssdMobilenetv1+faceRecognitionNet@1',
            thresholdPolicy: req.body.thresholdPolicy || null,
            matchedLabel: req.body.matchedLabel || null,
            matchDistance: typeof req.body.matchDistance === 'number' ? req.body.matchDistance : null,
            matchConfidence: typeof req.body.matchConfidence === 'number' ? req.body.matchConfidence : null,
            reviewRequired: !!req.body.reviewRequired,
            id: Date.now().toString() + Math.floor(Math.random() * 10000).toString(),
            status: req.body.status || 'unreviewed',
            time: req.body.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        // { time, activity, type, severity, status, id }
        const logs = readJsonFile(LOGS_FILE, []);
        logs.unshift(newLog); // Add to beginning

        // Keep only the latest 100 logs
        while (logs.length > LOGS_LIMIT) logs.pop();

        writeJsonFileAtomic(LOGS_FILE, logs);
        res.json({ success: true, log: newLog });
    } catch (e) {
        res.status(500).json({ error: 'Failed to write log' });
    }
});

app.patch('/api/logs/:id/status', mutationRateLimiter, requireRole('admin', 'operator'), (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!isValidLogStatus(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const logs = readJsonFile(LOGS_FILE, []);

        const log = logs.find(l => l.id === id);
        if (log) {
            log.status = status;
            writeJsonFileAtomic(LOGS_FILE, logs);
            res.json({ success: true, log });
        } else {
            res.status(404).json({ error: 'Log not found' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to update log' });
    }
});

app.use((err, _req, res, _next) => {
    if (err && err.message === 'Invalid file type') {
        return res.status(400).json({ success: false, error: 'Only JPG, JPEG, PNG, WEBP allowed' });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: 'File too large (max 10MB)' });
    }
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
      ✅ ARGUS Live Camera Server Running (HTTPS API & WSS over TLS)
      📡 Network IP    : https://${IP}:${PORT}
      🖥️  Localhost     : https://localhost:${PORT}
  
      🔗 1) Open Viewer on Laptop : https://${IP}:${PORT}/view-stream
      🔗 2) Open Streamer on Phone: https://${IP}:${PORT}/stream-video
  
      [!] IMPORTANT regarding Self-Signed Certificates [!]
      If WebSockets fail to connect, ensure you have clicked "Advanced" -> "Proceed" 
      on BOTH laptop and phone to bypass the Chrome/Safari certificate warnings.
    `);
});
