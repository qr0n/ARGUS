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

const app = express();

// Explicit CORS Bypass for Vite Localhost
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
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
    const url = req.url;
    const streamerM = url.match(/^\/ws-stream(-(\d+))?$/);
    const viewerM   = url.match(/^\/ws-view(-(\d+))?$/);

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
        const subject = req.body.subject || 'Unknown';
        const safeSubject = subject.replace(/[^a-zA-Z0-9]/g, '_');
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, safeSubject + ext);
    }
});
const upload = multer({ storage });

app.post('/dataset/upload', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    res.json({ success: true, file: req.file.filename });
});

app.delete('/dataset/:filename', (req, res) => {
    const filename = req.params.filename;
    if (filename.includes('..') || filename.includes('/')) {
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

// Activity Logs API
app.use(express.json());

const LOGS_FILE = path.join(process.cwd(), 'dataset', 'logs.json');
if (!fs.existsSync(LOGS_FILE)) {
    fs.writeFileSync(LOGS_FILE, JSON.stringify([]));
}

app.get('/api/logs', (req, res) => {
    try {
        const logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
        res.json(logs);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read logs' });
    }
});

app.post('/api/logs', (req, res) => {
    try {
        const newLog = req.body;
        // { time, activity, type, severity, status, id }
        newLog.id = Date.now().toString() + Math.floor(Math.random() * 10000).toString();
        newLog.status = newLog.status || 'unreviewed';
        if (!newLog.time) {
            newLog.time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        
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

app.patch('/api/logs/:id/status', (req, res) => {
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
