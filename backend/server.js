import fs from 'fs';
import path from 'path';
import express from 'express';
import https from 'https';
import { WebSocketServer } from 'ws';
import os from 'os';
import multer from 'multer';
import { createAuth } from './auth/index.js';

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
const DATASET_DIR = path.join(process.cwd(), 'dataset');
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

const app = express();
app.disable('x-powered-by');

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
    auth = await createAuth({ port: PORT });
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
const wss = new WebSocketServer({ noServer: true });

// WebSocket paths and the minimum role each one requires.
const WS_ROUTES = {
    '/ws-stream': 'operator',
    '/ws-view': 'viewer',
};

function rejectUpgrade(socket, status, text) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
}

// Authenticate before the WebSocket handshake completes.
server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const pathname = new URL(req.url || '/', 'https://localhost').pathname;
    const minRole = WS_ROUTES[pathname];
    if (!minRole) return rejectUpgrade(socket, 404, 'Not Found');

    let result;
    try {
        result = await auth.authenticateUpgrade(req);
    } catch {
        return rejectUpgrade(socket, 500, 'Internal Server Error');
    }
    if (!result) return rejectUpgrade(socket, 401, 'Unauthorized');
    if (!auth.roleAtLeast(result.role, minRole)) return rejectUpgrade(socket, 403, 'Forbidden');

    wss.handleUpgrade(req, socket, head, ws => {
        req.argusPath = pathname;
        req.argusUser = { ...result.identity, role: result.role };
        wss.emit('connection', ws, req);
    });
});

// Connections
let streamer = null;
const viewers = new Set();

wss.on('connection', (ws, req) => {
    const isStreamer = req.argusPath === '/ws-stream';
    const who = req.argusUser?.email || req.argusUser?.sub || 'unknown';

    if (isStreamer) {
        console.log(`📱 Streamer connected (${who})`);
        streamer = ws;
        viewers.forEach(viewer => {
            if (streamer.readyState === ws.OPEN) streamer.send(JSON.stringify({ type: 'viewer-ready' }));
            if (viewer.readyState === ws.OPEN) viewer.send(JSON.stringify({ type: 'streamer-present' }));
        });
    } else {
        console.log(`💻 Viewer connected (${who})`);
        viewers.add(ws);
        if (streamer && streamer.readyState === ws.OPEN) {
            streamer.send(JSON.stringify({ type: 'viewer-ready' }));
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'streamer-present' }));
        }
    }

    ws.on('message', (message) => {
        // Relay everything
        if (isStreamer) {
            viewers.forEach(viewer => {
                if (viewer.readyState === ws.OPEN) {
                    viewer.send(message.toString());
                }
            });
        } else if (!isStreamer && streamer && streamer.readyState === ws.OPEN) {
            streamer.send(message.toString());
        }
    });

    ws.on('close', () => {
        if (isStreamer) {
            console.log('📱 Streamer disconnected');
            if (streamer === ws) streamer = null;
            viewers.forEach(viewer => {
                if (viewer.readyState === ws.OPEN) viewer.send(JSON.stringify({ type: 'streamer-gone' }))
            });
        } else {
            console.log('💻 Viewer disconnected');
            viewers.delete(ws);
            if (streamer && streamer.readyState === ws.OPEN) streamer.send(JSON.stringify({ type: 'viewer-gone' }));
        }
    });
});

// Create dataset/public dirs if not present
if (!fs.existsSync(DATASET_DIR)) fs.mkdirSync(DATASET_DIR);
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

// Everything under /dataset requires a signed-in user with at least the viewer role.
app.use('/dataset', requireRole('viewer'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, DATASET_DIR);
    },
    filename: (req, file, cb) => {
        const subject = req.body.subject || 'Unknown';
        const safeSubject = subject.replace(/[^a-zA-Z0-9]/g, '_');
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, safeSubject + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => cb(null, IMAGE_EXT.test(file.originalname || '')),
});

app.post('/dataset/upload', requireRole('admin'), upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image uploaded (JPG, PNG or WEBP)' });
    console.log(`🗂️  Dataset upload "${req.file.filename}" by ${req.user.email || req.user.sub}`);
    res.json({ success: true, file: req.file.filename });
});

app.delete('/dataset/:filename', requireRole('admin'), (req, res) => {
    const filename = req.params.filename;
    if (filename !== path.basename(filename) || filename.includes('..') || !IMAGE_EXT.test(filename)) {
        return res.status(403).json({ success: false, error: 'Invalid config' });
    }
    const filepath = path.join(DATASET_DIR, filename);
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
    }
    fs.unlinkSync(filepath);
    console.log(`🗑️  Dataset delete "${filename}" by ${req.user.email || req.user.sub}`);
    res.json({ success: true });
});

app.get('/dataset', (req, res) => {
    try {
        const files = fs.readdirSync(DATASET_DIR);
        const images = files.filter(f => IMAGE_EXT.test(f));
        res.json(images);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read dataset directory' });
    }
});

// Serve dataset images only (never logs.json or other files in the folder).
app.use('/dataset', (req, res, next) => {
    if (!IMAGE_EXT.test(req.path)) return res.status(404).end();
    next();
}, express.static(DATASET_DIR, { dotfiles: 'deny', index: false }));

// Activity Logs API
app.use(express.json({ limit: '64kb' }));

const LOGS_FILE = path.join(DATASET_DIR, 'logs.json');
if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, JSON.stringify([]));
}

app.get('/api/logs', requireRole('viewer'), (req, res) => {
    try {
        const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
        res.json(logs);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read logs' });
    }
});

app.post('/api/logs', requireRole('operator'), (req, res) => {
    try {
        const newLog = req.body;
        // { time, activity, type, severity, status, id }
        newLog.id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
        newLog.status = newLog.status || 'unreviewed';
        if (!newLog.time) {
            newLog.time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        newLog.actor = req.user.email || req.user.sub;

        const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
        logs.unshift(newLog); // Add to beginning

        // Keep only the latest 100 logs
        if (logs.length > 100) logs.pop();

        fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
        res.json({ success: true, log: newLog });
    } catch (e) {
        res.status(500).json({ error: 'Failed to write log' });
    }
});

app.patch('/api/logs/:id/status', requireRole('operator'), (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));

        const log = logs.find(l => l.id === id);
        if (log) {
            log.status = status;
            fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
            res.json({ success: true, log });
        } else {
            res.status(404).json({ error: 'Log not found' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to update log' });
    }
});

// Don't leak stack traces.
app.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: 'File too large (max 10MB)' });
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

      🔗 1) Open Viewer on Laptop : https://${IP}:${PORT}/view-stream
      🔗 2) Open Streamer on Phone: https://${IP}:${PORT}/stream-video

      [!] IMPORTANT regarding Self-Signed Certificates [!]
      If WebSockets fail to connect, ensure you have clicked "Advanced" -> "Proceed"
      on BOTH laptop and phone to bypass the Chrome/Safari certificate warnings.
    `);
});
